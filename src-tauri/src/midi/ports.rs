//! Port enumeration and connection

use crate::types::{MidiPort, PortId};

/// List input ports using platform-specific implementation
pub fn list_input_ports() -> Vec<MidiPort> {
    #[cfg(target_os = "macos")]
    {
        list_input_ports_coremidi()
    }
    #[cfg(not(target_os = "macos"))]
    {
        list_input_ports_midir()
    }
}

/// List output ports using platform-specific implementation
pub fn list_output_ports() -> Vec<MidiPort> {
    #[cfg(target_os = "macos")]
    {
        list_output_ports_coremidi()
    }
    #[cfg(not(target_os = "macos"))]
    {
        list_output_ports_midir()
    }
}

/// Force CoreMIDI to rescan all MIDI devices
#[cfg(target_os = "macos")]
pub fn force_coremidi_refresh() {
    use coremidi::{Destinations, Sources};

    // Log current state before refresh
    let before_inputs: Vec<String> = Sources
        .into_iter()
        .filter_map(|s| s.display_name())
        .collect();
    let before_outputs: Vec<String> = Destinations
        .into_iter()
        .filter_map(|d| d.display_name())
        .collect();
    eprintln!(
        "[PORTS] Before MIDIRestart: {} inputs, {} outputs",
        before_inputs.len(),
        before_outputs.len()
    );

    // MIDIRestart forces CoreMIDI to rescan all devices
    extern "C" {
        fn MIDIRestart() -> i32;
    }
    unsafe {
        let result = MIDIRestart();
        eprintln!("[PORTS] MIDIRestart called, result: {}", result);
    }

    // MIDIRestart is asynchronous - wait a minimum time, then poll for changes
    // Minimum wait gives CoreMIDI time to start the rescan
    let min_wait = std::time::Duration::from_millis(500);
    std::thread::sleep(min_wait);

    // Then poll for additional time in case device is still enumerating
    let start = std::time::Instant::now();
    let additional_timeout = std::time::Duration::from_millis(1500);
    let poll_interval = std::time::Duration::from_millis(100);

    while start.elapsed() < additional_timeout {
        let current_inputs: Vec<String> = Sources
            .into_iter()
            .filter_map(|s| s.display_name())
            .collect();
        let current_outputs: Vec<String> = Destinations
            .into_iter()
            .filter_map(|d| d.display_name())
            .collect();

        // Check if port count changed from the original
        if current_inputs.len() != before_inputs.len()
            || current_outputs.len() != before_outputs.len()
        {
            eprintln!(
                "[PORTS] Port count changed after {:?}: {} inputs, {} outputs",
                min_wait + start.elapsed(),
                current_inputs.len(),
                current_outputs.len()
            );
            // Wait a bit more to let CoreMIDI stabilize
            std::thread::sleep(std::time::Duration::from_millis(200));
            break;
        }

        std::thread::sleep(poll_interval);
    }

    // Log final state
    let after_inputs: Vec<String> = Sources
        .into_iter()
        .filter_map(|s| s.display_name())
        .collect();
    let after_outputs: Vec<String> = Destinations
        .into_iter()
        .filter_map(|d| d.display_name())
        .collect();
    eprintln!(
        "[PORTS] After MIDIRestart ({:?} total): {} inputs, {} outputs",
        min_wait + start.elapsed(),
        after_inputs.len(),
        after_outputs.len()
    );
}

// macOS implementation using coremidi for better hot-plug support
#[cfg(target_os = "macos")]
fn list_input_ports_coremidi() -> Vec<MidiPort> {
    use coremidi::Sources;

    let ports: Vec<MidiPort> = Sources
        .into_iter()
        .filter_map(|source| {
            source.display_name().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: true,
            })
        })
        .collect();

    eprintln!("[PORTS] Input ports (coremidi): {:?}", ports.iter().map(|p| &p.id.name).collect::<Vec<_>>());
    ports
}

#[cfg(target_os = "macos")]
fn list_output_ports_coremidi() -> Vec<MidiPort> {
    use coremidi::Destinations;

    let ports: Vec<MidiPort> = Destinations
        .into_iter()
        .filter_map(|dest| {
            dest.display_name().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: false,
            })
        })
        .collect();

    eprintln!("[PORTS] Output ports (coremidi): {:?}", ports.iter().map(|p| &p.id.name).collect::<Vec<_>>());
    ports
}

// Fallback implementation using midir (for non-macOS platforms)
#[cfg(not(target_os = "macos"))]
fn list_input_ports_midir() -> Vec<MidiPort> {
    use midir::MidiInput;

    let Ok(midi_in) = MidiInput::new("midi-router-enum") else {
        return Vec::new();
    };

    let ports: Vec<MidiPort> = midi_in
        .ports()
        .iter()
        .filter_map(|port| {
            midi_in.port_name(port).ok().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: true,
            })
        })
        .collect();

    eprintln!("[PORTS] Input ports (midir): {:?}", ports.iter().map(|p| &p.id.name).collect::<Vec<_>>());
    ports
}

#[cfg(not(target_os = "macos"))]
fn list_output_ports_midir() -> Vec<MidiPort> {
    use midir::MidiOutput;

    let Ok(midi_out) = MidiOutput::new("midi-router-enum") else {
        return Vec::new();
    };

    let ports: Vec<MidiPort> = midi_out
        .ports()
        .iter()
        .filter_map(|port| {
            midi_out.port_name(port).ok().map(|name| MidiPort {
                id: PortId::new(name),
                is_input: false,
            })
        })
        .collect();

    eprintln!("[PORTS] Output ports (midir): {:?}", ports.iter().map(|p| &p.id.name).collect::<Vec<_>>());
    ports
}

pub fn list_all_ports() -> (Vec<MidiPort>, Vec<MidiPort>) {
    (list_input_ports(), list_output_ports())
}
