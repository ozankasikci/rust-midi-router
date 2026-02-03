#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod midi;
mod types;

use commands::AppState;
use config::preset::{get_active_preset, get_clock_bpm};
use midi::engine::MidiEngine;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = MidiEngine::new();

    // Load active preset if one exists
    let initial_routes = get_active_preset()
        .map(|p| p.routes)
        .unwrap_or_default();

    // Apply routes to engine
    if !initial_routes.is_empty() {
        let _ = engine.set_routes(initial_routes.clone());
    }

    // Load clock BPM from config
    let clock_bpm = get_clock_bpm();
    let _ = engine.set_bpm(clock_bpm);

    let app_state = AppState {
        engine,
        routes: Mutex::new(initial_routes),
        clock_bpm: Mutex::new(clock_bpm),
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
            commands::set_route_cc_mappings,
            commands::start_midi_monitor,
            commands::list_presets,
            commands::save_preset,
            commands::update_preset,
            commands::load_preset,
            commands::delete_preset,
            commands::get_active_preset_id,
            commands::set_bpm,
            commands::get_clock_bpm,
            commands::start_clock_monitor,
            commands::send_transport_start,
            commands::send_transport_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
