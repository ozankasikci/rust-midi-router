//! Port enumeration and connection

use crate::types::{MidiPort, PortId};
use midir::{MidiInput, MidiOutput};

pub fn list_input_ports() -> Vec<MidiPort> {
    let Ok(midi_in) = MidiInput::new("midi-router-enum") else {
        return Vec::new();
    };

    midi_in
        .ports()
        .iter()
        .filter_map(|port| {
            midi_in.port_name(port).ok().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: true,
            })
        })
        .collect()
}

pub fn list_output_ports() -> Vec<MidiPort> {
    let Ok(midi_out) = MidiOutput::new("midi-router-enum") else {
        return Vec::new();
    };

    midi_out
        .ports()
        .iter()
        .filter_map(|port| {
            midi_out.port_name(port).ok().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: false,
            })
        })
        .collect()
}

pub fn list_all_ports() -> (Vec<MidiPort>, Vec<MidiPort>) {
    (list_input_ports(), list_output_ports())
}
