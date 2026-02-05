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
    RefreshPorts {
        /// Optional one-shot channel to signal when refresh is complete
        done_tx: Option<crossbeam_channel::Sender<()>>,
    },
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

    /// Refresh ports asynchronously (non-blocking)
    pub fn refresh_ports(&self) -> Result<(), String> {
        self.send_command(EngineCommand::RefreshPorts { done_tx: None })
    }

    /// Refresh ports and block until the engine has completed the refresh
    pub fn refresh_ports_sync(&self) -> Result<(), String> {
        let (done_tx, done_rx) = crossbeam_channel::bounded(1);
        self.send_command(EngineCommand::RefreshPorts {
            done_tx: Some(done_tx),
        })?;
        // Wait for engine to signal completion (with timeout to avoid deadlock)
        // Allow up to 5 seconds for CoreMIDI to rescan on macOS
        done_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "Timeout waiting for port refresh".to_string())
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

/// Engine loop - runs in dedicated thread, processes commands and routes MIDI
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
            Ok(EngineCommand::RefreshPorts { done_tx }) => {
                // Close all connections first
                port_manager.clear_all();

                // Force CoreMIDI to rescan all devices (macOS only)
                #[cfg(target_os = "macos")]
                {
                    crate::midi::ports::force_coremidi_refresh();
                }

                #[cfg(not(target_os = "macos"))]
                {
                    // On other platforms, just wait a bit
                    std::thread::sleep(Duration::from_millis(100));
                }

                let (inputs, outputs) = (list_input_ports(), list_output_ports());
                eprintln!("[ENGINE] After refresh: {} inputs, {} outputs", inputs.len(), outputs.len());
                let _ = event_tx.send(EngineEvent::PortsChanged { inputs, outputs });

                // Signal completion if caller is waiting
                if let Some(tx) = done_tx {
                    let _ = tx.send(());
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to wait for an event matching a predicate with timeout
    fn wait_for_event<F>(event_rx: &Receiver<EngineEvent>, timeout_ms: u64, mut predicate: F) -> bool
    where
        F: FnMut(&EngineEvent) -> bool,
    {
        let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
        while std::time::Instant::now() < deadline {
            match event_rx.recv_timeout(Duration::from_millis(10)) {
                Ok(event) if predicate(&event) => return true,
                Ok(_) => continue, // Event didn't match, keep looking
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => return false,
            }
        }
        false
    }

    #[test]
    fn engine_creates_and_shuts_down() {
        let engine = MidiEngine::new();
        // Engine should be running
        assert!(engine.shutdown().is_ok());
    }

    #[test]
    fn engine_set_bpm_sends_clock_state_event() {
        let engine = MidiEngine::new();
        let event_rx = engine.event_receiver();

        // Wait for initial events to be sent, then set BPM
        std::thread::sleep(Duration::from_millis(50));

        // Set BPM (this will send a ClockStateChanged event)
        engine.set_bpm(140.0).unwrap();

        // Wait for ClockStateChanged event with correct BPM
        // Note: we may see initial event first (120 BPM), so keep looking
        let found = wait_for_event(&event_rx, 1000, |event| {
            if let EngineEvent::ClockStateChanged(state) = event {
                (state.bpm - 140.0).abs() < 0.001
            } else {
                false
            }
        });
        assert!(found, "Should have received ClockStateChanged event with BPM 140");

        engine.shutdown().unwrap();
    }

    #[test]
    fn engine_refresh_ports_sync_completes() {
        let engine = MidiEngine::new();

        // refresh_ports_sync should complete without timeout
        let result = engine.refresh_ports_sync();
        assert!(result.is_ok(), "refresh_ports_sync should complete: {:?}", result);

        engine.shutdown().unwrap();
    }

    #[test]
    fn engine_refresh_ports_emits_ports_changed_event() {
        let engine = MidiEngine::new();
        let event_rx = engine.event_receiver();

        // Drain initial events
        std::thread::sleep(Duration::from_millis(100));
        while event_rx.try_recv().is_ok() {}

        // Trigger refresh (sync ensures completion)
        engine.refresh_ports_sync().unwrap();

        // Check for PortsChanged event
        let found = wait_for_event(&event_rx, 500, |event| {
            matches!(event, EngineEvent::PortsChanged { .. })
        });
        assert!(found, "Should have received PortsChanged event");

        engine.shutdown().unwrap();
    }

    #[test]
    fn engine_transport_start_changes_clock_state() {
        let engine = MidiEngine::new();
        let event_rx = engine.event_receiver();

        // Wait for engine to initialize
        std::thread::sleep(Duration::from_millis(50));

        // Send start
        engine.send_start().unwrap();

        // Wait for ClockStateChanged with running=true
        let found = wait_for_event(&event_rx, 1000, |event| {
            if let EngineEvent::ClockStateChanged(state) = event {
                state.running
            } else {
                false
            }
        });
        assert!(found, "Clock should be running after start");

        engine.shutdown().unwrap();
    }

    #[test]
    fn engine_transport_stop_changes_clock_state() {
        let engine = MidiEngine::new();
        let event_rx = engine.event_receiver();

        // Start first and wait for it to process
        engine.send_start().unwrap();
        let _ = wait_for_event(&event_rx, 500, |event| {
            matches!(event, EngineEvent::ClockStateChanged(state) if state.running)
        });

        // Send stop
        engine.send_stop().unwrap();

        // Wait for ClockStateChanged with running=false
        let found = wait_for_event(&event_rx, 500, |event| {
            matches!(event, EngineEvent::ClockStateChanged(state) if !state.running)
        });
        assert!(found, "Clock should be stopped after stop");

        engine.shutdown().unwrap();
    }

    #[test]
    fn engine_set_routes_does_not_panic() {
        use crate::types::{ChannelFilter, PortId, Route};

        let engine = MidiEngine::new();

        let routes = vec![Route {
            id: uuid::Uuid::new_v4(),
            source: PortId::new("Nonexistent Input".to_string()),
            destination: PortId::new("Nonexistent Output".to_string()),
            enabled: true,
            channels: ChannelFilter::All,
            cc_passthrough: true,
            cc_mappings: vec![],
        }];

        // Should not panic even with nonexistent ports
        let result = engine.set_routes(routes);
        assert!(result.is_ok());

        engine.shutdown().unwrap();
    }
}
