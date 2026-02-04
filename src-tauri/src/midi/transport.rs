//! MIDI Transport message handling
//!
//! Constants and helpers for MIDI transport messages (Start, Stop, Continue, Clock).

/// MIDI System Real-Time message bytes
pub mod messages {
    /// Timing Clock (24 PPQ)
    pub const CLOCK: u8 = 0xF8;
    /// Start - start playback from beginning
    pub const START: u8 = 0xFA;
    /// Continue - resume playback from current position
    pub const CONTINUE: u8 = 0xFB;
    /// Stop - stop playback
    pub const STOP: u8 = 0xFC;
}

/// Check if a MIDI message is a transport message (Start, Stop, Continue, Clock)
pub fn is_transport_message(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    matches!(
        bytes[0],
        messages::CLOCK | messages::START | messages::CONTINUE | messages::STOP
    )
}

/// Get the transport message type from bytes
pub fn get_transport_type(bytes: &[u8]) -> Option<TransportMessage> {
    if bytes.is_empty() {
        return None;
    }
    match bytes[0] {
        messages::START => Some(TransportMessage::Start),
        messages::CONTINUE => Some(TransportMessage::Continue),
        messages::STOP => Some(TransportMessage::Stop),
        messages::CLOCK => Some(TransportMessage::Clock),
        _ => None,
    }
}

/// Types of MIDI transport messages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportMessage {
    Start,
    Continue,
    Stop,
    Clock,
}

impl TransportMessage {
    /// Get the MIDI byte for this transport message
    pub fn as_byte(&self) -> u8 {
        match self {
            Self::Start => messages::START,
            Self::Continue => messages::CONTINUE,
            Self::Stop => messages::STOP,
            Self::Clock => messages::CLOCK,
        }
    }

    /// Get message as a single-byte slice for sending
    pub fn as_bytes(&self) -> &'static [u8] {
        match self {
            Self::Start => &[messages::START],
            Self::Continue => &[messages::CONTINUE],
            Self::Stop => &[messages::STOP],
            Self::Clock => &[messages::CLOCK],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_transport_message_recognizes_transport() {
        assert!(is_transport_message(&[messages::START]));
        assert!(is_transport_message(&[messages::STOP]));
        assert!(is_transport_message(&[messages::CONTINUE]));
        assert!(is_transport_message(&[messages::CLOCK]));
    }

    #[test]
    fn is_transport_message_rejects_non_transport() {
        assert!(!is_transport_message(&[0x90, 60, 100])); // Note On
        assert!(!is_transport_message(&[0xB0, 1, 64])); // CC
        assert!(!is_transport_message(&[])); // Empty
    }

    #[test]
    fn get_transport_type_works() {
        assert_eq!(
            get_transport_type(&[messages::START]),
            Some(TransportMessage::Start)
        );
        assert_eq!(
            get_transport_type(&[messages::STOP]),
            Some(TransportMessage::Stop)
        );
        assert_eq!(get_transport_type(&[0x90, 60, 100]), None);
    }

    #[test]
    fn transport_message_as_byte() {
        assert_eq!(TransportMessage::Start.as_byte(), messages::START);
        assert_eq!(TransportMessage::Stop.as_byte(), messages::STOP);
        assert_eq!(TransportMessage::Continue.as_byte(), messages::CONTINUE);
        assert_eq!(TransportMessage::Clock.as_byte(), messages::CLOCK);
    }

    #[test]
    fn transport_message_as_bytes() {
        assert_eq!(TransportMessage::Start.as_bytes(), &[0xFA]);
        assert_eq!(TransportMessage::Stop.as_bytes(), &[0xFC]);
    }
}
