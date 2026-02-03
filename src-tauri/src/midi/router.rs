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
