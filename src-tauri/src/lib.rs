use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use base64::{engine::general_purpose, Engine as _};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
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
    .invoke_handler(tauri::generate_handler![open_url_in_browser, read_local_file_base64])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
