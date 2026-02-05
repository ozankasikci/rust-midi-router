//! MIDI Port connection management
//!
//! Handles connecting, disconnecting, and sending to MIDI ports.

use crate::types::{EngineError, Route};
use crossbeam_channel::Sender;
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

/// Message type for MIDI input callbacks
pub type MidiMessage = (String, u64, Vec<u8>);

/// Manages MIDI port connections
pub struct PortManager {
    input_connections: HashMap<String, MidiInputConnection<()>>,
    output_connections: Arc<Mutex<HashMap<String, MidiOutputConnection>>>,
    midi_tx: Sender<MidiMessage>,
    error_tx: Sender<EngineError>,
}

impl PortManager {
    pub fn new(midi_tx: Sender<MidiMessage>, error_tx: Sender<EngineError>) -> Self {
        Self {
            input_connections: HashMap::new(),
            output_connections: Arc::new(Mutex::new(HashMap::new())),
            midi_tx,
            error_tx,
        }
    }

    /// Get a clone of the output connections (for use in clock/transport)
    pub fn output_connections(&self) -> Arc<Mutex<HashMap<String, MidiOutputConnection>>> {
        self.output_connections.clone()
    }

    /// Clear all connections (for port refresh)
    pub fn clear_all(&mut self) {
        eprintln!(
            "[PORT_MGR] Clearing {} inputs, {} outputs",
            self.input_connections.len(),
            self.output_connections.lock().unwrap().len()
        );
        self.input_connections.clear();
        self.output_connections.lock().unwrap().clear();
    }

    /// Synchronize connections with the given routes
    /// Returns errors for any failed connections
    pub fn sync_with_routes(&mut self, routes: &[Route]) {
        let needed_inputs = Self::needed_input_ports(routes);
        let needed_outputs = Self::needed_output_ports(routes);

        self.sync_inputs(needed_inputs);
        self.sync_outputs(needed_outputs);
    }

    /// Calculate input ports needed for the given routes
    pub fn needed_input_ports(routes: &[Route]) -> HashSet<String> {
        routes
            .iter()
            .filter(|r| r.enabled)
            .map(|r| r.source.name.clone())
            .collect()
    }

    /// Calculate output ports needed for the given routes
    pub fn needed_output_ports(routes: &[Route]) -> HashSet<String> {
        routes
            .iter()
            .filter(|r| r.enabled)
            .map(|r| r.destination.name.clone())
            .collect()
    }

    /// Synchronize input connections with needed ports
    fn sync_inputs(&mut self, needed: HashSet<String>) {
        // Remove connections no longer needed
        self.input_connections
            .retain(|name, _| needed.contains(name));

        // Add new connections
        for input_name in needed {
            if self.input_connections.contains_key(&input_name) {
                eprintln!("[PORT_MGR] Already connected to input: {}", input_name);
                continue;
            }

            self.connect_input(&input_name);
        }
    }

    /// Synchronize output connections with needed ports
    fn sync_outputs(&mut self, needed: HashSet<String>) {
        let mut outputs_guard = self.output_connections.lock().unwrap();

        // Remove connections no longer needed
        outputs_guard.retain(|name, _| needed.contains(name));

        // Add new connections
        for output_name in needed {
            if outputs_guard.contains_key(&output_name) {
                eprintln!("[PORT_MGR] Already connected to output: {}", output_name);
                continue;
            }

            // Connect to output port
            if let Some(conn) = self.connect_output(&output_name) {
                outputs_guard.insert(output_name, conn);
            }
        }
    }

