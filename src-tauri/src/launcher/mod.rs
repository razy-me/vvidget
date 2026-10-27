use std::path::{Path, PathBuf};
use tauri::Manager;
use crate::config::LauncherItem;
use base64::Engine;

/// Helper to convert a local image or icon file to a data URL if it exists.
pub fn file_to_data_url(path: &Path) -> Option<String> {
    if !path.exists() || !path.is_file() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{};base64,{}", mime, encoded))
}

/// Attempts to find a Steam game icon in the candidate Steam roots.
pub fn find_steam_icon_url(appid: &str, steam_roots: &[PathBuf]) -> Option<String> {
    // 1. Check librarycache direct file or subdirectories: librarycache/<appid>_icon.jpg or <appid>/...
    for root in steam_roots {
        let librarycache_dir = root.join("appcache").join("librarycache");
        let direct_icon = librarycache_dir.join(format!("{}_icon.jpg", appid));
        if let Some(url) = file_to_data_url(&direct_icon) {
            return Some(url);
        }

        let app_cache_dir = librarycache_dir.join(appid);
        if app_cache_dir.is_dir() {
            // Check logo.png or any *.jpg / *.ico inside
            let logo_png = app_cache_dir.join("logo.png");
            if let Some(url) = file_to_data_url(&logo_png) {
                return Some(url);
            }
            if let Ok(entries) = std::fs::read_dir(&app_cache_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                        if (name.ends_with(".jpg") || name.ends_with(".png") || name.ends_with(".ico"))
                            && !name.contains("600x900")
                            && !name.contains("header")
                        {
                            if let Some(url) = file_to_data_url(&p) {
                                return Some(url);
                            }
                        }
                    }
                }
            }
        }

        // 2. Check steam/games/<hash>.ico
        let steam_games_dir = root.join("steam").join("games");
        if steam_games_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&steam_games_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        if ext == "ico" {
                            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                            if stem.starts_with(appid) || stem == appid {
                                if let Some(url) = file_to_data_url(&p) {
                                    return Some(url);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Parses key-value pairs from Valve's KeyValues (VDF) text format.
pub fn parse_vdf_key_values(content: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.is_empty() {
            continue;
        }

        let mut tokens = Vec::new();
        let mut in_quote = false;
        let mut token = String::new();
        let mut chars = trimmed.chars().peekable();

        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(&next) = chars.peek() {
                    if next == '\\' || next == '"' {
                        token.push(next);
                        chars.next();
                        continue;
                    }
                }
                token.push(c);
            } else if c == '"' {
                if in_quote {
                    tokens.push(token.clone());
                    token.clear();
                    in_quote = false;
                } else {
                    in_quote = true;
                }
            } else if in_quote {
                token.push(c);
            }
        }

        if tokens.len() >= 2 {
            pairs.push((tokens[0].clone(), tokens[1].clone()));
        }
    }
    pairs
}

