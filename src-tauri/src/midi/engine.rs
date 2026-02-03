use crate::midi::ports::{list_input_ports, list_output_ports};
use crate::midi::router::{parse_midi_message, should_route};
use crate::types::{MidiActivity, MidiPort, Route};
use crossbeam_channel::{bounded, Receiver, Sender};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug)]
pub enum EngineCommand {
    RefreshPorts,
    SetRoutes(Vec<Route>),
    Shutdown,
}

#[derive(Debug, Clone)]
pub enum EngineEvent {
    PortsChanged {
        inputs: Vec<MidiPort>,
        outputs: Vec<MidiPort>,
    },
    MidiActivity(MidiActivity),
    Error(String),
}

pub struct MidiEngine {
    cmd_tx: Sender<EngineCommand>,
    event_rx: Receiver<EngineEvent>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl MidiEngine {
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = bounded::<EngineCommand>(64);
        let (event_tx, event_rx) = bounded::<EngineEvent>(256);

        let thread_handle = thread::spawn(move || {
            engine_loop(cmd_rx, event_tx);
        });

        Self {
            cmd_tx,
            event_rx,
            thread_handle: Some(thread_handle),
        }
    }

    pub fn send_command(&self, cmd: EngineCommand) -> Result<(), String> {
        self.cmd_tx
            .send(cmd)
            .map_err(|e| format!("Failed to send command: {}", e))
    }

    pub fn try_recv_event(&self) -> Option<EngineEvent> {
        self.event_rx.try_recv().ok()
    }

    pub fn event_receiver(&self) -> Receiver<EngineEvent> {
        self.event_rx.clone()
    }

    pub fn refresh_ports(&self) -> Result<(), String> {
        self.send_command(EngineCommand::RefreshPorts)
    }

    pub fn set_routes(&self, routes: Vec<Route>) -> Result<(), String> {
        self.send_command(EngineCommand::SetRoutes(routes))
    }

    pub fn shutdown(&self) -> Result<(), String> {
        self.send_command(EngineCommand::Shutdown)
    }
}

impl Drop for MidiEngine {
    fn drop(&mut self) {
        let _ = self.shutdown();
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

fn engine_loop(cmd_rx: Receiver<EngineCommand>, event_tx: Sender<EngineEvent>) {
    let routes: Arc<Mutex<Vec<Route>>> = Arc::new(Mutex::new(Vec::new()));
    let mut input_connections: HashMap<String, MidiInputConnection<()>> = HashMap::new();
    let output_connections: Arc<Mutex<HashMap<String, MidiOutputConnection>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Internal channel for MIDI data from callbacks
    let (midi_tx, midi_rx) = bounded::<(String, u64, Vec<u8>)>(1024);

    // Send initial port list
    let (inputs, outputs) = (list_input_ports(), list_output_ports());
    let _ = event_tx.send(EngineEvent::PortsChanged {
        inputs: inputs.clone(),
        outputs: outputs.clone(),
    });

    loop {
        // Check for MIDI data from callbacks (non-blocking)
        while let Ok((port_name, timestamp, bytes)) = midi_rx.try_recv() {
            // Parse and send activity event
            if let Some(activity) = parse_midi_message(timestamp, &port_name, &bytes) {
                let _ = event_tx.send(EngineEvent::MidiActivity(activity));
            }

            // Route the message
            let routes_guard = routes.lock().unwrap();
            let mut outputs_guard = output_connections.lock().unwrap();

            for route in routes_guard.iter() {
                if !route.enabled {
                    continue;
                }
                if route.source.name != port_name {
                    continue;
                }
                if !should_route(&bytes, &route.channels) {
                    continue;
                }

                if let Some(out_conn) = outputs_guard.get_mut(&route.destination.name) {
                    let _ = out_conn.send(&bytes);
                }
            }
        }

        // Check for commands (with timeout to keep responsive)
        match cmd_rx.recv_timeout(std::time::Duration::from_millis(10)) {
            Ok(EngineCommand::RefreshPorts) => {
                let (inputs, outputs) = (list_input_ports(), list_output_ports());
                let _ = event_tx.send(EngineEvent::PortsChanged { inputs, outputs });
            }
            Ok(EngineCommand::SetRoutes(new_routes)) => {
                // Update routes
                {
                    let mut routes_guard = routes.lock().unwrap();
                    *routes_guard = new_routes.clone();
                }

                // Connect to any new input ports needed
                let needed_inputs: std::collections::HashSet<String> = new_routes
                    .iter()
                    .filter(|r| r.enabled)
                    .map(|r| r.source.name.clone())
                    .collect();

                // Remove connections no longer needed
                input_connections.retain(|name, _| needed_inputs.contains(name));

                // Add new connections
                for input_name in needed_inputs {
                    if input_connections.contains_key(&input_name) {
                        continue;
                    }

                    if let Ok(midi_in) = MidiInput::new("midi-router") {
                        let port = midi_in.ports().into_iter().find(|p| {
                            midi_in.port_name(p).ok().as_ref() == Some(&input_name)
                        });

                        if let Some(port) = port {
                            let tx = midi_tx.clone();
                            let name = input_name.clone();

                            match midi_in.connect(
                                &port,
                                "midi-router-in",
                                move |timestamp, bytes, _| {
                                    let _ = tx.send((name.clone(), timestamp, bytes.to_vec()));
                                },
                                (),
                            ) {
                                Ok(conn) => {
                                    input_connections.insert(input_name, conn);
                                }
                                Err(e) => {
                                    let _ = event_tx.send(EngineEvent::Error(format!(
                                        "Failed to connect input: {}",
                                        e
                                    )));
                                }
                            }
                        }
                    }
                }

                // Connect to any new output ports needed
                let needed_outputs: std::collections::HashSet<String> = new_routes
                    .iter()
                    .filter(|r| r.enabled)
                    .map(|r| r.destination.name.clone())
                    .collect();

                {
                    let mut outputs_guard = output_connections.lock().unwrap();

                    // Remove connections no longer needed
                    outputs_guard.retain(|name, _| needed_outputs.contains(name));

                    // Add new connections
                    for output_name in needed_outputs {
                        if outputs_guard.contains_key(&output_name) {
                            continue;
                        }

                        if let Ok(midi_out) = MidiOutput::new("midi-router") {
                            let port = midi_out.ports().into_iter().find(|p| {
                                midi_out.port_name(p).ok().as_ref() == Some(&output_name)
                            });

                            if let Some(port) = port {
                                match midi_out.connect(&port, "midi-router-out") {
                                    Ok(conn) => {
                                        outputs_guard.insert(output_name, conn);
                                    }
                                    Err(e) => {
                                        let _ = event_tx.send(EngineEvent::Error(format!(
                                            "Failed to connect output: {}",
                                            e
                                        )));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(EngineCommand::Shutdown) => {
                break;
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                // Normal timeout, continue loop
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                break;
            }
        }
    }
}
