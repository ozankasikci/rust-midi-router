use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

// =============================================================================
// Validation Error
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ValidationError {
    BpmOutOfRange { value: f64, min: f64, max: f64 },
    CcOutOfRange { value: u8, max: u8 },
    ChannelOutOfRange { value: u8, max: u8 },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BpmOutOfRange { value, min, max } => {
                write!(f, "BPM {} is out of range ({}-{})", value, min, max)
            }
            Self::CcOutOfRange { value, max } => {
                write!(f, "CC number {} is out of range (0-{})", value, max)
            }
            Self::ChannelOutOfRange { value, max } => {
                write!(f, "Channel {} is out of range (0-{})", value, max)
            }
        }
    }
}

impl std::error::Error for ValidationError {}

// =============================================================================
// Engine Error
// =============================================================================

/// Errors that can occur in the MIDI engine, surfaced to the frontend
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EngineError {
    /// Failed to connect to a MIDI port
    PortConnectionFailed { port_name: String, reason: String },
    /// A MIDI port was disconnected (device unplugged)
    PortDisconnected { port_name: String },
    /// Failed to send MIDI message
    SendFailed { port_name: String, reason: String },
    /// Invalid configuration
    ValidationFailed(ValidationError),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PortConnectionFailed { port_name, reason } => {
                write!(f, "Failed to connect to '{}': {}", port_name, reason)
            }
            Self::PortDisconnected { port_name } => {
                write!(f, "Port '{}' was disconnected", port_name)
            }
            Self::SendFailed { port_name, reason } => {
                write!(f, "Failed to send to '{}': {}", port_name, reason)
            }
            Self::ValidationFailed(err) => write!(f, "Validation error: {}", err),
        }
    }
}

impl std::error::Error for EngineError {}

impl From<ValidationError> for EngineError {
    fn from(err: ValidationError) -> Self {
        Self::ValidationFailed(err)
    }
}

// =============================================================================
// Validated Newtypes
// =============================================================================

/// BPM value, guaranteed to be within valid range (20.0-300.0)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bpm(f64);

impl Bpm {
    pub const MIN: f64 = 20.0;
    pub const MAX: f64 = 300.0;
    pub const DEFAULT: f64 = 120.0;

    pub fn new(value: f64) -> Result<Self, ValidationError> {
        if value < Self::MIN || value > Self::MAX {
            Err(ValidationError::BpmOutOfRange {
                value,
                min: Self::MIN,
                max: Self::MAX,
            })
        } else {
            Ok(Self(value))
        }
    }

    /// Create a BPM value, clamping to valid range
    pub fn clamped(value: f64) -> Self {
        Self(value.clamp(Self::MIN, Self::MAX))
    }

    pub fn value(&self) -> f64 {
        self.0
    }
}

impl Default for Bpm {
    fn default() -> Self {
        Self(Self::DEFAULT)
    }
}

/// MIDI Control Change number (0-127)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct CcNumber(u8);

impl CcNumber {
    pub const MAX: u8 = 127;

    pub fn new(value: u8) -> Result<Self, ValidationError> {
        if value > Self::MAX {
            Err(ValidationError::CcOutOfRange {
                value,
                max: Self::MAX,
            })
        } else {
            Ok(Self(value))
        }
    }

    pub fn value(&self) -> u8 {
        self.0
    }
}

impl From<CcNumber> for u8 {
    fn from(cc: CcNumber) -> u8 {
        cc.0
    }
}

/// MIDI Channel (0-15 internally, typically displayed as 1-16)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Channel(u8);

impl Channel {
    pub const MAX: u8 = 15;

    /// Create from 0-indexed channel (0-15)
    pub fn new(value: u8) -> Result<Self, ValidationError> {
        if value > Self::MAX {
            Err(ValidationError::ChannelOutOfRange {
                value,
                max: Self::MAX,
            })
        } else {
            Ok(Self(value))
        }
    }

    /// Create from 1-indexed channel (1-16), as typically shown in UI
    pub fn from_one_indexed(value: u8) -> Result<Self, ValidationError> {
        if value == 0 || value > 16 {
            Err(ValidationError::ChannelOutOfRange {
                value,
                max: 16,
            })
        } else {
            Ok(Self(value - 1))
        }
    }

    /// Get 0-indexed value (0-15) for MIDI protocol
    pub fn value(&self) -> u8 {
        self.0
    }

    /// Get 1-indexed value (1-16) for display
    pub fn display_value(&self) -> u8 {
        self.0 + 1
    }
}

impl From<Channel> for u8 {
    fn from(ch: Channel) -> u8 {
        ch.0
    }
}

