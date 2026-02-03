//! Tauri command handlers

use crate::config::preset;
use crate::midi::engine::{EngineEvent, MidiEngine};
use crate::types::{CcMapping, ChannelFilter, ClockState, MidiActivity, MidiPort, PortId, Preset, Route};
use std::sync::Mutex;
use tauri::{ipc::Channel, State};
use uuid::Uuid;

pub struct AppState {
    pub engine: MidiEngine,
    pub routes: Mutex<Vec<Route>>,
    pub clock_bpm: Mutex<f64>,
}

#[tauri::command]
pub fn get_ports(state: State<AppState>) -> Result<(Vec<MidiPort>, Vec<MidiPort>), String> {
    use crate::midi::ports::{list_input_ports, list_output_ports};

    // Trigger engine to close connections so CoreMIDI refreshes port list
    state.engine.refresh_ports()?;
    // Small delay to let the engine process the refresh
    std::thread::sleep(std::time::Duration::from_millis(150));

    let inputs = list_input_ports();
    let outputs = list_output_ports();
    eprintln!("[CMD] get_ports: {} inputs, {} outputs", inputs.len(), outputs.len());

    // Re-apply existing routes to reconnect to ports
    let routes = state.routes.lock().unwrap().clone();
    if !routes.is_empty() {
        state.engine.set_routes(routes)?;
    }

    Ok((inputs, outputs))
}

#[tauri::command]
pub fn get_routes(state: State<AppState>) -> Vec<Route> {
    state.routes.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_route(
    state: State<AppState>,
    source_name: String,
    dest_name: String,
) -> Result<Route, String> {
    let source = PortId::new(source_name);
    let destination = PortId::new(dest_name);
    let route = Route::new(source, destination);

    {
        let mut routes = state.routes.lock().unwrap();
        routes.push(route.clone());
        state.engine.set_routes(routes.clone())?;
    }

    Ok(route)
}

#[tauri::command]
pub fn remove_route(state: State<AppState>, route_id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        routes.retain(|r| r.id != uuid);
        state.engine.set_routes(routes.clone())?;
    }

    Ok(())
}

#[tauri::command]
pub fn toggle_route(state: State<AppState>, route_id: String) -> Result<bool, String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;
    let mut new_enabled = false;

    {
        let mut routes = state.routes.lock().unwrap();
        if let Some(route) = routes.iter_mut().find(|r| r.id == uuid) {
            route.enabled = !route.enabled;
            new_enabled = route.enabled;
        }
        state.engine.set_routes(routes.clone())?;
    }

    Ok(new_enabled)
}

#[tauri::command]
pub fn set_route_channels(
    state: State<AppState>,
    route_id: String,
    filter: ChannelFilter,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        if let Some(route) = routes.iter_mut().find(|r| r.id == uuid) {
            route.channels = filter;
        }
        state.engine.set_routes(routes.clone())?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_route_cc_mappings(
    state: State<AppState>,
    route_id: String,
    cc_passthrough: bool,
    cc_mappings: Vec<CcMapping>,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        if let Some(route) = routes.iter_mut().find(|r| r.id == uuid) {
            route.cc_passthrough = cc_passthrough;
            route.cc_mappings = cc_mappings;
        }
        state.engine.set_routes(routes.clone())?;
    }

    Ok(())
}

#[tauri::command]
pub fn start_midi_monitor(
    state: State<AppState>,
    on_event: Channel<MidiActivity>,
) -> Result<(), String> {
    let event_rx = state.engine.event_receiver();

    std::thread::spawn(move || {
        loop {
            match event_rx.recv() {
                Ok(EngineEvent::MidiActivity(activity)) => {
                    if on_event.send(activity).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn list_presets() -> Vec<Preset> {
    preset::list_presets()
}

#[tauri::command]
pub fn save_preset(state: State<AppState>, name: String) -> Result<Preset, String> {
    let routes = state.routes.lock().unwrap().clone();
    preset::save_preset(name, routes)
}

#[tauri::command]
pub fn update_preset(state: State<AppState>, preset_id: String) -> Result<Preset, String> {
    let id = Uuid::parse_str(&preset_id).map_err(|e| e.to_string())?;
    let routes = state.routes.lock().unwrap().clone();
    preset::update_preset(id, routes)
}

#[tauri::command]
pub fn load_preset(state: State<AppState>, preset_id: String) -> Result<Preset, String> {
    let id = Uuid::parse_str(&preset_id).map_err(|e| e.to_string())?;
    let p = preset::get_preset(id).ok_or_else(|| "Preset not found".to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        *routes = p.routes.clone();
        state.engine.set_routes(routes.clone())?;
    }

    preset::set_active_preset(Some(id))?;
    Ok(p)
}

#[tauri::command]
pub fn delete_preset(preset_id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&preset_id).map_err(|e| e.to_string())?;
    preset::delete_preset(id)
}

#[tauri::command]
pub fn get_active_preset_id() -> Option<String> {
    preset::get_active_preset().map(|p| p.id.to_string())
}

#[tauri::command]
pub fn set_bpm(state: State<AppState>, bpm: f64) -> Result<(), String> {
    let bpm = bpm.clamp(20.0, 300.0);
    *state.clock_bpm.lock().unwrap() = bpm;
    state.engine.set_bpm(bpm)?;

    // Persist to config
    crate::config::preset::set_clock_bpm(bpm)?;

    Ok(())
}

#[tauri::command]
pub fn get_clock_bpm(state: State<AppState>) -> f64 {
    *state.clock_bpm.lock().unwrap()
}

#[tauri::command]
pub fn send_transport_start(state: State<AppState>) -> Result<(), String> {
    state.engine.send_start()
}

#[tauri::command]
pub fn send_transport_stop(state: State<AppState>) -> Result<(), String> {
    state.engine.send_stop()
}

#[tauri::command]
pub fn start_clock_monitor(
    state: State<AppState>,
    on_event: Channel<ClockState>,
) -> Result<(), String> {
    let event_rx = state.engine.event_receiver();

    std::thread::spawn(move || {
        loop {
            match event_rx.recv() {
                Ok(EngineEvent::ClockStateChanged(clock_state)) => {
                    if on_event.send(clock_state).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    Ok(())
}