    /// Connect to an input port
    fn connect_input(&mut self, input_name: &str) {
        eprintln!("[PORT_MGR] Connecting to input: {}", input_name);

        let midi_in = match MidiInput::new("midi-router") {
            Ok(mut m) => {
                // Don't filter any messages - we want clock, sysex, active sense, etc.
                m.ignore(midir::Ignore::None);
                m
            }
            Err(e) => {
                eprintln!("[PORT_MGR] Failed to create MidiInput: {}", e);
                let _ = self.error_tx.send(EngineError::PortConnectionFailed {
                    port_name: input_name.to_string(),
                    reason: e.to_string(),
                });
                return;
            }
        };

        let port = midi_in
            .ports()
            .into_iter()
            .find(|p| midi_in.port_name(p).ok().as_ref() == Some(&input_name.to_string()));

        let Some(port) = port else {
            eprintln!("[PORT_MGR] Input port not found: {}", input_name);
            return;
        };

        let tx = self.midi_tx.clone();
        let name = input_name.to_string();
        let name_for_closure = name.clone();

        match midi_in.connect(
            &port,
            "midi-router-in",
            move |timestamp, bytes, _| {
                eprintln!(
                    "[CALLBACK] {} bytes from {}: {:02X?}",
                    bytes.len(),
                    name_for_closure,
                    bytes
                );
                let _ = tx.send((name_for_closure.clone(), timestamp, bytes.to_vec()));
            },
            (),
        ) {
            Ok(conn) => {
                eprintln!("[PORT_MGR] Successfully connected to input: {}", input_name);
                self.input_connections.insert(name, conn);
            }
            Err(e) => {
                eprintln!("[PORT_MGR] Failed to connect input {}: {}", input_name, e);
                let _ = self.error_tx.send(EngineError::PortConnectionFailed {
                    port_name: input_name.to_string(),
                    reason: e.to_string(),
                });
            }
        }
    }

    /// Connect to an output port, returning the connection if successful
    fn connect_output(&self, output_name: &str) -> Option<MidiOutputConnection> {
        eprintln!("[PORT_MGR] Connecting to output: {}", output_name);

        let midi_out = match MidiOutput::new("midi-router") {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[PORT_MGR] Failed to create MidiOutput: {}", e);
                let _ = self.error_tx.send(EngineError::PortConnectionFailed {
                    port_name: output_name.to_string(),
                    reason: e.to_string(),
                });
                return None;
            }
        };

        let port = midi_out
            .ports()
            .into_iter()
            .find(|p| midi_out.port_name(p).ok().as_ref() == Some(&output_name.to_string()));

        let Some(port) = port else {
            eprintln!("[PORT_MGR] Output port not found: {}", output_name);
            return None;
        };

