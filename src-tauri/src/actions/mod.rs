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

/// Validates that a custom action target string does not contain malicious metacharacters,
/// UNC paths, dangerous protocols, or argument injection.
fn validate_custom_target(target: &str) -> Result<(), String> {
    if target.contains('\0') || target.contains('\r') || target.contains('\n') {
        return Err("Target contains invalid control characters".to_string());
    }
    if target.len() > 2048 {
        return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
    }

    // Prohibit remote SMB / UNC network paths and dangerous schemes to prevent NetNTLM credential leaks
    let lower = target.to_lowercase();
    if lower.starts_with(r"\\")
        || lower.starts_with("//")
        || lower.starts_with(r"\??\")
        || lower.starts_with("file:")
        || lower.starts_with("ms-msdt:")
        || lower.starts_with("search-ms:")
        || lower.starts_with("search:")
        || lower.starts_with("smb:")
        || lower.starts_with("dav:")
    {
        return Err("UNC network paths are prohibited".to_string());
    }

    // Prohibit shell command chaining, pipe, quotes, and redirection attacks
    if target.contains('&')
        || target.contains('|')
        || target.contains(';')
        || target.contains('`')
        || target.contains('>')
        || target.contains('<')
        || target.contains('"')
        || target.contains('\'')
    {
        return Err("Target contains prohibited shell metacharacters".to_string());
    }

    // If not a recognized safe URI scheme, validate as an executable target
    if !is_uri_target(target) {
        // Disallow dangerous shell interpreters and flags
        let forbidden_patterns = [
            "cmd.exe",
            "powershell",
            "pwsh",
            "wscript",
            "cscript",
            "mshta",
            "-enc",
            "-encodedcommand",
            "-command",
            "/c",
            "/k",
        ];
        for pat in forbidden_patterns {
            if lower.contains(pat) {
                return Err(format!("Command injection pattern detected: '{}'", pat));
            }
        }

        // Prohibit argument injection: targets with spaces must resolve to an existing file
        if target.contains(' ') && !std::path::Path::new(target).is_file() {
            return Err("Custom executable paths cannot contain unquoted arguments".to_string());
        }

        // Prohibit dangerous script extensions
        let path = std::path::Path::new(target);
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            let dangerous_exts = [
                "bat", "cmd", "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1", "psd1",
                "hta", "url",
            ];
            if dangerous_exts.contains(&ext_lower.as_str()) {
                return Err(format!(
                    "File extension '{}' is not an allowed executable",
                    ext_lower
                ));
            }
        }
    }

    Ok(())
}

/// Returns true if the target looks like an allowlisted URI scheme or shell URI.
fn is_uri_target(target: &str) -> bool {
    let lower = target.to_lowercase();
    if lower.starts_with("file:")
        || lower.starts_with("smb:")
        || lower.starts_with("dav:")
        || lower.starts_with("ms-msdt:")
        || lower.starts_with("search-ms:")
    {
        return false;
    }
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("ms-settings:")
        || lower.starts_with("ms-")
        || lower.starts_with("shell:")
        || lower.starts_with("mailto:")
        || lower.starts_with("steam://")
}

#[cfg(target_os = "windows")]
pub fn execute_resolved_action(resolved: &ResolvedAction) -> Result<(), String> {
    match resolved {
        ResolvedAction::Uri(uri) => launch_shell_execute(uri),
        ResolvedAction::Executable(exe) => launch_shell_execute(exe),
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
    tokio::task::spawn_blocking(move || execute_resolved_action(&resolved))
        .await
        .map_err(|e| format!("Action task join failed: {}", e))?
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
        let snapshot = cm
            .update_config(|config| {
                config
                    .quick_settings_instances
                    .insert(instance.id.clone(), instance);
                Ok(config.clone())
            })
            .await
            .map_err(|e| e.to_string())?;

        use tauri::Emitter;
        let _ = app.emit("config-changed", &snapshot);
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
    #[test]
    fn test_resolve_custom_action_prohibits_unc_paths() {
        let unc_targets = [
            r"\\attacker.com\share\file.exe",
            r"\\10.0.0.1\c$\leak",
            "//evil.com/share",
            "//localhost/share",
            r"\??\UNC\attacker.com\share",
            "file://attacker.com/share/poc.exe",
            r"file:\\attacker.com\share\poc.exe",
            "file:///C:/Windows/System32/cmd.exe",
            "ms-msdt:id%20PCWDiagnostic",
            "search-ms:query=test&crumb=location:\\\\evil\\share",
            "search:query=test",
            "smb://attacker.com/share",
            "dav://attacker.com/share",
        ];
        for target in unc_targets {
            let res = resolve_action_target("custom", Some(target));
            assert!(
                res.is_err(),
                "UNC target '{}' should have been prohibited",
                target
            );
            assert!(
                res.unwrap_err().contains("UNC network paths are prohibited"),
                "Expected UNC prohibition error for '{}'",
                target
            );
        }
    }

    #[test]
    fn test_resolve_custom_action_prohibits_argument_injection() {
        let bad_executables = [
            "cmd.exe /c calc.exe",
            "powershell.exe -WindowStyle Hidden -Command calc",
            "pwsh -command calc",
            "calc.exe --arg1 --arg2",
            "notepad.exe \"C:\\secret.txt\"",
            "notepad.exe 'C:\\secret.txt'",
            "wscript.exe script.vbs",
            "cscript.exe script.vbs",
            "mshta.exe exploit.hta",
            "script.bat",
            "run.cmd",
            "malicious.vbs",
            "payload.ps1",
            "shortcut.url",
        ];

        for bad in bad_executables {
            let res = resolve_action_target("custom", Some(bad));
            assert!(
                res.is_err(),
                "Target '{}' should have been rejected for security reasons",
                bad
            );
        }
    }

    #[tokio::test]
    async fn test_execute_quick_action_async_non_blocking() {
        // Safe predefined action should resolve and execute via spawn_blocking
        #[cfg(not(windows))]
        {
            let res = execute_quick_action("recyclebin".to_string(), None).await;
            assert!(res.is_ok());
        }
        // Unknown action returns Err without spawning
        let err = execute_quick_action("non_existent_action".to_string(), None).await;
        assert!(err.is_err());
    }
}
