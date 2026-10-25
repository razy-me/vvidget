use tauri::Manager;

/// Resolved target to execute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedAction {
    Uri(String),
    Executable(String),
}

/// Resolves an action identifier to a safe Windows target URI or executable command.
pub fn resolve_action_target(
    action_id: &str,
    custom_target: Option<&str>,
) -> Result<ResolvedAction, String> {
    match action_id {
        "sound" => Ok(ResolvedAction::Uri("ms-settings:sound".to_string())),
        "bluetooth" => Ok(ResolvedAction::Uri("ms-settings:bluetooth".to_string())),
        "display" => Ok(ResolvedAction::Uri("ms-settings:display".to_string())),
        "nightlight" => Ok(ResolvedAction::Uri("ms-settings:nightlight".to_string())),
        "network" => Ok(ResolvedAction::Uri("ms-settings:network".to_string())),
        "powersleep" => Ok(ResolvedAction::Uri("ms-settings:powersleep".to_string())),
        "recyclebin" => Ok(ResolvedAction::Uri("shell:RecycleBinFolder".to_string())),
        "taskmanager" => Ok(ResolvedAction::Executable("taskmgr.exe".to_string())),
        "custom" => {
            let target = custom_target
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Custom target path or URL is required for custom action".to_string())?;

            validate_custom_target(target)?;

            if is_uri_target(target) {
                Ok(ResolvedAction::Uri(target.to_string()))
            } else {
                Ok(ResolvedAction::Executable(target.to_string()))
            }
        }
        unknown => Err(format!("Unknown action identifier: '{}'", unknown)),
    }
}

/// Validates that a custom action target string does not contain malicious metacharacters or control sequences.
fn validate_custom_target(target: &str) -> Result<(), String> {
    if target.contains('\0') || target.contains('\r') || target.contains('\n') {
        return Err("Target contains invalid control characters".to_string());
    }
    if target.len() > 2048 {
        return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
    }
    // Prohibit shell command chaining, pipe, and redirection attacks
    if target.contains('&') || target.contains('|') || target.contains(';') || target.contains('`') {
        return Err("Target contains prohibited shell metacharacters".to_string());
    }
    Ok(())
}

/// Returns true if the target looks like a URI scheme or shell URI.
fn is_uri_target(target: &str) -> bool {
    target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("ms-")
        || target.starts_with("shell:")
        || target.starts_with("mailto:")
        || target.starts_with("steam://")
        || target.contains("://")
}

