use crate::midi::ports::{list_input_ports, list_output_ports};
use crate::midi::router::{apply_cc_mappings, parse_midi_message, should_route};
use crate::types::{ClockState, MidiActivity, MidiPort, Route};
use crossbeam_channel::{bounded, Receiver, Sender};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub enum EngineCommand {
    RefreshPorts,
    SetRoutes(Vec<Route>),
    SetBpm(f64),
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

    pub fn set_bpm(&self, bpm: f64) -> Result<(), String> {
        self.send_command(EngineCommand::SetBpm(bpm))
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

    // Clock state
    let mut clock_bpm: f64 = 120.0;
    let mut clock_running: bool = false;
    let mut last_clock_tick: Option<Instant> = None;

    // Send initial port list
    let (inputs, outputs) = (list_input_ports(), list_output_ports());
    let _ = event_tx.send(EngineEvent::PortsChanged {
        inputs: inputs.clone(),
        outputs: outputs.clone(),
    });

    // Send initial clock state
    let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
        bpm: clock_bpm,
        running: clock_running,
    }));

    loop {
        // Generate clock pulses if running
        if clock_running {
            let clock_interval = Duration::from_secs_f64(60.0 / clock_bpm / 24.0);
            let now = Instant::now();

            let should_tick = match last_clock_tick {
                None => true,
                Some(last) => now.duration_since(last) >= clock_interval,
            };

            if should_tick {
                // Increment by interval instead of setting to now to prevent drift
                last_clock_tick = Some(match last_clock_tick {
                    None => now,
                    Some(last) => {
                        // If we've fallen too far behind (>2 intervals), reset to now
                        let next = last + clock_interval;
                        if now.duration_since(next) > clock_interval {
                            now
                        } else {
                            next
                        }
                    }
                });
                let mut outputs_guard = output_connections.lock().unwrap();
                for (name, conn) in outputs_guard.iter_mut() {
                    if let Err(e) = conn.send(&[0xF8]) {
                        eprintln!("[CLOCK] Failed to send clock to {}: {:?}", name, e);
                    }
                }
            }
        }

        // Check for MIDI data from callbacks (non-blocking)
        while let Ok((port_name, timestamp, bytes)) = midi_rx.try_recv() {
            // Handle transport messages to control clock
            if !bytes.is_empty() {
                match bytes[0] {
                    0xFA => {
                        eprintln!("[MIDI] START received from {}", port_name);
                        if !clock_running {
                            clock_running = true;
                            last_clock_tick = None; // Reset timing
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock_bpm,
                                running: clock_running,
                            }));
                        }
                        // Forward Start to all outputs
                        let mut outputs_guard = output_connections.lock().unwrap();
                        for (name, conn) in outputs_guard.iter_mut() {
                            eprintln!("[CLOCK] Sending START to {}", name);
                            let _ = conn.send(&[0xFA]);
                        }
                    }
                    0xFB => {
                        eprintln!("[MIDI] CONTINUE received from {}", port_name);
                        if !clock_running {
                            clock_running = true;
                            // Don't reset timing for continue
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock_bpm,
                                running: clock_running,
                            }));
                        }
                        // Forward Continue to all outputs
                        let mut outputs_guard = output_connections.lock().unwrap();
                        for (name, conn) in outputs_guard.iter_mut() {
                            eprintln!("[CLOCK] Sending CONTINUE to {}", name);
                            let _ = conn.send(&[0xFB]);
                        }
                    }
                    0xFC => {
                        eprintln!("[MIDI] STOP received from {}", port_name);
                        if clock_running {
                            clock_running = false;
                            let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                                bpm: clock_bpm,
                                running: clock_running,
                            }));
                        }
                        // Forward Stop to all outputs
                        let mut outputs_guard = output_connections.lock().unwrap();
                        for (name, conn) in outputs_guard.iter_mut() {
                            eprintln!("[CLOCK] Sending STOP to {}", name);
                            let _ = conn.send(&[0xFC]);
                        }
                    }
                    0xF8 => {} // Ignore incoming clock - we generate our own
                    _ => {}
                }
            }

            // Parse and send activity event
            if let Some(activity) = parse_midi_message(timestamp, &port_name, &bytes) {
                let _ = event_tx.send(EngineEvent::MidiActivity(activity));
            }

            // Route the message (but not transport - we handle that above)
            if !bytes.is_empty() && matches!(bytes[0], 0xFA | 0xFB | 0xFC | 0xF8) {
                continue; // Skip routing for transport/clock messages
            }

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

                // Apply CC mappings - may produce 0, 1, or multiple output messages
                let output_messages = apply_cc_mappings(&bytes, route);

                if let Some(out_conn) = outputs_guard.get_mut(&route.destination.name) {
                    for msg in output_messages {
                        eprintln!("[ROUTE] Sending {:02X?} to {}", msg, route.destination.name);
                        match out_conn.send(&msg) {
                            Ok(_) => {}
                            Err(e) => eprintln!("[ROUTE] Send error: {:?}", e),
                        }
                    }
                } else {
                    eprintln!("[ROUTE] Output not connected: {}", route.destination.name);
                }
            }
        }

        // Check for commands (with short timeout for clock accuracy)
        match cmd_rx.recv_timeout(Duration::from_millis(1)) {
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
                        eprintln!("[ENGINE] Already connected to input: {}", input_name);
                        continue;
                    }

                    eprintln!("[ENGINE] Connecting to input: {}", input_name);
                    if let Ok(mut midi_in) = MidiInput::new("midi-router") {
                        // Don't filter any messages - we want clock, sysex, active sense, etc.
                        midi_in.ignore(midir::Ignore::None);
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
                                    eprintln!("[CALLBACK] {} bytes from {}: {:02X?}", bytes.len(), name, bytes);
                                    let _ = tx.send((name.clone(), timestamp, bytes.to_vec()));
                                },
                                (),
                            ) {
                                Ok(conn) => {
                                    eprintln!("[ENGINE] Successfully connected to input: {}", input_name);
                                    input_connections.insert(input_name, conn);
                                }
                                Err(e) => {
                                    eprintln!("[ENGINE] Failed to connect input {}: {}", input_name, e);
                                    let _ = event_tx.send(EngineEvent::Error(format!(
                                        "Failed to connect input: {}",
                                        e
                                    )));
                                }
                            }
                        } else {
                            eprintln!("[ENGINE] Port not found: {}", input_name);
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
                            eprintln!("[ENGINE] Already connected to output: {}", output_name);
                            continue;
                        }

                        eprintln!("[ENGINE] Connecting to output: {}", output_name);
                        if let Ok(midi_out) = MidiOutput::new("midi-router") {
                            let port = midi_out.ports().into_iter().find(|p| {
                                midi_out.port_name(p).ok().as_ref() == Some(&output_name)
                            });

                            if let Some(port) = port {
                                match midi_out.connect(&port, "midi-router-out") {
                                    Ok(conn) => {
                                        eprintln!("[ENGINE] Successfully connected to output: {}", output_name);
                                        outputs_guard.insert(output_name, conn);
                                    }
                                    Err(e) => {
                                        eprintln!("[ENGINE] Failed to connect output {}: {}", output_name, e);
                                        let _ = event_tx.send(EngineEvent::Error(format!(
                                            "Failed to connect output: {}",
                                            e
                                        )));
                                    }
                                }
                            } else {
                                eprintln!("[ENGINE] Output port not found: {}", output_name);
                            }
                        }
                    }
                }
            }
            Ok(EngineCommand::SetBpm(bpm)) => {
                clock_bpm = bpm.clamp(20.0, 300.0);
                eprintln!("[CLOCK] BPM set to {}", clock_bpm);
                let _ = event_tx.send(EngineEvent::ClockStateChanged(ClockState {
                    bpm: clock_bpm,
                    running: clock_running,
                }));
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
