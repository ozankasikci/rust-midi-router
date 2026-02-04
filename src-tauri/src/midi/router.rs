//! Route matching and message forwarding

use crate::types::{MessageKind, MidiActivity, Route};
use wmidi::MidiMessage;

pub fn parse_midi_message(timestamp: u64, port: &str, bytes: &[u8]) -> Option<MidiActivity> {
    // Handle system real-time messages first (single byte, 0xF8-0xFF)
    // These may not be parsed by wmidi but are important for transport
    if bytes.len() == 1 {
        let kind = match bytes[0] {
            0xF8 => Some(MessageKind::Clock),
            0xFA => Some(MessageKind::Start),
            0xFB => Some(MessageKind::Continue),
            0xFC => Some(MessageKind::Stop),
            _ => None,
        };
        if let Some(kind) = kind {
            return Some(MidiActivity {
                timestamp,
                port: port.to_string(),
                channel: None,
                kind,
                raw: bytes.to_vec(),
            });
        }
    }

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
        MidiMessage::TimingClock => (None, MessageKind::Clock),
        MidiMessage::Start => (None, MessageKind::Start),
        MidiMessage::Continue => (None, MessageKind::Continue),
        MidiMessage::Stop => (None, MessageKind::Stop),
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

/// Check if a message is a Control Change message
pub fn is_cc_message(bytes: &[u8]) -> bool {
    if bytes.len() >= 3 {
        let status = bytes[0];
        // CC messages have status 0xB0-0xBF
        (status & 0xF0) == 0xB0
    } else {
        false
    }
}

/// Apply CC mappings to transform incoming CC messages.
/// Returns a list of output messages (may be empty, one, or multiple).
/// Non-CC messages are returned unchanged.
pub fn apply_cc_mappings(bytes: &[u8], route: &Route) -> Vec<Vec<u8>> {
    // Non-CC messages always pass through unchanged
    if !is_cc_message(bytes) {
        return vec![bytes.to_vec()];
    }

    let cc_num = bytes[1];
    let value = bytes[2];

    // Check if this CC has mappings
    if let Some(mapping) = route.cc_mappings.iter().find(|m| m.source_cc == cc_num) {
        // Generate output messages for each target
        mapping
            .targets
            .iter()
            .flat_map(|target| {
                target.channels.iter().map(move |ch| {
                    // Channel in mapping is 1-16, MIDI uses 0-15
                    let channel = if *ch > 0 { ch - 1 } else { 0 };
                    vec![0xB0 | channel, target.cc, value]
                })
            })
            .collect()
    } else if route.cc_passthrough {
        // No mapping, pass through unchanged
        vec![bytes.to_vec()]
    } else {
        // No mapping, block
        vec![]
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

    // is_cc_message tests
    #[test]
    fn is_cc_message_identifies_cc() {
        assert!(is_cc_message(&[0xB0, 1, 64])); // CC ch 0
        assert!(is_cc_message(&[0xBF, 74, 127])); // CC ch 15
    }

    #[test]
    fn is_cc_message_rejects_non_cc() {
        assert!(!is_cc_message(&[0x90, 60, 100])); // Note On
        assert!(!is_cc_message(&[0x80, 60, 0])); // Note Off
        assert!(!is_cc_message(&[0xC0, 5])); // Program Change
        assert!(!is_cc_message(&[0xF8])); // Clock
        assert!(!is_cc_message(&[])); // Empty
    }

    // apply_cc_mappings tests
    use crate::types::{CcMapping, CcTarget, PortId, Route};

    fn make_test_route(cc_passthrough: bool, mappings: Vec<CcMapping>) -> Route {
        Route {
            id: uuid::Uuid::new_v4(),
            source: PortId::new("Test In".to_string()),
            destination: PortId::new("Test Out".to_string()),
            enabled: true,
            channels: ChannelFilter::All,
            cc_passthrough,
            cc_mappings: mappings,
        }
    }

    #[test]
    fn apply_cc_mappings_non_cc_passes_through() {
        let route = make_test_route(false, vec![]);
        let note_on = [0x90, 60, 100];
        let result = apply_cc_mappings(&note_on, &route);
        assert_eq!(result, vec![note_on.to_vec()]);
    }

    #[test]
    fn apply_cc_mappings_unmapped_passthrough_true() {
        let route = make_test_route(true, vec![]);
        let cc = [0xB0, 7, 100]; // CC 7 on ch 0
        let result = apply_cc_mappings(&cc, &route);
        assert_eq!(result, vec![cc.to_vec()]);
    }

    #[test]
    fn apply_cc_mappings_unmapped_passthrough_false() {
        let route = make_test_route(false, vec![]);
        let cc = [0xB0, 7, 100]; // CC 7 on ch 0
        let result = apply_cc_mappings(&cc, &route);
        assert!(result.is_empty());
    }

    #[test]
    fn apply_cc_mappings_single_target() {
        let mapping = CcMapping {
            source_cc: 1,
            targets: vec![CcTarget {
                cc: 74,
                channels: vec![1], // Ch 1 (1-indexed)
            }],
        };
        let route = make_test_route(true, vec![mapping]);
        let cc = [0xB5, 1, 100]; // CC 1 on ch 5 (input channel ignored, output uses target)
        let result = apply_cc_mappings(&cc, &route);
        assert_eq!(result, vec![vec![0xB0, 74, 100]]); // CC 74 on ch 0 (0-indexed)
    }

    #[test]
    fn apply_cc_mappings_multiple_channels() {
        let mapping = CcMapping {
            source_cc: 1,
            targets: vec![CcTarget {
                cc: 74,
                channels: vec![1, 2, 3], // Channels 1, 2, 3 (1-indexed)
            }],
        };
        let route = make_test_route(true, vec![mapping]);
        let cc = [0xB0, 1, 64];
        let result = apply_cc_mappings(&cc, &route);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], vec![0xB0, 74, 64]); // Ch 0
        assert_eq!(result[1], vec![0xB1, 74, 64]); // Ch 1
        assert_eq!(result[2], vec![0xB2, 74, 64]); // Ch 2
    }

    #[test]
    fn apply_cc_mappings_multiple_targets() {
        let mapping = CcMapping {
            source_cc: 1,
            targets: vec![
                CcTarget {
                    cc: 74,
                    channels: vec![1],
                },
                CcTarget {
                    cc: 71,
                    channels: vec![1],
                },
            ],
        };
        let route = make_test_route(true, vec![mapping]);
        let cc = [0xB0, 1, 127];
        let result = apply_cc_mappings(&cc, &route);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], vec![0xB0, 74, 127]); // CC 74
        assert_eq!(result[1], vec![0xB0, 71, 127]); // CC 71
    }

    // ==========================================================================
    // Additional parse_midi_message tests
    // ==========================================================================

    #[test]
    fn parse_pitch_bend() {
        // Pitch bend: 0xE0-0xEF, LSB, MSB
        // Center is 0x2000 (8192), stored as LSB=0x00, MSB=0x40
        let bytes = [0xE3, 0x00, 0x40]; // Ch 3, center position
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(3));
        assert!(matches!(
            activity.kind,
            MessageKind::PitchBend { value: 8192 }
        ));
    }

    #[test]
    fn parse_pitch_bend_max() {
        // Max pitch bend: LSB=0x7F, MSB=0x7F = 16383
        let bytes = [0xE0, 0x7F, 0x7F];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert!(matches!(
            activity.kind,
            MessageKind::PitchBend { value: 16383 }
        ));
    }

    #[test]
    fn parse_aftertouch() {
        // Channel pressure (aftertouch): 0xD0-0xDF, value
        let bytes = [0xD5, 100]; // Ch 5, pressure 100
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(5));
        assert!(matches!(
            activity.kind,
            MessageKind::Aftertouch { value: 100 }
        ));
    }

    #[test]
    fn parse_poly_aftertouch() {
        // Polyphonic key pressure: 0xA0-0xAF, note, value
        let bytes = [0xA2, 64, 80]; // Ch 2, note 64, pressure 80
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, Some(2));
        assert!(matches!(
            activity.kind,
            MessageKind::PolyAftertouch { note: 64, value: 80 }
        ));
    }

    #[test]
    fn parse_sysex() {
        // SysEx: starts with 0xF0, ends with 0xF7
        let bytes = [0xF0, 0x7E, 0x00, 0x06, 0x01, 0xF7];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, None); // System message, no channel
        assert!(matches!(activity.kind, MessageKind::SysEx));
    }

    #[test]
    fn parse_transport_start() {
        let bytes = [0xFA];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, None);
        assert!(matches!(activity.kind, MessageKind::Start));
    }

    #[test]
    fn parse_transport_stop() {
        let bytes = [0xFC];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, None);
        assert!(matches!(activity.kind, MessageKind::Stop));
    }

    #[test]
    fn parse_transport_continue() {
        let bytes = [0xFB];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, None);
        assert!(matches!(activity.kind, MessageKind::Continue));
    }

    #[test]
    fn parse_transport_clock() {
        let bytes = [0xF8];
        let activity = parse_midi_message(1000, "Port", &bytes).unwrap();

        assert_eq!(activity.channel, None);
        assert!(matches!(activity.kind, MessageKind::Clock));
    }

    // ==========================================================================
    // Additional should_route tests
    // ==========================================================================

    #[test]
    fn should_route_except_blocks_listed() {
        let filter = ChannelFilter::Except(vec![9, 10]); // Block channels 9, 10
        assert!(should_route(&[0x90, 60, 100], &filter)); // Ch 0 - pass
        assert!(should_route(&[0x98, 60, 100], &filter)); // Ch 8 - pass
        assert!(!should_route(&[0x99, 60, 100], &filter)); // Ch 9 - block
        assert!(!should_route(&[0x9A, 60, 100], &filter)); // Ch 10 - block
        assert!(should_route(&[0x9B, 60, 100], &filter)); // Ch 11 - pass
    }

    #[test]
    fn should_route_empty_bytes_passes() {
        let filter = ChannelFilter::Only(vec![0]);
        // Empty messages have no channel, so they should pass (treated as system)
        assert!(should_route(&[], &filter));
    }

    // ==========================================================================
    // Additional apply_cc_mappings edge case tests
    // ==========================================================================

    #[test]
    fn apply_cc_mappings_preserves_value() {
        // Ensure the CC value is preserved through mapping
        let mapping = CcMapping {
            source_cc: 1,
            targets: vec![CcTarget {
                cc: 74,
                channels: vec![1],
            }],
        };
        let route = make_test_route(true, vec![mapping]);

        // Test various values
        for value in [0, 1, 64, 126, 127] {
            let cc = [0xB0, 1, value];
            let result = apply_cc_mappings(&cc, &route);
            assert_eq!(result[0][2], value, "Value {} should be preserved", value);
        }
    }

    #[test]
    fn apply_cc_mappings_channel_zero_edge_case() {
        // Channel 0 in 1-indexed (UI) is actually channel 0 in MIDI
        // But if user specifies channel 0, it should become channel -1 which is 0 after clamping
        let mapping = CcMapping {
            source_cc: 1,
            targets: vec![CcTarget {
                cc: 74,
                channels: vec![0], // Edge case: 0 in 1-indexed
            }],
        };
        let route = make_test_route(true, vec![mapping]);
        let cc = [0xB5, 1, 64];
        let result = apply_cc_mappings(&cc, &route);
        // Channel 0 - 1 = -1, but since it's u8 and we check > 0, it becomes 0
        assert_eq!(result[0][0], 0xB0); // Should be channel 0
    }

    #[test]
    fn apply_cc_mappings_multiple_mappings_same_source() {
        // Two different mappings for the same source CC
        let mappings = vec![
            CcMapping {
                source_cc: 1,
                targets: vec![CcTarget {
                    cc: 74,
                    channels: vec![1],
                }],
            },
            CcMapping {
                source_cc: 1, // Same source
                targets: vec![CcTarget {
                    cc: 71,
                    channels: vec![2],
                }],
            },
        ];
        let route = make_test_route(true, mappings);
        let cc = [0xB0, 1, 100];
        let result = apply_cc_mappings(&cc, &route);

        // Should only match the first mapping (find returns first match)
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], vec![0xB0, 74, 100]);
    }
}