#[cfg(target_os = "windows")]
pub fn execute_resolved_action(resolved: &ResolvedAction) -> Result<(), String> {
    match resolved {
        ResolvedAction::Uri(uri) => launch_shell_execute(uri),
        ResolvedAction::Executable(exe) => {
            if exe == "taskmgr.exe" {
                std::process::Command::new("taskmgr.exe")
                    .spawn()
                    .map_err(|e| format!("Failed to launch taskmgr: {}", e))?;
                Ok(())
            } else {
                launch_shell_execute(exe)
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn execute_resolved_action(resolved: &ResolvedAction) -> Result<(), String> {
    log::info!("Simulating execution of action: {:?}", resolved);
    Ok(())
}

#[cfg(target_os = "windows")]
fn launch_shell_execute(target: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide_target: Vec<u16> = OsStr::new(target).encode_wide().chain(Some(0)).collect();
    let wide_open: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();

    let res = unsafe {
        ShellExecuteW(
            HWND(std::ptr::null_mut()),
            PCWSTR(wide_open.as_ptr()),
            PCWSTR(wide_target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if (res.0 as usize) > 32 {
        Ok(())
    } else {
        Err(format!(
            "ShellExecuteW failed for target '{}' with code {}",
            target, res.0 as usize
        ))
    }
}

/// Executes a predefined or custom Windows action trigger.
#[tauri::command]
#[specta::specta]
pub async fn execute_quick_action(
    action_id: String,
    custom_target: Option<String>,
) -> Result<(), String> {
    let resolved = resolve_action_target(&action_id, custom_target.as_deref())?;
    execute_resolved_action(&resolved)
}

/// Updates the dynamic instance configuration for a Quick Settings widget.
#[tauri::command]
#[specta::specta]
pub async fn update_quick_settings_instance<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    instance: crate::config::QuickSettingsInstance,
) -> Result<(), String> {
    if instance.id.trim().is_empty() {
        return Err("Instance ID cannot be empty".to_string());
    }

    if let Some(cm) = app.try_state::<crate::config::ConfigManager>() {
        let mut config = cm.get_config().await;
        config
            .quick_settings_instances
            .insert(instance.id.clone(), instance);

        cm.save_immediate(config.clone())
            .await
            .map_err(|e| e.to_string())?;

        use tauri::Emitter;
        let _ = app.emit("config-changed", &config);
        Ok(())
    } else {
        Err("ConfigManager not available".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_predefined_system_actions() {
        assert_eq!(
            resolve_action_target("sound", None).unwrap(),
            ResolvedAction::Uri("ms-settings:sound".to_string())
        );
        assert_eq!(
            resolve_action_target("bluetooth", None).unwrap(),
            ResolvedAction::Uri("ms-settings:bluetooth".to_string())
        );
        assert_eq!(
            resolve_action_target("display", None).unwrap(),
            ResolvedAction::Uri("ms-settings:display".to_string())
        );
        assert_eq!(
            resolve_action_target("nightlight", None).unwrap(),
            ResolvedAction::Uri("ms-settings:nightlight".to_string())
        );
        assert_eq!(
            resolve_action_target("network", None).unwrap(),
            ResolvedAction::Uri("ms-settings:network".to_string())
        );
        assert_eq!(
            resolve_action_target("powersleep", None).unwrap(),
            ResolvedAction::Uri("ms-settings:powersleep".to_string())
        );
        assert_eq!(
            resolve_action_target("recyclebin", None).unwrap(),
            ResolvedAction::Uri("shell:RecycleBinFolder".to_string())
        );
        assert_eq!(
            resolve_action_target("taskmanager", None).unwrap(),
            ResolvedAction::Executable("taskmgr.exe".to_string())
        );
    }

    #[test]
    fn test_resolve_custom_action_uri() {
        assert_eq!(
            resolve_action_target("custom", Some("https://github.com")).unwrap(),
            ResolvedAction::Uri("https://github.com".to_string())
        );
        assert_eq!(
            resolve_action_target("custom", Some("ms-settings:privacy")).unwrap(),
            ResolvedAction::Uri("ms-settings:privacy".to_string())
        );
        assert_eq!(
            resolve_action_target("custom", Some("shell:Downloads")).unwrap(),
            ResolvedAction::Uri("shell:Downloads".to_string())
        );
    }

    #[test]
    fn test_resolve_custom_action_executable() {
        assert_eq!(
            resolve_action_target("custom", Some("C:\\Tools\\app.exe")).unwrap(),
            ResolvedAction::Executable("C:\\Tools\\app.exe".to_string())
        );
        assert_eq!(
            resolve_action_target("custom", Some("notepad.exe")).unwrap(),
            ResolvedAction::Executable("notepad.exe".to_string())
        );
    }

    #[test]
    fn test_resolve_custom_action_missing_target() {
        let err1 = resolve_action_target("custom", None).unwrap_err();
        assert!(err1.contains("required"));

        let err2 = resolve_action_target("custom", Some("   ")).unwrap_err();
        assert!(err2.contains("required"));
    }

    #[test]
    fn test_resolve_custom_action_disallows_shell_injection() {
        let bad_targets = [
            "cmd.exe /c calc & echo pwned",
            "notepad.exe | calc.exe",
            "test; rm -rf /",
            "test`calc`",
            "line1\nline2",
            "line1\rline2",
            "null\0byte",
        ];

        for bad in bad_targets {
            assert!(
                resolve_action_target("custom", Some(bad)).is_err(),
                "Target '{}' should have been rejected for security reasons",
                bad
            );
        }
    }

    #[test]
    fn test_resolve_unknown_action() {
        let err = resolve_action_target("non_existent_action", None).unwrap_err();
        assert!(err.contains("Unknown action identifier"));
    }
}
