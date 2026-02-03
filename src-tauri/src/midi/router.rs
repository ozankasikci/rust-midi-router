//! Route matching and message forwarding

use crate::types::{MessageKind, MidiActivity};
use wmidi::MidiMessage;

pub fn parse_midi_message(timestamp: u64, port: &str, bytes: &[u8]) -> Option<MidiActivity> {
    let msg = MidiMessage::try_from(bytes).ok()?;

    let (channel, kind) = match msg {
        MidiMessage::NoteOn(ch, note, vel) => (
            Some(ch.index()),
            MessageKind::NoteOn {
                note: u8::from(note),
                velocity: u8::from(vel),
            },
        ),
        MidiMessage::NoteOff(ch, note, vel) => (
            Some(ch.index()),
            MessageKind::NoteOff {
                note: u8::from(note),
                velocity: u8::from(vel),
            },
        ),
        MidiMessage::ControlChange(ch, ctrl, val) => (
            Some(ch.index()),
            MessageKind::ControlChange {
                controller: u8::from(ctrl),
                value: u8::from(val),
            },
        ),
        MidiMessage::ProgramChange(ch, prog) => (
            Some(ch.index()),
            MessageKind::ProgramChange {
                program: u8::from(prog),
            },
        ),
        MidiMessage::PitchBendChange(ch, bend) => (
            Some(ch.index()),
            MessageKind::PitchBend {
                value: u16::from(bend),
            },
        ),
        MidiMessage::ChannelPressure(ch, val) => (
            Some(ch.index()),
            MessageKind::Aftertouch {
                value: u8::from(val),
            },
        ),
        MidiMessage::PolyphonicKeyPressure(ch, note, val) => (
            Some(ch.index()),
            MessageKind::PolyAftertouch {
                note: u8::from(note),
                value: u8::from(val),
            },
        ),
        MidiMessage::SysEx(_) => (None, MessageKind::SysEx),
        _ => (None, MessageKind::Other),
    };

    Some(MidiActivity {
        timestamp,
        port: port.to_string(),
        channel,
        kind,
        raw: bytes.to_vec(),
    })
}

pub fn get_channel_from_bytes(bytes: &[u8]) -> Option<u8> {
    if bytes.is_empty() {
        return None;
    }
    let status = bytes[0];
    // Channel messages have status 0x80-0xEF, channel is low nibble
    if status >= 0x80 && status < 0xF0 {
        Some(status & 0x0F)
    } else {
        None
    }
}

pub fn should_route(bytes: &[u8], filter: &crate::types::ChannelFilter) -> bool {
    match get_channel_from_bytes(bytes) {
        Some(ch) => filter.passes(ch),
        None => true, // System messages always pass
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ChannelFilter;

    // get_channel_from_bytes tests
    #[test]
    fn get_channel_from_note_on() {
        // Note On, channel 0: 0x90
        assert_eq!(get_channel_from_bytes(&[0x90, 60, 100]), Some(0));
        // Note On, channel 5: 0x95
        assert_eq!(get_channel_from_bytes(&[0x95, 60, 100]), Some(5));
        // Note On, channel 15: 0x9F
        assert_eq!(get_channel_from_bytes(&[0x9F, 60, 100]), Some(15));
    }

    #[test]
    fn get_channel_from_control_change() {
        // CC, channel 0: 0xB0
        assert_eq!(get_channel_from_bytes(&[0xB0, 1, 64]), Some(0));
        // CC, channel 9: 0xB9
        assert_eq!(get_channel_from_bytes(&[0xB9, 1, 64]), Some(9));
    }

    #[test]
    fn get_channel_from_system_message_returns_none() {
        // SysEx start: 0xF0
        assert_eq!(get_channel_from_bytes(&[0xF0, 0x7E, 0xF7]), None);
        // Clock: 0xF8
        assert_eq!(get_channel_from_bytes(&[0xF8]), None);
    }

    #[test]
    fn get_channel_from_empty_returns_none() {
        assert_eq!(get_channel_from_bytes(&[]), None);
    }

    // parse_midi_message tests
    #[test]
    fn parse_note_on() {
        let bytes = [0x90, 60, 100]; // Ch 0, note 60, vel 100
        let activity = parse_midi_message(1000, "Test Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(0));
        assert_eq!(activity.port, "Test Port");
        assert!(matches!(
            activity.kind,
            MessageKind::NoteOn {
                note: 60,
                velocity: 100
            }
        ));
    }

    #[test]
    fn parse_note_off() {
        let bytes = [0x85, 64, 0]; // Ch 5, note 64, vel 0
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(5));
        assert!(matches!(
            activity.kind,
            MessageKind::NoteOff {
                note: 64,
                velocity: 0
            }
        ));
    }

    #[test]
    fn parse_control_change() {
        let bytes = [0xB0, 74, 127]; // Ch 0, CC 74, val 127
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(0));
        assert!(matches!(
            activity.kind,
            MessageKind::ControlChange {
                controller: 74,
                value: 127
            }
        ));
    }

    #[test]
    fn parse_program_change() {
        let bytes = [0xC3, 42]; // Ch 3, program 42
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(3));
        assert!(matches!(
            activity.kind,
            MessageKind::ProgramChange { program: 42 }
        ));
    }

    #[test]
    fn parse_invalid_bytes_returns_none() {
        assert!(parse_midi_message(1000, "Port", &[]).is_none());
        assert!(parse_midi_message(1000, "Port", &[0x00]).is_none());
    }

    // should_route tests
    #[test]
    fn should_route_all_passes_everything() {
        let filter = ChannelFilter::All;
        assert!(should_route(&[0x90, 60, 100], &filter)); // Note On ch 0
        assert!(should_route(&[0x9F, 60, 100], &filter)); // Note On ch 15
        assert!(should_route(&[0xF0, 0x7E, 0xF7], &filter)); // SysEx
    }

    #[test]
    fn should_route_only_filters_channels() {
        let filter = ChannelFilter::Only(vec![0, 1]);
        assert!(should_route(&[0x90, 60, 100], &filter)); // Ch 0 - pass
        assert!(should_route(&[0x91, 60, 100], &filter)); // Ch 1 - pass
        assert!(!should_route(&[0x92, 60, 100], &filter)); // Ch 2 - block
    }

    #[test]
    fn should_route_system_messages_always_pass() {
        let filter = ChannelFilter::Only(vec![0]); // Only ch 0
        assert!(should_route(&[0xF0, 0x7E, 0xF7], &filter)); // SysEx passes
        assert!(should_route(&[0xF8], &filter)); // Clock passes
    }
}
