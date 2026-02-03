use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct PortId {
    pub name: String,
    pub display_name: String,
}

impl PortId {
    pub fn new(name: String) -> Self {
        let display_name = name.clone();
        Self { name, display_name }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChannelFilter {
    All,
    Only(Vec<u8>),
    Except(Vec<u8>),
}

impl Default for ChannelFilter {
    fn default() -> Self {
        Self::All
    }
}

impl ChannelFilter {
    pub fn passes(&self, channel: u8) -> bool {
        match self {
            Self::All => true,
            Self::Only(channels) => channels.contains(&channel),
            Self::Except(channels) => !channels.contains(&channel),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub id: Uuid,
    pub source: PortId,
    pub destination: PortId,
    pub enabled: bool,
    pub channels: ChannelFilter,
}

impl Route {
    pub fn new(source: PortId, destination: PortId) -> Self {
        Self {
            id: Uuid::new_v4(),
            source,
            destination,
            enabled: true,
            channels: ChannelFilter::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiPort {
    pub id: PortId,
    pub is_input: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
pub enum MessageKind {
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8, velocity: u8 },
    ControlChange { controller: u8, value: u8 },
    ProgramChange { program: u8 },
    PitchBend { value: u16 },
    Aftertouch { value: u8 },
    PolyAftertouch { note: u8, value: u8 },
    SysEx,
    // Transport/Clock messages
    Clock,
    Start,
    Continue,
    Stop,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiActivity {
    pub timestamp: u64,
    pub port: String,
    pub channel: Option<u8>,
    pub kind: MessageKind,
    pub raw: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: Uuid,
    pub name: String,
    pub routes: Vec<Route>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

impl Preset {
    pub fn new(name: String, routes: Vec<Route>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            routes,
            created_at: now,
            modified_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub presets: Vec<Preset>,
    pub active_preset_id: Option<Uuid>,
    pub port_aliases: std::collections::HashMap<String, String>,
    #[serde(default = "default_clock_bpm")]
    pub clock_bpm: f64,
}

fn default_clock_bpm() -> f64 {
    120.0
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            presets: Vec::new(),
            active_preset_id: None,
            port_aliases: std::collections::HashMap::new(),
            clock_bpm: default_clock_bpm(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockState {
    pub bpm: f64,
    pub running: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ChannelFilter::All tests
    #[test]
    fn channel_filter_all_passes_any_channel() {
        let filter = ChannelFilter::All;
        assert!(filter.passes(0));
        assert!(filter.passes(7));
        assert!(filter.passes(15));
    }

    // ChannelFilter::Only tests
    #[test]
    fn channel_filter_only_passes_listed_channels() {
        let filter = ChannelFilter::Only(vec![0, 1, 2]);
        assert!(filter.passes(0));
        assert!(filter.passes(1));
        assert!(filter.passes(2));
    }

    #[test]
    fn channel_filter_only_blocks_unlisted_channels() {
        let filter = ChannelFilter::Only(vec![0, 1, 2]);
        assert!(!filter.passes(3));
        assert!(!filter.passes(15));
    }

    #[test]
    fn channel_filter_only_empty_blocks_all() {
        let filter = ChannelFilter::Only(vec![]);
        assert!(!filter.passes(0));
        assert!(!filter.passes(15));
    }

    // ChannelFilter::Except tests
    #[test]
    fn channel_filter_except_blocks_listed_channels() {
        let filter = ChannelFilter::Except(vec![9, 10]);
        assert!(!filter.passes(9));
        assert!(!filter.passes(10));
    }

    #[test]
    fn channel_filter_except_passes_unlisted_channels() {
        let filter = ChannelFilter::Except(vec![9, 10]);
        assert!(filter.passes(0));
        assert!(filter.passes(8));
        assert!(filter.passes(15));
    }

    #[test]
    fn channel_filter_except_empty_passes_all() {
        let filter = ChannelFilter::Except(vec![]);
        assert!(filter.passes(0));
        assert!(filter.passes(15));
    }

    #[test]
    fn channel_filter_default_is_all() {
        let filter = ChannelFilter::default();
        assert!(matches!(filter, ChannelFilter::All));
    }
}