/// Extracts Steam library folder paths from a `libraryfolders.vdf` file content.
pub fn parse_library_folders_vdf(content: &str) -> Vec<PathBuf> {
    let pairs = parse_vdf_key_values(content);
    let mut paths = Vec::new();

    for (k, v) in pairs {
        let k_lower = k.to_lowercase();
        if k_lower == "path" {
            let p = PathBuf::from(&v);
            if !paths.contains(&p) {
                paths.push(p);
            }
        } else if k.chars().all(|c| c.is_ascii_digit()) {
            // Older VDF format where key is folder index and value is the path
            if v.contains(":\\") || v.contains(":/") || v.starts_with('/') {
                let p = PathBuf::from(&v);
                if !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
    }
    paths
}

/// Parses an `appmanifest_*.acf` file to extract (appid, name, installdir).
pub fn parse_appmanifest_acf(content: &str) -> Option<(String, String, String)> {
    let pairs = parse_vdf_key_values(content);
    let mut appid = None;
    let mut name = None;
    let mut installdir = None;

    for (k, v) in pairs {
        match k.to_lowercase().as_str() {
            "appid" => {
                if appid.is_none() && !v.is_empty() {
                    appid = Some(v);
                }
            }
            "name" => {
                if name.is_none() && !v.is_empty() {
                    name = Some(v);
                }
            }
            "installdir" => {
                if installdir.is_none() && !v.is_empty() {
                    installdir = Some(v);
                }
            }
            _ => {}
        }
    }

    match (appid, name, installdir) {
        (Some(id), Some(n), Some(dir)) => Some((id, n, dir)),
        (Some(id), Some(n), None) => Some((id.clone(), n, id)),
        _ => None,
    }
}

/// Parses an Epic Games `*.item` JSON file to construct a `LauncherItem`.
pub fn parse_epic_manifest_item(content: &str) -> Option<LauncherItem> {
    let val: serde_json::Value = serde_json::from_str(content).ok()?;
    let obj = val.as_object()?;

    let app_name = obj.get("AppName")?.as_str()?.trim();
    if app_name.is_empty() {
        return None;
    }

    let display_name = obj
        .get("DisplayName")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(app_name);

    let uri = format!(
        "com.epicgames.launcher://apps/{}?action=launch&silent=true",
        app_name
    );

    Some(LauncherItem {
        id: format!("epic_{}", app_name),
        name: display_name.to_string(),
        path_or_uri: uri,
        icon_type: Some("epic".to_string()),
        icon_url: None,
        source: "epic".to_string(),
        last_launched: None,
    })
}

#[cfg(windows)]
pub(crate) mod reg {
    use std::ffi::c_void;
    use std::path::PathBuf;

    const HKEY_CURRENT_USER: isize = -2147483647; // 0x80000001
    const HKEY_LOCAL_MACHINE: isize = -2147483646; // 0x80000002
    const KEY_READ: u32 = 0x20019;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            hKey: *mut c_void,
            lpSubKey: *const u16,
            ulOptions: u32,
            samDesired: u32,
            phkResult: *mut *mut c_void,
        ) -> i32;

        fn RegQueryValueExW(
            hKey: *mut c_void,
            lpValueName: *const u16,
            lpReserved: *mut u32,
            lpType: *mut u32,
            lpData: *mut u8,
            lpcbData: *mut u32,
        ) -> i32;

        fn RegCloseKey(hKey: *mut c_void) -> i32;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn query_reg_string(root: isize, subkey: &str, value_name: &str) -> Option<String> {
        unsafe {
            let mut hkey: *mut c_void = std::ptr::null_mut();
            let wide_subkey = to_wide(subkey);
            let status = RegOpenKeyExW(
                root as *mut c_void,
                wide_subkey.as_ptr(),
                0,
                KEY_READ,
                &mut hkey,
            );
            if status != 0 || hkey.is_null() {
                return None;
            }

            let wide_val_name = to_wide(value_name);
            let mut val_type: u32 = 0;
            let mut buf = [0u8; 1024];
            let mut buf_len: u32 = buf.len() as u32;

            let query_status = RegQueryValueExW(
                hkey,
                wide_val_name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                buf.as_mut_ptr(),
                &mut buf_len,
            );

            RegCloseKey(hkey);

            if query_status != 0 || buf_len == 0 {
                return None;
            }

            let u16_slice = std::slice::from_raw_parts(
                buf.as_ptr() as *const u16,
                (buf_len as usize) / 2,
            );
            let trimmed_slice = match u16_slice.iter().position(|&c| c == 0) {
                Some(pos) => &u16_slice[..pos],
                None => u16_slice,
            };

            String::from_utf16(trimmed_slice).ok()
        }
    }

    pub fn query_steam_registry_roots() -> Vec<PathBuf> {
        let mut roots = Vec::new();

        if let Some(path_str) = query_reg_string(HKEY_CURRENT_USER, "Software\\Valve\\Steam", "SteamPath") {
            let p = PathBuf::from(path_str.trim().replace('/', "\\"));
            if p.exists() && p.is_dir() && !roots.contains(&p) {
                roots.push(p);
            }
        }

        if let Some(path_str) = query_reg_string(HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath") {
            let p = PathBuf::from(path_str.trim().replace('/', "\\"));
            if p.exists() && p.is_dir() && !roots.contains(&p) {
                roots.push(p);
            }
        }

        if let Some(path_str) = query_reg_string(HKEY_LOCAL_MACHINE, "SOFTWARE\\Valve\\Steam", "InstallPath") {
            let p = PathBuf::from(path_str.trim().replace('/', "\\"));
            if p.exists() && p.is_dir() && !roots.contains(&p) {
                roots.push(p);
            }
        }

        roots
    }
}

/// Scans the local filesystem for installed Steam games across all libraries.
pub fn scan_steam_games() -> Vec<LauncherItem> {
    let mut items = Vec::new();
    let mut library_paths = Vec::new();

    // Check candidate Steam installation root directories
    let mut candidate_roots = Vec::new();

    #[cfg(windows)]
    {
        for root in reg::query_steam_registry_roots() {
            if !candidate_roots.contains(&root) {
                candidate_roots.push(root);
            }
        }
    }

    if let Ok(prog_x86) = std::env::var("ProgramFiles(x86)") {
        candidate_roots.push(PathBuf::from(prog_x86).join("Steam"));
    }
    if let Ok(prog) = std::env::var("ProgramFiles") {
        candidate_roots.push(PathBuf::from(prog).join("Steam"));
    }
    candidate_roots.push(PathBuf::from("C:\\Program Files (x86)\\Steam"));
    candidate_roots.push(PathBuf::from("C:\\Program Files\\Steam"));
    candidate_roots.push(PathBuf::from("C:\\Steam"));
    candidate_roots.push(PathBuf::from("D:\\Steam"));
    candidate_roots.push(PathBuf::from("E:\\Steam"));

    for root in &candidate_roots {
        if root.exists() && root.is_dir() {
            let vdf_file = root.join("steamapps").join("libraryfolders.vdf");
            if vdf_file.exists() {
                if let Ok(vdf_content) = std::fs::read_to_string(&vdf_file) {
                    let parsed = parse_library_folders_vdf(&vdf_content);
                    for p in parsed {
                        if !library_paths.contains(&p) {
                            library_paths.push(p);
                        }
                    }
                }
            }
            if !library_paths.contains(root) {
                library_paths.push(root.clone());
            }
        }
    }

    // For each library, look in steamapps for appmanifest_*.acf
    for lib in library_paths {
        let steamapps_dir = if lib.ends_with("steamapps") {
            lib.clone()
        } else {
            lib.join("steamapps")
        };

        if !steamapps_dir.exists() || !steamapps_dir.is_dir() {
            continue;
        }

        let entries = match std::fs::read_dir(&steamapps_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("")
                .to_lowercase();

            if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                if let Ok(acf_content) = std::fs::read_to_string(&path) {
                    if let Some((appid, name, _installdir)) = parse_appmanifest_acf(&acf_content) {
                        // Filter out empty or redistributable/runtime utilities
                        if name.trim().is_empty()
                            || name == "Steamworks Common Redistributables"
                            || name.starts_with("Proton ")
                            || appid == "228980"
                        {
                            continue;
                        }

                        let icon_url = find_steam_icon_url(&appid, &candidate_roots);

                        let item = LauncherItem {
                            id: format!("steam_{}", appid),
                            name,
                            path_or_uri: format!("steam://rungameid/{}", appid),
                            icon_type: Some("steam".to_string()),
                            icon_url,
                            source: "steam".to_string(),
                            last_launched: None,
                        };

                        if !items.iter().any(|existing: &LauncherItem| existing.id == item.id) {
                            items.push(item);
                        }
                    }
                }
            }
        }
    }

    items
}