// =============================================================================
// Port Types
// =============================================================================

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
pub struct CcTarget {
    pub cc: u8,
    pub channels: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CcMapping {
    pub source_cc: u8,
    pub targets: Vec<CcTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub id: Uuid,
    pub source: PortId,
    pub destination: PortId,
    pub enabled: bool,
    pub channels: ChannelFilter,
    #[serde(default)]
    pub cc_passthrough: bool,
    #[serde(default)]
    pub cc_mappings: Vec<CcMapping>,
}

impl Default for Route {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            source: PortId::new(String::new()),
            destination: PortId::new(String::new()),
            enabled: true,
            channels: ChannelFilter::default(),
            cc_passthrough: true,
            cc_mappings: Vec::new(),
        }
    }
}

impl Route {
    pub fn new(source: PortId, destination: PortId) -> Self {
        Self {
            id: Uuid::new_v4(),
            source,
            destination,
            enabled: true,
            channels: ChannelFilter::default(),
            cc_passthrough: true,
            cc_mappings: Vec::new(),
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

    // ==========================================================================
    // Bpm tests
    // ==========================================================================

    #[test]
    fn bpm_new_valid() {
        assert!(Bpm::new(120.0).is_ok());
        assert!(Bpm::new(20.0).is_ok()); // min
        assert!(Bpm::new(300.0).is_ok()); // max
    }

    #[test]
    fn bpm_new_invalid() {
        assert!(Bpm::new(19.9).is_err());
        assert!(Bpm::new(300.1).is_err());
        assert!(Bpm::new(0.0).is_err());
        assert!(Bpm::new(-10.0).is_err());
    }

    #[test]
    fn bpm_clamped() {
        assert_eq!(Bpm::clamped(10.0).value(), 20.0);
        assert_eq!(Bpm::clamped(500.0).value(), 300.0);
        assert_eq!(Bpm::clamped(120.0).value(), 120.0);
    }

    #[test]
    fn bpm_default() {
        assert_eq!(Bpm::default().value(), 120.0);
    }

    // ==========================================================================
    // CcNumber tests
    // ==========================================================================

    #[test]
    fn cc_number_valid() {
        assert!(CcNumber::new(0).is_ok());
        assert!(CcNumber::new(64).is_ok());
        assert!(CcNumber::new(127).is_ok());
    }

    #[test]
    fn cc_number_invalid() {
        assert!(CcNumber::new(128).is_err());
        assert!(CcNumber::new(255).is_err());
    }

    #[test]
    fn cc_number_into_u8() {
        let cc = CcNumber::new(74).unwrap();
        let val: u8 = cc.into();
        assert_eq!(val, 74);
    }

    // ==========================================================================
    // Channel tests
    // ==========================================================================

    #[test]
    fn channel_new_valid() {
        assert!(Channel::new(0).is_ok());
        assert!(Channel::new(9).is_ok());
        assert!(Channel::new(15).is_ok());
    }

    #[test]
    fn channel_new_invalid() {
        assert!(Channel::new(16).is_err());
        assert!(Channel::new(255).is_err());
    }

    #[test]
    fn channel_from_one_indexed_valid() {
        let ch = Channel::from_one_indexed(1).unwrap();
        assert_eq!(ch.value(), 0);
        assert_eq!(ch.display_value(), 1);

        let ch = Channel::from_one_indexed(16).unwrap();
        assert_eq!(ch.value(), 15);
        assert_eq!(ch.display_value(), 16);
    }

    #[test]
    fn channel_from_one_indexed_invalid() {
        assert!(Channel::from_one_indexed(0).is_err());
        assert!(Channel::from_one_indexed(17).is_err());
    }

    #[test]
    fn channel_display_value() {
        let ch = Channel::new(0).unwrap();
        assert_eq!(ch.display_value(), 1);

        let ch = Channel::new(9).unwrap();
        assert_eq!(ch.display_value(), 10);
    }

    // ==========================================================================
    // ValidationError tests
    // ==========================================================================

    #[test]
    fn validation_error_display() {
        let err = ValidationError::BpmOutOfRange {
            value: 10.0,
            min: 20.0,
            max: 300.0,
        };
        assert!(err.to_string().contains("10"));
        assert!(err.to_string().contains("20"));
        assert!(err.to_string().contains("300"));
    }

    // ==========================================================================
    // EngineError tests
    // ==========================================================================

    #[test]
    fn engine_error_port_connection_failed_display() {
        let err = EngineError::PortConnectionFailed {
            port_name: "USB MIDI".to_string(),
            reason: "Device busy".to_string(),
        };
        let msg = err.to_string();
        assert!(msg.contains("USB MIDI"));
        assert!(msg.contains("Device busy"));
    }

    #[test]
    fn engine_error_from_validation_error() {
        let validation_err = ValidationError::BpmOutOfRange {
            value: 10.0,
            min: 20.0,
            max: 300.0,
        };
        let engine_err: EngineError = validation_err.into();
        assert!(matches!(engine_err, EngineError::ValidationFailed(_)));
    }
}
