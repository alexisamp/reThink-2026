use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use base64::{engine::general_purpose, Engine as _};
use serde_json::Value;

#[tauri::command]
fn open_url_in_browser(url: String) {
    #[cfg(target_os = "macos")]
    {
        let escaped = url.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("open location \"{}\"", escaped);
        let _ = std::process::Command::new("osascript").args(["-e", &script]).spawn();
    }
    #[cfg(target_os = "windows")]
    { let _ = std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn(); }
    #[cfg(target_os = "linux")]
    { let _ = std::process::Command::new("xdg-open").arg(&url).spawn(); }
}

fn file_url_from_path(path_or_url: &str) -> Result<String, String> {
    if path_or_url.starts_with("file://") || path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
        return Ok(path_or_url.to_string());
    }
    let canonical = std::fs::canonicalize(path_or_url).map_err(|_| "File not found".to_string())?;
    let raw = canonical.to_string_lossy();
    let mut encoded = String::from("file://");
    for byte in raw.as_bytes() {
        let keep = byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'.' | b'_' | b'~');
        if keep {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    Ok(encoded)
}

#[tauri::command]
fn open_file_in_default_browser(path_or_url: String) -> Result<(), String> {
    let url = file_url_from_path(&path_or_url)?;
    #[cfg(target_os = "macos")]
    {
        let temp = std::env::temp_dir().join(format!(
            "rethink-open-{}.html",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "Could not prepare browser open".to_string())?
                .as_millis()
        ));
        let escaped_url = url.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;");
        let html = format!(
            "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url={}\"><script>location.replace(\"{}\");</script>",
            escaped_url,
            url.replace('\\', "\\\\").replace('"', "\\\"")
        );
        std::fs::write(&temp, html).map_err(|_| "Could not prepare browser open".to_string())?;
        let temp_url = file_url_from_path(temp.to_string_lossy().as_ref())?;
        let escaped = temp_url.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("open location \"{}\"", escaped);
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|_| "Could not open browser".to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|_| "Could not open browser".to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|_| "Could not open browser".to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_local_file_base64(path: String) -> Result<String, String> {
    let canonical = std::fs::canonicalize(&path).map_err(|_| "File not found".to_string())?;
    let meta = std::fs::metadata(&canonical).map_err(|_| "File not found".to_string())?;
    if !meta.is_file() {
        return Err("Selected path is not a file".to_string());
    }
    if meta.len() > 50 * 1024 * 1024 {
        return Err("File is too large to import".to_string());
    }
    let bytes = std::fs::read(&canonical).map_err(|_| "Could not read file".to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn write_capture_markdown(relative_path: String, markdown: String) -> Result<String, String> {
    if relative_path.contains("..") || relative_path.starts_with('/') || relative_path.starts_with('~') {
        return Err("Invalid capture path".to_string());
    }
    let root = std::path::Path::new("/Users/alexi/Documents/AA9 | Brain Project/Revenue | Opps/Job Opportunities");
    let target = root.join(relative_path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "Could not create capture directory".to_string())?;
    }
    std::fs::write(&target, markdown).map_err(|_| "Could not write capture markdown".to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn read_conversations_staged_outputs() -> Result<Value, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not resolve home directory".to_string())?;
    let db_path = std::path::Path::new(&home)
        .join("Library")
        .join("Application Support")
        .join("Conversations")
        .join("conv.db");
    if !db_path.exists() {
        return Err("Conversations local database not found".to_string());
    }
    let query = r#"
      SELECT
        id,
        run_id,
        source_key,
        target,
        contact_id,
        interaction_date,
        title,
        body,
        payload_json,
        status,
        supabase_id,
        error,
        created_at,
        updated_at,
        confirmed_at
      FROM ai_staged_outputs
      WHERE status IN ('pending', 'failed')
      ORDER BY created_at ASC
      LIMIT 500;
    "#;
    let output = std::process::Command::new("/usr/bin/sqlite3")
        .arg("-json")
        .arg(db_path)
        .arg(query)
        .output()
        .map_err(|_| "Could not run sqlite3".to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8(output.stdout).map_err(|_| "Conversations database returned invalid UTF-8".to_string())?;
    serde_json::from_str(&text).map_err(|_| "Could not parse Conversations staged outputs".to_string())
}

#[tauri::command]
fn mark_conversations_staged_outputs(ids: Vec<i64>, status: String, error: Option<String>) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    if !matches!(status.as_str(), "synced" | "rejected" | "failed") {
        return Err("Invalid staged output status".to_string());
    }
    let home = std::env::var("HOME").map_err(|_| "Could not resolve home directory".to_string())?;
    let db_path = std::path::Path::new(&home)
        .join("Library")
        .join("Application Support")
        .join("Conversations")
        .join("conv.db");
    if !db_path.exists() {
        return Err("Conversations local database not found".to_string());
    }
    let id_list = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let escaped_status = status.replace('\'', "''");
    let escaped_error = error
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("'{}'", value.replace('\'', "''")))
        .unwrap_or_else(|| "NULL".to_string());
    let confirmed = if status == "synced" || status == "rejected" { ", confirmed_at = unixepoch() * 1000" } else { "" };
    let query = format!(
        "UPDATE ai_staged_outputs SET status = '{}', error = {}, updated_at = unixepoch() * 1000{} WHERE id IN ({});",
        escaped_status,
        escaped_error,
        confirmed,
        id_list
    );
    let output = std::process::Command::new("/usr/bin/sqlite3")
        .arg(db_path)
        .arg(query)
        .output()
        .map_err(|_| "Could not run sqlite3".to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // ⌘⇧Space — bring window to front and focus quick-add input
      let handle = app.handle().clone();
      let shortcut = Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::Space);
      app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
        if let Some(window) = handle.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
          let _ = window.eval("window.rethinkFocusQuickAdd?.()");
        }
      })?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![open_url_in_browser, open_file_in_default_browser, read_local_file_base64, write_capture_markdown, read_conversations_staged_outputs, mark_conversations_staged_outputs])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