/// Scans Epic Games manifest directories for installed games.
pub fn scan_epic_games() -> Vec<LauncherItem> {
    let mut items = Vec::new();
    let mut manifests_dirs = Vec::new();

    if let Ok(prog_data) = std::env::var("ProgramData") {
        manifests_dirs.push(
            PathBuf::from(prog_data)
                .join("Epic")
                .join("EpicGamesLauncher")
                .join("Data")
                .join("Manifests"),
        );
    }
    manifests_dirs.push(PathBuf::from(
        "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
    ));

    for dir in manifests_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("item") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Some(item) = parse_epic_manifest_item(&content) {
                            if !items.iter().any(|existing: &LauncherItem| existing.id == item.id) {
                                items.push(item);
                            }
                        }
                    }
                }
            }
        }
    }

    items
}

/// Strictly validates target string against command injection and verifies path existence.
pub fn validate_launch_target(target: &str) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Launch target cannot be empty".to_string());
    }

    // Check control characters
    if trimmed.contains('\0') || trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("Launch target contains invalid control characters".to_string());
    }

    // Disallow command-line execution flags or shells
    let lower = trimmed.to_lowercase();
    let forbidden_patterns = [
        "cmd.exe",
        "powershell",
        "pwsh",
        "wscript",
        "cscript",
        "mshta",
        "-enc ",
        "-encodedcommand",
        "-command",
        "/c ",
        "/k ",
    ];
    for pat in forbidden_patterns {
        if lower.contains(pat) {
            return Err(format!("Command injection pattern detected: '{}'", pat));
        }
    }

    // Allowlisted URI schemes
    let allowlisted_schemes = [
        "steam://",
        "steam:",
        "com.epicgames.launcher://",
        "com.epicgames.launcher:",
        "https://",
        "http://",
    ];

    let is_scheme = allowlisted_schemes
        .iter()
        .any(|scheme| lower.starts_with(scheme));

    if is_scheme {
        if trimmed.contains(' ') {
            return Err("URI scheme target cannot contain spaces".to_string());
        }
        // Disallow dangerous shell command separators in URIs
        let uri_dangerous = ['|', ';', '>', '<', '"', '\'', '`', '$'];
        for dc in uri_dangerous {
            if trimmed.contains(dc) {
                return Err(format!("URI contains forbidden character: '{}'", dc));
            }
        }
        return Ok(());
    }

    // Disallow shell operators and chaining characters in paths
    let dangerous_path_chars = ['|', ';', '>', '<', '"', '`'];
    for dc in dangerous_path_chars {
        if trimmed.contains(dc) {
            return Err(format!(
                "Launch target contains forbidden shell character: '{}'",
                dc
            ));
        }
    }

    // Prohibit remote SMB / UNC network paths and dangerous schemes to prevent NetNTLM credential leaks
    if lower.starts_with(r"\\")
        || lower.starts_with("//")
        || lower.starts_with(r"\??\")
        || lower.starts_with("file:")
        || lower.starts_with("smb:")
        || lower.starts_with("dav:")
    {
        return Err("UNC network paths are prohibited".to_string());
    }

    // If not a scheme, must be an absolute file path that exists on disk
    let path = Path::new(trimmed);
    #[cfg(windows)]
    {
        use std::path::Component;
        if let Some(Component::Prefix(prefix_comp)) = path.components().next() {
            match prefix_comp.kind() {
                std::path::Prefix::UNC(..) | std::path::Prefix::VerbatimUNC(..) => {
                    return Err("UNC network paths are prohibited".to_string());
                }
                _ => {}
            }
        }
    }

    if !path.is_absolute() {
        return Err("Target must be an allowlisted URI scheme or an absolute file path".to_string());
    }

    if !path.exists() {
        return Err(format!("Target file does not exist: {}", trimmed));
    }

    if !path.is_file() {
        return Err(format!("Target path is not a file: {}", trimmed));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let allowed_extensions = ["exe", "lnk"];
    if !allowed_extensions.contains(&ext.as_str()) {
        return Err(format!(
            "File extension '{}' is not an allowed executable or shortcut",
            ext
        ));
    }

    Ok(())
}

/// Tauri command: scans for installed games from Steam and Epic Games.
#[tauri::command]
#[specta::specta]
pub async fn scan_installed_games() -> Result<Vec<LauncherItem>, String> {
    tokio::task::spawn_blocking(|| {
        let mut games = scan_steam_games();
        let mut epic_games = scan_epic_games();
        games.append(&mut epic_games);

        // Sort alphabetically by name
        games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        games
    })
    .await
    .map_err(|e| format!("Game scan task join failed: {}", e))
}

/// Tauri command: launches an allowlisted URI or verified local executable via ShellExecuteW.
#[tauri::command]
#[specta::specta]
pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
    validate_launch_target(&target)?;

    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::{w, PCWSTR};
            use windows::Win32::Foundation::HWND;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_target: Vec<u16> = std::ffi::OsStr::new(&target)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let path = std::path::Path::new(&target);
            let parent_dir = if path.is_file() {
                path.parent().map(|p| {
                    std::ffi::OsStr::new(p)
                        .encode_wide()
                        .chain(std::iter::once(0))
                        .collect::<Vec<u16>>()
                })
            } else {
                None
            };
            let wide_dir_ptr = match &parent_dir {
                Some(d) => PCWSTR(d.as_ptr()),
                None => PCWSTR::null(),
            };

            unsafe {
                let res = ShellExecuteW(
                    HWND(core::ptr::null_mut()),
                    w!("open"),
                    PCWSTR(wide_target.as_ptr()),
                    PCWSTR::null(),
                    wide_dir_ptr,
                    SW_SHOWNORMAL,
                );
                let code = res.0 as usize;
                if code <= 32 {
                    return Err(format!("ShellExecuteW failed with error code: {}", code));
                }
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = target;
            Ok(())
        }
    })
    .await
    .map_err(|e| format!("Launch task join failed: {}", e))?
}

