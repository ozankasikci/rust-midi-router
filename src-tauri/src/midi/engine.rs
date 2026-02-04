use crate::midi::clock::ClockGenerator;
use crate::midi::port_manager::PortManager;
use crate::midi::ports::{list_input_ports, list_output_ports};
use crate::midi::router::{apply_cc_mappings, parse_midi_message, should_route};
use crate::midi::transport::{is_transport_message, messages as transport, TransportMessage};
use crate::types::{ClockState, EngineError, MidiActivity, MidiPort, Route};
use crossbeam_channel::{bounded, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug)]
pub enum EngineCommand {
    RefreshPorts,
    SetRoutes(Vec<Route>),
    SetBpm(f64),
    SendStart,
    SendStop,
    Shutdown,
}

#[derive(Debug, Clone)]
pub enum EngineEvent {
    PortsChanged {
        inputs: Vec<MidiPort>,
        outputs: Vec<MidiPort>,
    },
    MidiActivity(MidiActivity),
    ClockStateChanged(ClockState),
    Error(EngineError),
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

    pub fn set_bpm(&self, bpm: f64) -> Result<(), String> {
        self.send_command(EngineCommand::SetBpm(bpm))
    }

    pub fn send_start(&self) -> Result<(), String> {
        self.send_command(EngineCommand::SendStart)
    }

    pub fn send_stop(&self) -> Result<(), String> {
        self.send_command(EngineCommand::SendStop)
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

    // Internal channel for MIDI data from callbacks
    let (midi_tx, midi_rx) = bounded::<(String, u64, Vec<u8>)>(1024);

    // Error channel (PortManager sends errors here, we forward to event_tx)
    let (error_tx, error_rx) = bounded::<EngineError>(64);

    // Port manager
    let mut port_manager = PortManager::new(midi_tx, error_tx);

    // Clock generator
    let mut clock = ClockGenerator::new(120.0);

    // Send initial port list
    let (inputs, outputs) = (list_input_ports(), list_output_ports());
    let _ = event_tx.send(EngineEvent::PortsChanged {
        inputs: inputs.clone(),
        outputs: outputs.clone(),
    });

    // Send initial clock state
    let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
        bpm: clock.bpm(),
        running: clock.is_running(),
    }));

    loop {
        // Forward any errors from PortManager to event channel
        while let Ok(error) = error_rx.try_recv() {
            let _ = event_tx.send(EngineEvent::Error(error));
        }

        // Generate clock pulses if running
        if clock.should_tick() {
            port_manager.send_to_all(TransportMessage::Clock.as_bytes());
        }

        // Check for MIDI data from callbacks (non-blocking)
        while let Ok((port_name, timestamp, bytes)) = midi_rx.try_recv() {
            // Handle transport messages to control clock
            if !bytes.is_empty() {
                match bytes[0] {
                    transport::START => {
                        eprintln!("[MIDI] START received from {}", port_name);
                        if !clock.is_running() {
                            clock.start();
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock.bpm(),
                                running: clock.is_running(),
                            }));
                        }
                        // Forward Start to all outputs
                        eprintln!("[TRANSPORT] Forwarding START to all outputs");
                        port_manager.send_to_all(TransportMessage::Start.as_bytes());
                    }
                    transport::CONTINUE => {
                        eprintln!("[MIDI] CONTINUE received from {}", port_name);
                        if !clock.is_running() {
                            clock.continue_playback();
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock.bpm(),
                                running: clock.is_running(),
                            }));
                        }
                        // Forward Continue to all outputs
                        eprintln!("[TRANSPORT] Forwarding CONTINUE to all outputs");
                        port_manager.send_to_all(TransportMessage::Continue.as_bytes());
                    }
                    transport::STOP => {
                        eprintln!("[MIDI] STOP received from {}", port_name);
                        if clock.is_running() {
                            clock.stop();
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock.bpm(),
                                running: clock.is_running(),
                            }));
                        }
                        // Forward Stop to all outputs
                        eprintln!("[TRANSPORT] Forwarding STOP to all outputs");
                        port_manager.send_to_all(TransportMessage::Stop.as_bytes());
                    }
                    transport::CLOCK => {} // Ignore incoming clock - we generate our own
                    _ => {}
                }
            }

            // Parse and send activity event
            if let Some(activity) = parse_midi_message(timestamp, &port_name, &bytes) {
                let _ = event_tx.send(EngineEvent::MidiActivity(activity));
            }

            // Route the message (but not transport - we handle that above)
            if is_transport_message(&bytes) {
                continue; // Skip routing for transport/clock messages
            }

            let routes_guard = routes.lock().unwrap();

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

                // Apply CC mappings - may produce 0, 1, or multiple output messages
                let output_messages = apply_cc_mappings(&bytes, route);

                for msg in output_messages {
                    eprintln!("[ROUTE] Sending {:02X?} to {}", msg, route.destination.name);
                    if let Err(e) = port_manager.send_to(&route.destination.name, &msg) {
                        eprintln!("[ROUTE] Send error: {}", e);
                    }
                }
            }
        }

        // Check for commands (with short timeout for clock accuracy)
        match cmd_rx.recv_timeout(Duration::from_millis(1)) {
            Ok(EngineCommand::RefreshPorts) => {
                // Close all connections to force CoreMIDI to refresh port list
                port_manager.clear_all();

                // Small delay to let CoreMIDI update
                std::thread::sleep(Duration::from_millis(100));

                let (inputs, outputs) = (list_input_ports(), list_output_ports());
                eprintln!("[ENGINE] After refresh: {} inputs, {} outputs", inputs.len(), outputs.len());
                let _ = event_tx.send(EngineEvent::PortsChanged { inputs, outputs });
            }
            Ok(EngineCommand::SetRoutes(new_routes)) => {
                // Update routes
                {
                    let mut routes_guard = routes.lock().unwrap();
                    *routes_guard = new_routes.clone();
                }

                // Sync port connections with new routes
                port_manager.sync_with_routes(&new_routes);
            }
            Ok(EngineCommand::SetBpm(bpm)) => {
                clock.set_bpm(bpm);
                eprintln!("[CLOCK] BPM set to {}", clock.bpm());
                let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                    bpm: clock.bpm(),
                    running: clock.is_running(),
                }));
            }
            Ok(EngineCommand::SendStart) => {
                eprintln!("[TRANSPORT] Sending START");
                clock.start();
                let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                    bpm: clock.bpm(),
                    running: clock.is_running(),
                }));
                port_manager.send_to_all(TransportMessage::Start.as_bytes());
            }
            Ok(EngineCommand::SendStop) => {
                eprintln!("[TRANSPORT] Sending STOP");
                clock.stop();
                let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                    bpm: clock.bpm(),
                    running: clock.is_running(),
                }));
                port_manager.send_to_all(TransportMessage::Stop.as_bytes());
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