        match midi_out.connect(&port, "midi-router-out") {
            Ok(conn) => {
                eprintln!(
                    "[PORT_MGR] Successfully connected to output: {}",
                    output_name
                );
                Some(conn)
            }
            Err(e) => {
                eprintln!(
                    "[PORT_MGR] Failed to connect output {}: {}",
                    output_name, e
                );
                let _ = self.error_tx.send(EngineError::PortConnectionFailed {
                    port_name: output_name.to_string(),
                    reason: e.to_string(),
                });
                None
            }
        }
    }

    /// Send a MIDI message to all connected outputs
    pub fn send_to_all(&self, bytes: &[u8]) {
        let mut outputs_guard = self.output_connections.lock().unwrap();
        for (name, conn) in outputs_guard.iter_mut() {
            if let Err(e) = conn.send(bytes) {
                eprintln!("[PORT_MGR] Failed to send to {}: {:?}", name, e);
            }
        }
    }

    /// Send a MIDI message to a specific output
    pub fn send_to(&self, output_name: &str, bytes: &[u8]) -> Result<(), EngineError> {
        let mut outputs_guard = self.output_connections.lock().unwrap();
        if let Some(conn) = outputs_guard.get_mut(output_name) {
            conn.send(bytes).map_err(|e| EngineError::SendFailed {
                port_name: output_name.to_string(),
                reason: e.to_string(),
            })
        } else {
            Err(EngineError::SendFailed {
                port_name: output_name.to_string(),
                reason: "Port not connected".to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ChannelFilter, PortId};
    use crossbeam_channel::bounded;
    use uuid::Uuid;

    fn make_test_route(source: &str, dest: &str, enabled: bool) -> Route {
        Route {
            id: Uuid::new_v4(),
            source: PortId::new(source.to_string()),
            destination: PortId::new(dest.to_string()),
            enabled,
            channels: ChannelFilter::All,
            cc_passthrough: true,
            cc_mappings: vec![],
        }
    }

    #[test]
    fn needed_input_ports_filters_enabled() {
        let routes = vec![
            make_test_route("Input A", "Output A", true),
            make_test_route("Input B", "Output B", false),
            make_test_route("Input C", "Output C", true),
        ];

        let needed = PortManager::needed_input_ports(&routes);
        assert!(needed.contains("Input A"));
        assert!(!needed.contains("Input B")); // disabled
        assert!(needed.contains("Input C"));
    }

    #[test]
    fn needed_output_ports_filters_enabled() {
        let routes = vec![
            make_test_route("Input A", "Output A", true),
            make_test_route("Input B", "Output B", false),
            make_test_route("Input C", "Output C", true),
        ];

        let needed = PortManager::needed_output_ports(&routes);
        assert!(needed.contains("Output A"));
        assert!(!needed.contains("Output B")); // disabled
        assert!(needed.contains("Output C"));
    }

    #[test]
    fn needed_ports_deduplicates() {
        let routes = vec![
            make_test_route("Input A", "Output A", true),
            make_test_route("Input A", "Output B", true), // same input
        ];

        let needed_inputs = PortManager::needed_input_ports(&routes);
        assert_eq!(needed_inputs.len(), 1);
        assert!(needed_inputs.contains("Input A"));

        let needed_outputs = PortManager::needed_output_ports(&routes);
        assert_eq!(needed_outputs.len(), 2);
    }

    #[test]
    fn needed_input_ports_empty_routes() {
        let routes: Vec<Route> = vec![];
        let needed = PortManager::needed_input_ports(&routes);
        assert!(needed.is_empty());
    }

    #[test]
    fn needed_output_ports_empty_routes() {
        let routes: Vec<Route> = vec![];
        let needed = PortManager::needed_output_ports(&routes);
        assert!(needed.is_empty());
    }

    #[test]
    fn needed_ports_all_disabled() {
        let routes = vec![
            make_test_route("Input A", "Output A", false),
            make_test_route("Input B", "Output B", false),
        ];

        let needed_inputs = PortManager::needed_input_ports(&routes);
        assert!(needed_inputs.is_empty());

        let needed_outputs = PortManager::needed_output_ports(&routes);
        assert!(needed_outputs.is_empty());
    }

    #[test]
    fn port_manager_clear_all_resets_state() {
        let (midi_tx, _midi_rx) = bounded(10);
        let (error_tx, _error_rx) = bounded(10);

        let mut manager = PortManager::new(midi_tx, error_tx);

        // After clear_all, internal hashmaps should be empty
        // We can verify by checking that sync_with_routes connects ports
        // (This is a behavioral test since we can't directly access private fields)
        manager.clear_all();

        // No panic, clear completes successfully
    }

    #[test]
    fn port_manager_sync_with_routes_handles_nonexistent_ports() {
        let (midi_tx, _midi_rx) = bounded(10);
        let (error_tx, _error_rx) = bounded(10);

        let mut manager = PortManager::new(midi_tx, error_tx);

        let routes = vec![
            make_test_route("Nonexistent Input", "Nonexistent Output", true),
        ];

        // Should not panic, just log errors
        manager.sync_with_routes(&routes);
    }

    #[test]
    fn port_manager_send_to_nonexistent_returns_error() {
        let (midi_tx, _midi_rx) = bounded(10);
        let (error_tx, _error_rx) = bounded(10);

        let manager = PortManager::new(midi_tx, error_tx);

        let result = manager.send_to("Nonexistent Port", &[0x90, 60, 100]);
        assert!(result.is_err());
    }

    #[test]
    fn port_manager_send_to_all_empty_does_not_panic() {
        let (midi_tx, _midi_rx) = bounded(10);
        let (error_tx, _error_rx) = bounded(10);

        let manager = PortManager::new(midi_tx, error_tx);

        // Should not panic with no connections
        manager.send_to_all(&[0x90, 60, 100]);
    }
}
