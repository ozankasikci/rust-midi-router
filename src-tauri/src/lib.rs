#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod midi;
mod types;

use commands::AppState;
use midi::engine::MidiEngine;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = MidiEngine::new();
    let app_state = AppState {
        engine,
        routes: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_ports,
            commands::get_routes,
            commands::add_route,
            commands::remove_route,
            commands::toggle_route,
            commands::set_route_channels,
            commands::start_midi_monitor,
            commands::list_presets,
            commands::save_preset,
            commands::load_preset,
            commands::delete_preset,
            commands::get_active_preset_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
