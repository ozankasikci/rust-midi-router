//! Preset load/save logic

use crate::config::storage::{load_config, save_config};
use crate::types::{Preset, Route};
use uuid::Uuid;

pub fn list_presets() -> Vec<Preset> {
    load_config().presets
}

pub fn get_preset(id: Uuid) -> Option<Preset> {
    load_config().presets.into_iter().find(|p| p.id == id)
}

pub fn save_preset(name: String, routes: Vec<Route>) -> Result<Preset, String> {
    let mut config = load_config();
    let preset = Preset::new(name, routes);
    config.presets.push(preset.clone());
    save_config(&config)?;
    Ok(preset)
}

pub fn update_preset(id: Uuid, routes: Vec<Route>) -> Result<Preset, String> {
    let mut config = load_config();

    let preset = config
        .presets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;

    preset.routes = routes;
    preset.modified_at = chrono::Utc::now();

    let updated = preset.clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_preset(id: Uuid) -> Result<(), String> {
    let mut config = load_config();
    config.presets.retain(|p| p.id != id);
    save_config(&config)?;
    Ok(())
}

pub fn set_active_preset(id: Option<Uuid>) -> Result<(), String> {
    let mut config = load_config();
    config.active_preset_id = id;
    save_config(&config)?;
    Ok(())
}

pub fn get_active_preset() -> Option<Preset> {
    let config = load_config();
    config
        .active_preset_id
        .and_then(|id| config.presets.into_iter().find(|p| p.id == id))
}