/// Tauri command: adds or updates a custom launcher item in persistent AppConfig.
#[tauri::command]
#[specta::specta]
pub async fn add_custom_launcher_item<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    mut item: LauncherItem,
) -> Result<(), String> {
    let trimmed_name = item.name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Item name cannot be empty".to_string());
    }
    item.name = trimmed_name;

    let trimmed_target = item.path_or_uri.trim().to_string();
    if trimmed_target.is_empty() {
        return Err("Item path or URI cannot be empty".to_string());
    }
    validate_launch_target(&trimmed_target)?;
    item.path_or_uri = trimmed_target;

    if item.id.trim().is_empty() {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        item.id = format!("custom_{}", millis);
    }
    if item.source.trim().is_empty() {
        item.source = "custom".to_string();
    }

    if let Some(cm) = app.try_state::<crate::config::ConfigManager>() {
        let snapshot = cm
            .update_config(|config| {
                if let Some(existing) = config.launcher_items.iter_mut().find(|i| i.id == item.id) {
                    *existing = item;
                } else {
                    config.launcher_items.push(item);
                }
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

/// Tauri command: removes a custom launcher item from persistent AppConfig.
#[tauri::command]
#[specta::specta]
pub async fn remove_launcher_item<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), String> {
    if let Some(cm) = app.try_state::<crate::config::ConfigManager>() {
        let snapshot = cm
            .update_config(|config| {
                let initial_len = config.launcher_items.len();
                config.launcher_items.retain(|i| i.id != id);
                let changed = config.launcher_items.len() != initial_len;
                Ok((changed, config.clone()))
            })
            .await
            .map_err(|e| e.to_string())?;

        if snapshot.0 {
            use tauri::Emitter;
            let _ = app.emit("config-changed", &snapshot.1);
        }
        Ok(())
    } else {
        Err("ConfigManager not available".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_library_folders_vdf_modern_format() {
        let vdf = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"2119753171675619613"
		"totalsize"		"0"
		"apps"
		{
			"620"		"125678"
		}
	}
	"1"
	{
		"path"		"D:\\Games\\SteamLibrary"
		"label"		"SSD"
	}
}
"#;
        let paths = parse_library_folders_vdf(vdf);
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[0], PathBuf::from("C:\\Program Files (x86)\\Steam"));
        assert_eq!(paths[1], PathBuf::from("D:\\Games\\SteamLibrary"));
    }

    #[test]
    fn test_parse_library_folders_vdf_legacy_format() {
        let vdf = r#"
"LibraryFolders"
{
	"TimeNextStatsReport"		"123456789"
	"ContentStatsID"		"987654321"
	"1"		"E:\\SteamLibrary"
	"2"		"F:\\Games\\Steam"
}
"#;
        let paths = parse_library_folders_vdf(vdf);
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[0], PathBuf::from("E:\\SteamLibrary"));
        assert_eq!(paths[1], PathBuf::from("F:\\Games\\Steam"));
    }

    #[test]
    fn test_parse_appmanifest_acf() {
        let acf = r#"
"AppState"
{
	"appid"		"620"
	"Universe"		"1"
	"name"		"Portal 2"
	"StateFlags"		"4"
	"installdir"		"Portal 2"
	"LastUpdated"		"1700000000"
}
"#;
        let result = parse_appmanifest_acf(acf);
        assert!(result.is_some());
        let (appid, name, installdir) = result.unwrap();
        assert_eq!(appid, "620");
        assert_eq!(name, "Portal 2");
        assert_eq!(installdir, "Portal 2");
    }

    #[test]
    fn test_parse_epic_manifest_item() {
        let json = r#"{
  "FormatVersion": 0,
  "AppVersionString": "1.0.0",
  "AppName": "Fortnite",
  "DisplayName": "Fortnite Battle Royale",
  "InstallLocation": "C:\\Program Files\\Epic Games\\Fortnite"
}"#;
        let result = parse_epic_manifest_item(json);
        assert!(result.is_some());
        let item = result.unwrap();
        assert_eq!(item.id, "epic_Fortnite");
        assert_eq!(item.name, "Fortnite Battle Royale");
        assert_eq!(
            item.path_or_uri,
            "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true"
        );
        assert_eq!(item.source, "epic");
        assert_eq!(item.icon_type, Some("epic".to_string()));
        assert_eq!(item.icon_url, None);
    }

    #[test]
    fn test_file_to_data_url_and_find_steam_icon() {
        let temp_dir = std::env::temp_dir().join("vvidget_steam_test");
        let _ = std::fs::create_dir_all(&temp_dir);
        let test_file = temp_dir.join("620_icon.jpg");
        let fake_jpg_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF";
        let _ = std::fs::write(&test_file, fake_jpg_bytes);

        let data_url = file_to_data_url(&test_file);
        assert!(data_url.is_some());
        let url_str = data_url.unwrap();
        assert!(url_str.starts_with("data:image/jpeg;base64,"));

        // Test non-existent file
        assert!(file_to_data_url(&temp_dir.join("nonexistent.ico")).is_none());

        // Test find_steam_icon_url with custom mock steam root
        let mock_steam = temp_dir.join("mock_steam");
        let mock_cache = mock_steam.join("appcache").join("librarycache");
        let _ = std::fs::create_dir_all(&mock_cache);
        let _ = std::fs::write(mock_cache.join("620_icon.jpg"), fake_jpg_bytes);

        let found = find_steam_icon_url("620", &[mock_steam.clone()]);
        assert!(found.is_some());
        assert!(found.unwrap().starts_with("data:image/jpeg;base64,"));

        // Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_validate_launch_target_allowlisted_uris() {
        assert!(validate_launch_target("steam://rungameid/620").is_ok());
        assert!(validate_launch_target("steam:rungameid/1942280").is_ok());
        assert!(validate_launch_target(
            "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true"
        )
        .is_ok());
        assert!(validate_launch_target("https://play.geforcenow.com").is_ok());
        assert!(validate_launch_target("http://localhost:3000").is_ok());
    }

    #[test]
    fn test_validate_launch_target_security_injection() {
        // Empty
        assert!(validate_launch_target("").is_err());
        assert!(validate_launch_target("   ").is_err());

        // Dangerous chaining characters
        assert!(validate_launch_target("steam://rungameid/620 & calc.exe").is_err());
        assert!(validate_launch_target("steam://rungameid/620; whoami").is_err());
        assert!(validate_launch_target("steam://rungameid/620 | dir").is_err());
        assert!(validate_launch_target("steam://rungameid/620 > output.txt").is_err());

        // Shell executions and flags
        assert!(validate_launch_target("cmd.exe /c calc.exe").is_err());
        assert!(validate_launch_target("powershell -enc aW52b2tl").is_err());
        assert!(validate_launch_target("pwsh -command calc").is_err());
        assert!(validate_launch_target("mshta vbscript:msgbox(1)").is_err());

        // URIs with spaces
        assert!(validate_launch_target("https://example.com/test with spaces").is_err());

        // Relative path
        assert!(validate_launch_target("relative/path/game.exe").is_err());

        // Non-existent path
        assert!(validate_launch_target("C:\\Windows\\NonExistentGame12345.exe").is_err());
    }

    #[test]
    fn test_validate_launch_target_existing_executable() {
        // notepad.exe or calc.exe always exists in System32 on Windows
        #[cfg(windows)]
        {
            let notepad = PathBuf::from("C:\\Windows\\System32\\notepad.exe");
            if notepad.exists() {
                assert!(validate_launch_target("C:\\Windows\\System32\\notepad.exe").is_ok());
            }
        }
    }

    #[test]
    fn test_validate_launch_target_paths_with_ampersand_and_apostrophe() {
        let temp_dir = std::env::temp_dir().join("vvidget_launch_test");
        let dir_with_amp = temp_dir.join("Rockstar Games & Media");
        let _ = std::fs::create_dir_all(&dir_with_amp);
        let test_exe = dir_with_amp.join("game.exe");
        let _ = std::fs::write(&test_exe, b"MZ");

        let target_str = test_exe.to_string_lossy().to_string();
        let res = validate_launch_target(&target_str);
        assert!(res.is_ok(), "Expected valid target with '&', got: {:?}", res);

        let dir_with_quote = temp_dir.join("O'Connor");
        let _ = std::fs::create_dir_all(&dir_with_quote);
        let test_exe2 = dir_with_quote.join("app.exe");
        let _ = std::fs::write(&test_exe2, b"MZ");

        let target_str2 = test_exe2.to_string_lossy().to_string();
        let res2 = validate_launch_target(&target_str2);
        assert!(res2.is_ok(), "Expected valid target with ''', got: {:?}", res2);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_scan_installed_games_async() {
        let res = scan_installed_games().await;
        assert!(res.is_ok(), "scan_installed_games should return Ok: {:?}", res);
    }

    #[test]
    fn test_validate_launch_target_prohibits_unc_and_dangerous_schemes() {
        let unc_targets = [
            r"\\attacker-server\share\game.exe",
            r"\\192.168.1.50\c$\game.exe",
            "//evil.com/share/payload.exe",
            "//localhost/share/poc.exe",
            r"\??\UNC\evil.com\share\file.exe",
            "file://attacker.com/share/poc.exe",
            r"file:\\attacker.com\share\poc.exe",
            "smb://attacker.com/share/game.exe",
            "dav://attacker.com/share/game.exe",
        ];

        for target in unc_targets {
            let res = validate_launch_target(target);
            assert!(
                res.is_err(),
                "Target '{}' should have been prohibited as UNC",
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
    fn test_validate_launch_target_prohibits_url_shortcut_files() {
        let temp_dir = std::env::temp_dir().join("vvidget_url_test");
        let _ = std::fs::create_dir_all(&temp_dir);
        let test_url = temp_dir.join("shortcut.url");
        let _ = std::fs::write(&test_url, b"[InternetShortcut]\nURL=https://evil.com\n");

        let target_str = test_url.to_string_lossy().to_string();
        let res = validate_launch_target(&target_str);
        assert!(
            res.is_err(),
            ".url file should be prohibited in launch target: {:?}",
            res
        );
        let err_msg = res.unwrap_err();
        assert!(
            err_msg.contains("not an allowed executable or shortcut"),
            "Expected not allowed executable error, got: {}",
            err_msg
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[cfg(windows)]
    #[test]
    fn test_steam_registry_roots_query() {
        // Query should safely return candidate roots without crashing
        let roots = reg::query_steam_registry_roots();
        for r in &roots {
            assert!(r.exists(), "Discovered registry root must exist: {:?}", r);
            assert!(r.is_dir(), "Discovered registry root must be a directory: {:?}", r);
        }
    }

    #[tokio::test]
    async fn test_launch_app_or_uri_invalid_target_fails_fast() {
        let res = launch_app_or_uri(r"\\evil-server\share\exploit.exe".to_string()).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("UNC network paths are prohibited"));
    }
}
