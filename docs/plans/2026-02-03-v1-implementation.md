# MIDI Router v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-platform MIDI router with routing matrix UI, channel filtering, presets, and MIDI monitor.

**Architecture:** Tauri 2 app with dedicated MIDI thread (midir) communicating via channels to React frontend. Lock-free message passing ensures low-latency routing while UI remains responsive.

**Tech Stack:** Rust, Tauri 2, midir, wmidi, crossbeam-channel, React 18, TypeScript, Zustand

---

## Phase 1: Project Skeleton

### Task 1: Initialize Tauri + React Project

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `package.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

**Step 1: Create Tauri project with React template**

Run:
```bash
cd /Users/ozan/Projects/rust-midi-router/.worktrees/v1-implementation
npm create tauri-app@latest . -- --template react-ts --manager npm
```

Select defaults when prompted. This creates the full project structure.

**Step 2: Verify project structure exists**

Run:
```bash
ls -la src-tauri/src/main.rs src/App.tsx package.json
```

Expected: All three files exist.

**Step 3: Install dependencies**

Run:
```bash
npm install
```

Expected: node_modules created, no errors.

**Step 4: Verify app launches**

Run:
```bash
npm run tauri dev
```

Expected: Window opens with Tauri + React welcome screen. Close the window after verifying.

**Step 5: Commit**

```bash
git add -A
git commit -m "Initialize Tauri + React project"
```

---

### Task 2: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add MIDI and channel dependencies to Cargo.toml**

Add to `[dependencies]` section in `src-tauri/Cargo.toml`:

```toml
midir = "0.10"
wmidi = "4.0"
crossbeam-channel = "0.5"
uuid = { version = "1.0", features = ["v4", "serde"] }
dirs = "5.0"
```

**Step 2: Verify dependencies compile**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors (warnings OK).

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Add MIDI and utility dependencies"
```

---

### Task 3: Create Rust Module Structure

**Files:**
- Create: `src-tauri/src/midi/mod.rs`
- Create: `src-tauri/src/midi/engine.rs`
- Create: `src-tauri/src/midi/router.rs`
- Create: `src-tauri/src/midi/ports.rs`
- Create: `src-tauri/src/config/mod.rs`
- Create: `src-tauri/src/config/preset.rs`
- Create: `src-tauri/src/config/storage.rs`
- Create: `src-tauri/src/types.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create directory structure**

Run:
```bash
mkdir -p src-tauri/src/midi src-tauri/src/config
```

**Step 2: Create empty module files**

Create `src-tauri/src/types.rs`:
```rust
//! Shared types for MIDI router
```

Create `src-tauri/src/commands.rs`:
```rust
//! Tauri command handlers
```

Create `src-tauri/src/midi/mod.rs`:
```rust
pub mod engine;
pub mod ports;
pub mod router;
```

Create `src-tauri/src/midi/engine.rs`:
```rust
//! MIDI thread main loop
```

Create `src-tauri/src/midi/router.rs`:
```rust
//! Route matching and message forwarding
```

Create `src-tauri/src/midi/ports.rs`:
```rust
//! Port enumeration and connection
```

Create `src-tauri/src/config/mod.rs`:
```rust
pub mod preset;
pub mod storage;
```

Create `src-tauri/src/config/preset.rs`:
```rust
//! Preset load/save logic
```

Create `src-tauri/src/config/storage.rs`:
```rust
//! File system operations
```

**Step 3: Update main.rs to include modules**

Replace `src-tauri/src/main.rs` with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod midi;
mod types;

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 4: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 5: Commit**

```bash
git add src-tauri/src/
git commit -m "Create Rust module structure"
```

---

## Phase 2: MIDI Engine

### Task 4: Define Core Types

**Files:**
- Modify: `src-tauri/src/types.rs`

**Step 1: Write the types**

Replace `src-tauri/src/types.rs` with:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct PortId {
    pub name: String,
    pub display_name: String,
}

impl PortId {
    pub fn new(name: String) -> Self {
        let display_name = name.clone();
        Self { name, display_name }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChannelFilter {
    All,
    Only(Vec<u8>),
    Except(Vec<u8>),
}

impl Default for ChannelFilter {
    fn default() -> Self {
        Self::All
    }
}

impl ChannelFilter {
    pub fn passes(&self, channel: u8) -> bool {
        match self {
            Self::All => true,
            Self::Only(channels) => channels.contains(&channel),
            Self::Except(channels) => !channels.contains(&channel),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub id: Uuid,
    pub source: PortId,
    pub destination: PortId,
    pub enabled: bool,
    pub channels: ChannelFilter,
}

impl Route {
    pub fn new(source: PortId, destination: PortId) -> Self {
        Self {
            id: Uuid::new_v4(),
            source,
            destination,
            enabled: true,
            channels: ChannelFilter::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiPort {
    pub id: PortId,
    pub is_input: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
pub enum MessageKind {
    NoteOn { note: u8, velocity: u8 },
    NoteOff { note: u8, velocity: u8 },
    ControlChange { controller: u8, value: u8 },
    ProgramChange { program: u8 },
    PitchBend { value: u16 },
    Aftertouch { value: u8 },
    PolyAftertouch { note: u8, value: u8 },
    SysEx,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiActivity {
    pub timestamp: u64,
    pub port: String,
    pub channel: Option<u8>,
    pub kind: MessageKind,
    pub raw: Vec<u8>,
}
```

**Step 2: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src-tauri/src/types.rs
git commit -m "Define core types for routes, ports, and messages"
```

---

### Task 5: Implement Port Enumeration

**Files:**
- Modify: `src-tauri/src/midi/ports.rs`

**Step 1: Implement port listing**

Replace `src-tauri/src/midi/ports.rs` with:

```rust
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
```

**Step 2: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src-tauri/src/midi/ports.rs
git commit -m "Implement MIDI port enumeration"
```

---

### Task 6: Implement MIDI Message Parsing

**Files:**
- Modify: `src-tauri/src/midi/router.rs`

**Step 1: Implement message parsing and channel extraction**

Replace `src-tauri/src/midi/router.rs` with:

```rust
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
```

**Step 2: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src-tauri/src/midi/router.rs
git commit -m "Implement MIDI message parsing and channel filtering"
```

---

### Task 7: Implement MIDI Engine Thread

**Files:**
- Modify: `src-tauri/src/midi/engine.rs`

**Step 1: Implement the engine with command handling**

Replace `src-tauri/src/midi/engine.rs` with:

```rust
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
```

**Step 2: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src-tauri/src/midi/engine.rs
git commit -m "Implement MIDI engine with routing and channel filtering"
```

---

### Task 8: Implement Tauri Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Implement command handlers**

Replace `src-tauri/src/commands.rs` with:

```rust
use crate::midi::engine::{EngineEvent, MidiEngine};
use crate::types::{ChannelFilter, MidiActivity, MidiPort, PortId, Route};
use std::sync::Mutex;
use tauri::{ipc::Channel, State};
use uuid::Uuid;

pub struct AppState {
    pub engine: MidiEngine,
    pub routes: Mutex<Vec<Route>>,
}

#[tauri::command]
pub fn get_ports(state: State<AppState>) -> Result<(Vec<MidiPort>, Vec<MidiPort>), String> {
    state.engine.refresh_ports()?;

    // Wait briefly for the response
    std::thread::sleep(std::time::Duration::from_millis(50));

    while let Some(event) = state.engine.try_recv_event() {
        if let EngineEvent::PortsChanged { inputs, outputs } = event {
            return Ok((inputs, outputs));
        }
    }

    Ok((Vec::new(), Vec::new()))
}

#[tauri::command]
pub fn get_routes(state: State<AppState>) -> Vec<Route> {
    state.routes.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_route(
    state: State<AppState>,
    source_name: String,
    dest_name: String,
) -> Result<Route, String> {
    let source = PortId::new(source_name);
    let destination = PortId::new(dest_name);
    let route = Route::new(source, destination);

    {
        let mut routes = state.routes.lock().unwrap();
        routes.push(route.clone());
        state.engine.set_routes(routes.clone())?;
    }

    Ok(route)
}

#[tauri::command]
pub fn remove_route(state: State<AppState>, route_id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        routes.retain(|r| r.id != uuid);
        state.engine.set_routes(routes.clone())?;
    }

    Ok(())
}

#[tauri::command]
pub fn toggle_route(state: State<AppState>, route_id: String) -> Result<bool, String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;
    let mut new_enabled = false;

    {
        let mut routes = state.routes.lock().unwrap();
        if let Some(route) = routes.iter_mut().find(|r| r.id == uuid) {
            route.enabled = !route.enabled;
            new_enabled = route.enabled;
        }
        state.engine.set_routes(routes.clone())?;
    }

    Ok(new_enabled)
}

#[tauri::command]
pub fn set_route_channels(
    state: State<AppState>,
    route_id: String,
    filter: ChannelFilter,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&route_id).map_err(|e| e.to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        if let Some(route) = routes.iter_mut().find(|r| r.id == uuid) {
            route.channels = filter;
        }
        state.engine.set_routes(routes.clone())?;
    }

    Ok(())
}

#[tauri::command]
pub fn start_midi_monitor(
    state: State<AppState>,
    on_event: Channel<MidiActivity>,
) -> Result<(), String> {
    let event_rx = state.engine.event_receiver();

    std::thread::spawn(move || {
        loop {
            match event_rx.recv() {
                Ok(EngineEvent::MidiActivity(activity)) => {
                    if on_event.send(activity).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    Ok(())
}
```

**Step 2: Update main.rs to register commands and state**

Replace `src-tauri/src/main.rs` with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod midi;
mod types;

use commands::AppState;
use midi::engine::MidiEngine;
use std::sync::Mutex;

fn main() {
    let engine = MidiEngine::new();
    let app_state = AppState {
        engine,
        routes: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_ports,
            commands::get_routes,
            commands::add_route,
            commands::remove_route,
            commands::toggle_route,
            commands::set_route_channels,
            commands::start_midi_monitor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "Implement Tauri commands for MIDI routing"
```

---

## Phase 3: React Frontend

### Task 9: Install Frontend Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install UI dependencies**

Run:
```bash
npm install zustand uuid
npm install -D @types/uuid
```

**Step 2: Verify installation**

Run:
```bash
npm ls zustand uuid
```

Expected: Shows both packages installed.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add zustand and uuid dependencies"
```

---

### Task 10: Create TypeScript Types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create types matching Rust**

Create directory and file:
```bash
mkdir -p src/types
```

Create `src/types/index.ts`:

```typescript
export interface PortId {
  name: string;
  display_name: string;
}

export interface MidiPort {
  id: PortId;
  is_input: boolean;
}

export type ChannelFilter =
  | { All: null }
  | { Only: number[] }
  | { Except: number[] };

export interface Route {
  id: string;
  source: PortId;
  destination: PortId;
  enabled: boolean;
  channels: ChannelFilter;
}

export type MessageKind =
  | { kind: "NoteOn"; data: { note: number; velocity: number } }
  | { kind: "NoteOff"; data: { note: number; velocity: number } }
  | { kind: "ControlChange"; data: { controller: number; value: number } }
  | { kind: "ProgramChange"; data: { program: number } }
  | { kind: "PitchBend"; data: { value: number } }
  | { kind: "Aftertouch"; data: { value: number } }
  | { kind: "PolyAftertouch"; data: { note: number; value: number } }
  | { kind: "SysEx" }
  | { kind: "Other" };

export interface MidiActivity {
  timestamp: number;
  port: string;
  channel: number | null;
  kind: MessageKind;
  raw: number[];
}

export interface Preset {
  id: string;
  name: string;
  routes: Route[];
  created_at: string;
  modified_at: string;
}
```

**Step 2: Commit**

```bash
git add src/types/
git commit -m "Create TypeScript types matching Rust types"
```

---

### Task 11: Create Tauri API Hooks

**Files:**
- Create: `src/hooks/useMidi.ts`

**Step 1: Create hooks directory and file**

```bash
mkdir -p src/hooks
```

Create `src/hooks/useMidi.ts`:

```typescript
import { invoke, Channel } from "@tauri-apps/api/core";
import { MidiPort, Route, ChannelFilter, MidiActivity } from "../types";

export async function getPorts(): Promise<[MidiPort[], MidiPort[]]> {
  return invoke("get_ports");
}

export async function getRoutes(): Promise<Route[]> {
  return invoke("get_routes");
}

export async function addRoute(
  sourceName: string,
  destName: string
): Promise<Route> {
  return invoke("add_route", { sourceName, destName });
}

export async function removeRoute(routeId: string): Promise<void> {
  return invoke("remove_route", { routeId });
}

export async function toggleRoute(routeId: string): Promise<boolean> {
  return invoke("toggle_route", { routeId });
}

export async function setRouteChannels(
  routeId: string,
  filter: ChannelFilter
): Promise<void> {
  return invoke("set_route_channels", { routeId, filter });
}

export async function startMidiMonitor(
  onActivity: (activity: MidiActivity) => void
): Promise<void> {
  const channel = new Channel<MidiActivity>();
  channel.onmessage = onActivity;
  return invoke("start_midi_monitor", { onEvent: channel });
}
```

**Step 2: Commit**

```bash
git add src/hooks/
git commit -m "Create Tauri API hooks for MIDI commands"
```

---

### Task 12: Create App Store

**Files:**
- Create: `src/stores/appStore.ts`

**Step 1: Create store directory and file**

```bash
mkdir -p src/stores
```

Create `src/stores/appStore.ts`:

```typescript
import { create } from "zustand";
import { MidiPort, Route, MidiActivity } from "../types";
import * as api from "../hooks/useMidi";

interface AppState {
  // Ports
  inputPorts: MidiPort[];
  outputPorts: MidiPort[];
  loadingPorts: boolean;

  // Routes
  routes: Route[];

  // Monitor
  monitorActive: boolean;
  activityLog: MidiActivity[];
  portActivity: Record<string, number>; // port name -> last activity timestamp

  // Actions
  refreshPorts: () => Promise<void>;
  addRoute: (sourceName: string, destName: string) => Promise<void>;
  removeRoute: (routeId: string) => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
  startMonitor: () => Promise<void>;
  clearLog: () => void;
}

const MAX_LOG_SIZE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  inputPorts: [],
  outputPorts: [],
  loadingPorts: false,
  routes: [],
  monitorActive: false,
  activityLog: [],
  portActivity: {},

  refreshPorts: async () => {
    set({ loadingPorts: true });
    try {
      const [inputs, outputs] = await api.getPorts();
      set({ inputPorts: inputs, outputPorts: outputs });
    } finally {
      set({ loadingPorts: false });
    }
  },

  addRoute: async (sourceName: string, destName: string) => {
    const route = await api.addRoute(sourceName, destName);
    set((state) => ({ routes: [...state.routes, route] }));
  },

  removeRoute: async (routeId: string) => {
    await api.removeRoute(routeId);
    set((state) => ({
      routes: state.routes.filter((r) => r.id !== routeId),
    }));
  },

  toggleRoute: async (routeId: string) => {
    const newEnabled = await api.toggleRoute(routeId);
    set((state) => ({
      routes: state.routes.map((r) =>
        r.id === routeId ? { ...r, enabled: newEnabled } : r
      ),
    }));
  },

  startMonitor: async () => {
    if (get().monitorActive) return;

    await api.startMidiMonitor((activity) => {
      set((state) => {
        const newLog = [activity, ...state.activityLog].slice(0, MAX_LOG_SIZE);
        const newActivity = {
          ...state.portActivity,
          [activity.port]: Date.now(),
        };
        return { activityLog: newLog, portActivity: newActivity };
      });
    });

    set({ monitorActive: true });
  },

  clearLog: () => {
    set({ activityLog: [] });
  },
}));
```

**Step 2: Commit**

```bash
git add src/stores/
git commit -m "Create Zustand store for app state"
```

---

### Task 13: Create RoutingMatrix Component

**Files:**
- Create: `src/components/RoutingMatrix.tsx`

**Step 1: Create components directory and matrix component**

```bash
mkdir -p src/components
```

Create `src/components/RoutingMatrix.tsx`:

```typescript
import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { ChannelPopup } from "./ChannelPopup";
import { Route } from "../types";

export function RoutingMatrix() {
  const {
    inputPorts,
    outputPorts,
    routes,
    portActivity,
    refreshPorts,
    addRoute,
    removeRoute,
    toggleRoute,
  } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    route: Route;
  } | null>(null);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  const getRoute = (inputName: string, outputName: string): Route | undefined => {
    return routes.find(
      (r) => r.source.name === inputName && r.destination.name === outputName
    );
  };

  const handleCellClick = async (inputName: string, outputName: string) => {
    const existingRoute = getRoute(inputName, outputName);
    if (existingRoute) {
      await toggleRoute(existingRoute.id);
    } else {
      await addRoute(inputName, outputName);
    }
  };

  const handleCellRightClick = (
    e: React.MouseEvent,
    inputName: string,
    outputName: string
  ) => {
    e.preventDefault();
    const route = getRoute(inputName, outputName);
    if (route) {
      setContextMenu({ x: e.clientX, y: e.clientY, route });
    }
  };

  const isActive = (portName: string): boolean => {
    const lastActivity = portActivity[portName];
    if (!lastActivity) return false;
    return Date.now() - lastActivity < 200;
  };

  return (
    <div className="routing-matrix">
      <table>
        <thead>
          <tr>
            <th></th>
            {outputPorts.map((out) => (
              <th key={out.id.name} className={isActive(out.id.name) ? "active" : ""}>
                {out.id.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inputPorts.map((input) => (
            <tr key={input.id.name}>
              <td className={`port-label ${isActive(input.id.name) ? "active" : ""}`}>
                {input.id.display_name}
              </td>
              {outputPorts.map((output) => {
                const route = getRoute(input.id.name, output.id.name);
                return (
                  <td
                    key={output.id.name}
                    className={`matrix-cell ${route?.enabled ? "connected" : ""}`}
                    onClick={() => handleCellClick(input.id.name, output.id.name)}
                    onContextMenu={(e) =>
                      handleCellRightClick(e, input.id.name, output.id.name)
                    }
                  >
                    {route?.enabled && <span className="check">✓</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {contextMenu && (
        <ChannelPopup
          route={contextMenu.route}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/RoutingMatrix.tsx
git commit -m "Create RoutingMatrix component"
```

---

### Task 14: Create ChannelPopup Component

**Files:**
- Create: `src/components/ChannelPopup.tsx`

**Step 1: Create channel popup component**

Create `src/components/ChannelPopup.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Route, ChannelFilter } from "../types";
import { setRouteChannels, removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";

interface Props {
  route: Route;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelPopup({ route, x, y, onClose }: Props) {
  const refreshRoutes = useAppStore((s) => s.refreshPorts);
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(
    new Set()
  );
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">("all");

  useEffect(() => {
    // Initialize from route
    if ("All" in route.channels) {
      setFilterMode("all");
      setSelectedChannels(new Set());
    } else if ("Only" in route.channels) {
      setFilterMode("only");
      setSelectedChannels(new Set(route.channels.Only));
    } else if ("Except" in route.channels) {
      setFilterMode("except");
      setSelectedChannels(new Set(route.channels.Except));
    }
  }, [route]);

  const toggleChannel = (ch: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  };

  const handleApply = async () => {
    let filter: ChannelFilter;
    if (filterMode === "all") {
      filter = { All: null };
    } else if (filterMode === "only") {
      filter = { Only: Array.from(selectedChannels).sort((a, b) => a - b) };
    } else {
      filter = { Except: Array.from(selectedChannels).sort((a, b) => a - b) };
    }

    await setRouteChannels(route.id, filter);
    onClose();
  };

  const handleDelete = async () => {
    await removeRoute(route.id);
    onClose();
  };

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".channel-popup")) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      className="channel-popup"
      style={{ left: x, top: y, position: "fixed" }}
    >
      <div className="popup-header">
        <span>Channel Filter</span>
        <button onClick={onClose}>×</button>
      </div>

      <div className="filter-mode">
        <label>
          <input
            type="radio"
            checked={filterMode === "all"}
            onChange={() => setFilterMode("all")}
          />
          All channels
        </label>
        <label>
          <input
            type="radio"
            checked={filterMode === "only"}
            onChange={() => setFilterMode("only")}
          />
          Only selected
        </label>
        <label>
          <input
            type="radio"
            checked={filterMode === "except"}
            onChange={() => setFilterMode("except")}
          />
          All except selected
        </label>
      </div>

      {filterMode !== "all" && (
        <div className="channel-grid">
          {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
            <label key={ch} className="channel-checkbox">
              <input
                type="checkbox"
                checked={selectedChannels.has(ch)}
                onChange={() => toggleChannel(ch)}
              />
              {ch}
            </label>
          ))}
        </div>
      )}

      <div className="popup-actions">
        <button onClick={handleDelete} className="delete-btn">
          Delete Route
        </button>
        <button onClick={handleApply} className="apply-btn">
          Apply
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ChannelPopup.tsx
git commit -m "Create ChannelPopup component for channel filtering"
```

---

### Task 15: Create MonitorLog Component

**Files:**
- Create: `src/components/MonitorLog.tsx`

**Step 1: Create monitor log component**

Create `src/components/MonitorLog.tsx`:

```typescript
import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { MidiActivity, MessageKind } from "../types";

function formatMessage(kind: MessageKind): string {
  if (kind.kind === "NoteOn") {
    return `NoteOn  ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  }
  if (kind.kind === "NoteOff") {
    return `NoteOff ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  }
  if (kind.kind === "ControlChange") {
    return `CC ${kind.data.controller} val=${kind.data.value}`;
  }
  if (kind.kind === "ProgramChange") {
    return `PC ${kind.data.program}`;
  }
  if (kind.kind === "PitchBend") {
    return `Pitch ${kind.data.value}`;
  }
  if (kind.kind === "Aftertouch") {
    return `AT ${kind.data.value}`;
  }
  if (kind.kind === "PolyAftertouch") {
    return `PolyAT ${noteName(kind.data.note)} ${kind.data.value}`;
  }
  if (kind.kind === "SysEx") {
    return "SysEx";
  }
  return "Other";
}

function noteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave}`.padEnd(4);
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts / 1000); // Convert microseconds to milliseconds
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function ActivityRow({ activity }: { activity: MidiActivity }) {
  return (
    <tr>
      <td className="timestamp">{formatTimestamp(activity.timestamp)}</td>
      <td className="port">{activity.port}</td>
      <td className="channel">
        {activity.channel !== null ? `Ch ${activity.channel + 1}` : "-"}
      </td>
      <td className="message">{formatMessage(activity.kind)}</td>
    </tr>
  );
}

export function MonitorLog() {
  const { activityLog, monitorActive, startMonitor, clearLog } = useAppStore();

  useEffect(() => {
    if (!monitorActive) {
      startMonitor();
    }
  }, [monitorActive, startMonitor]);

  return (
    <div className="monitor-log">
      <div className="monitor-header">
        <span>MIDI Monitor</span>
        <button onClick={clearLog}>Clear</button>
      </div>
      <div className="log-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Port</th>
              <th>Ch</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {activityLog.map((activity, i) => (
              <ActivityRow key={i} activity={activity} />
            ))}
          </tbody>
        </table>
        {activityLog.length === 0 && (
          <div className="empty-state">No MIDI activity yet</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/MonitorLog.tsx
git commit -m "Create MonitorLog component for MIDI activity display"
```

---

### Task 16: Create Main App Layout

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css` (or create `src/styles.css`)

**Step 1: Update App.tsx**

Replace `src/App.tsx` with:

```typescript
import { useState } from "react";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import "./App.css";

type Tab = "matrix" | "monitor";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIDI Router</h1>
      </header>

      <main className="app-main">
        {activeTab === "matrix" && <RoutingMatrix />}
        {activeTab === "monitor" && <MonitorLog />}
      </main>

      <nav className="app-tabs">
        <button
          className={activeTab === "matrix" ? "active" : ""}
          onClick={() => setActiveTab("matrix")}
        >
          Matrix
        </button>
        <button
          className={activeTab === "monitor" ? "active" : ""}
          onClick={() => setActiveTab("monitor")}
        >
          Monitor
        </button>
      </nav>
    </div>
  );
}

export default App;
```

**Step 2: Update App.css**

Replace `src/App.css` with:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #1a1a1a;
  color: #e0e0e0;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  padding: 12px 16px;
  background: #252525;
  border-bottom: 1px solid #333;
}

.app-header h1 {
  font-size: 16px;
  font-weight: 500;
}

.app-main {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.app-tabs {
  display: flex;
  background: #252525;
  border-top: 1px solid #333;
}

.app-tabs button {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
}

.app-tabs button.active {
  color: #fff;
  background: #333;
}

/* Routing Matrix */
.routing-matrix {
  overflow: auto;
}

.routing-matrix table {
  border-collapse: collapse;
  min-width: 100%;
}

.routing-matrix th,
.routing-matrix td {
  padding: 8px 12px;
  text-align: center;
  border: 1px solid #333;
}

.routing-matrix th {
  background: #252525;
  font-weight: 500;
  font-size: 12px;
}

.routing-matrix th.active,
.routing-matrix .port-label.active {
  color: #4caf50;
}

.routing-matrix .port-label {
  text-align: left;
  background: #252525;
  font-size: 12px;
}

.matrix-cell {
  cursor: pointer;
  min-width: 60px;
  height: 40px;
  background: #2a2a2a;
  transition: background 0.15s;
}

.matrix-cell:hover {
  background: #333;
}

.matrix-cell.connected {
  background: #1b5e20;
}

.matrix-cell.connected:hover {
  background: #2e7d32;
}

.matrix-cell .check {
  color: #4caf50;
  font-weight: bold;
}

/* Channel Popup */
.channel-popup {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 500;
}

.popup-header button {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 18px;
}

.filter-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-mode label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #333;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.popup-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.popup-actions button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.delete-btn {
  background: #c62828;
  color: white;
}

.apply-btn {
  background: #1976d2;
  color: white;
}

/* Monitor Log */
.monitor-log {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.monitor-header button {
  padding: 6px 12px;
  background: #333;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
}

.log-container {
  flex: 1;
  overflow: auto;
  background: #1e1e1e;
  border-radius: 4px;
}

.monitor-log table {
  width: 100%;
  border-collapse: collapse;
  font-family: "SF Mono", Monaco, monospace;
  font-size: 12px;
}

.monitor-log th {
  text-align: left;
  padding: 8px;
  background: #252525;
  position: sticky;
  top: 0;
}

.monitor-log td {
  padding: 4px 8px;
  border-bottom: 1px solid #2a2a2a;
}

.monitor-log .timestamp {
  color: #888;
}

.monitor-log .port {
  color: #64b5f6;
}

.monitor-log .channel {
  color: #81c784;
}

.monitor-log .message {
  color: #e0e0e0;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #666;
}
```

**Step 3: Verify the app compiles and runs**

Run:
```bash
npm run tauri dev
```

Expected: App opens with dark theme, Matrix and Monitor tabs visible.

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "Create main app layout with tabs and styling"
```

---

## Phase 4: Presets

### Task 17: Implement Preset Storage in Rust

**Files:**
- Modify: `src-tauri/src/config/storage.rs`
- Modify: `src-tauri/src/config/preset.rs`
- Modify: `src-tauri/src/types.rs`

**Step 1: Add Preset type to types.rs**

Add to end of `src-tauri/src/types.rs`:

```rust
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: Uuid,
    pub name: String,
    pub routes: Vec<Route>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

impl Preset {
    pub fn new(name: String, routes: Vec<Route>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            routes,
            created_at: now,
            modified_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub presets: Vec<Preset>,
    pub active_preset_id: Option<Uuid>,
    pub port_aliases: std::collections::HashMap<String, String>,
}
```

**Step 2: Add chrono dependency**

Add to `src-tauri/Cargo.toml` dependencies:

```toml
chrono = { version = "0.4", features = ["serde"] }
```

**Step 3: Implement storage.rs**

Replace `src-tauri/src/config/storage.rs` with:

```rust
use crate::types::AppConfig;
use std::fs;
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("midi-router")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if !path.exists() {
        return AppConfig::default();
    }

    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = config_path();
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}
```

**Step 4: Implement preset.rs**

Replace `src-tauri/src/config/preset.rs` with:

```rust
use crate::config::storage::{load_config, save_config};
use crate::types::{AppConfig, Preset, Route};
use uuid::Uuid;

pub fn list_presets() -> Vec<Preset> {
    load_config().presets
}

pub fn get_preset(id: Uuid) -> Option<Preset> {
    load_config().presets.into_iter().find(|p| p.id == id)
}

pub fn save_preset(name: String, routes: Vec<Route>) -> Result<Preset, String> {
    let mut config = load_config();
    let preset = Preset::new(name, routes);
    config.presets.push(preset.clone());
    save_config(&config)?;
    Ok(preset)
}

pub fn update_preset(id: Uuid, routes: Vec<Route>) -> Result<Preset, String> {
    let mut config = load_config();

    let preset = config
        .presets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;

    preset.routes = routes;
    preset.modified_at = chrono::Utc::now();

    let updated = preset.clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_preset(id: Uuid) -> Result<(), String> {
    let mut config = load_config();
    config.presets.retain(|p| p.id != id);
    save_config(&config)?;
    Ok(())
}

pub fn set_active_preset(id: Option<Uuid>) -> Result<(), String> {
    let mut config = load_config();
    config.active_preset_id = id;
    save_config(&config)?;
    Ok(())
}

pub fn get_active_preset() -> Option<Preset> {
    let config = load_config();
    config
        .active_preset_id
        .and_then(|id| config.presets.into_iter().find(|p| p.id == id))
}
```

**Step 5: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 6: Commit**

```bash
git add src-tauri/
git commit -m "Implement preset storage and management"
```

---

### Task 18: Add Preset Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add preset commands to commands.rs**

Add to end of `src-tauri/src/commands.rs`:

```rust
use crate::config::preset;
use crate::types::Preset;

#[tauri::command]
pub fn list_presets() -> Vec<Preset> {
    preset::list_presets()
}

#[tauri::command]
pub fn save_preset(state: State<AppState>, name: String) -> Result<Preset, String> {
    let routes = state.routes.lock().unwrap().clone();
    preset::save_preset(name, routes)
}

#[tauri::command]
pub fn load_preset(state: State<AppState>, preset_id: String) -> Result<Preset, String> {
    let id = Uuid::parse_str(&preset_id).map_err(|e| e.to_string())?;
    let p = preset::get_preset(id).ok_or_else(|| "Preset not found".to_string())?;

    {
        let mut routes = state.routes.lock().unwrap();
        *routes = p.routes.clone();
        state.engine.set_routes(routes.clone())?;
    }

    preset::set_active_preset(Some(id))?;
    Ok(p)
}

#[tauri::command]
pub fn delete_preset(preset_id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&preset_id).map_err(|e| e.to_string())?;
    preset::delete_preset(id)
}

#[tauri::command]
pub fn get_active_preset_id() -> Option<String> {
    preset::get_active_preset().map(|p| p.id.to_string())
}
```

**Step 2: Register new commands in main.rs**

Update the invoke_handler in `src-tauri/src/main.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_ports,
    commands::get_routes,
    commands::add_route,
    commands::remove_route,
    commands::toggle_route,
    commands::set_route_channels,
    commands::start_midi_monitor,
    commands::list_presets,
    commands::save_preset,
    commands::load_preset,
    commands::delete_preset,
    commands::get_active_preset_id,
])
```

**Step 3: Verify compilation**

Run:
```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "Add Tauri commands for preset management"
```

---

### Task 19: Add Preset UI

**Files:**
- Modify: `src/hooks/useMidi.ts`
- Create: `src/components/PresetBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types/index.ts`

**Step 1: Add preset API functions to useMidi.ts**

Add to end of `src/hooks/useMidi.ts`:

```typescript
import { Preset } from "../types";

export async function listPresets(): Promise<Preset[]> {
  return invoke("list_presets");
}

export async function savePreset(name: string): Promise<Preset> {
  return invoke("save_preset", { name });
}

export async function loadPreset(presetId: string): Promise<Preset> {
  return invoke("load_preset", { presetId });
}

export async function deletePreset(presetId: string): Promise<void> {
  return invoke("delete_preset", { presetId });
}

export async function getActivePresetId(): Promise<string | null> {
  return invoke("get_active_preset_id");
}
```

**Step 2: Create PresetBar component**

Create `src/components/PresetBar.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Preset } from "../types";
import * as api from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";

export function PresetBar() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const routes = useAppStore((s) => s.routes);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    const [list, activeId] = await Promise.all([
      api.listPresets(),
      api.getActivePresetId(),
    ]);
    setPresets(list);
    setActivePresetId(activeId);
  };

  const handleLoad = async (presetId: string) => {
    const preset = await api.loadPreset(presetId);
    setActivePresetId(preset.id);
    // Refresh routes in store
    window.location.reload(); // Simple approach for now
  };

  const handleSave = async () => {
    if (!newPresetName.trim()) return;
    await api.savePreset(newPresetName.trim());
    setNewPresetName("");
    setShowSaveDialog(false);
    loadPresets();
  };

  const handleDelete = async (presetId: string) => {
    await api.deletePreset(presetId);
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
    loadPresets();
  };

  const activePreset = presets.find((p) => p.id === activePresetId);

  return (
    <div className="preset-bar">
      <label>Preset:</label>
      <select
        value={activePresetId || ""}
        onChange={(e) => e.target.value && handleLoad(e.target.value)}
      >
        <option value="">-- Select --</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <button onClick={() => setShowSaveDialog(true)}>Save As</button>

      {activePresetId && (
        <button onClick={() => handleDelete(activePresetId)}>Delete</button>
      )}

      {showSaveDialog && (
        <div className="save-dialog">
          <input
            type="text"
            placeholder="Preset name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Update App.tsx to include PresetBar**

Update `src/App.tsx` imports and header:

```typescript
import { useState } from "react";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import { PresetBar } from "./components/PresetBar";
import "./App.css";

type Tab = "matrix" | "monitor";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIDI Router</h1>
        <PresetBar />
      </header>

      <main className="app-main">
        {activeTab === "matrix" && <RoutingMatrix />}
        {activeTab === "monitor" && <MonitorLog />}
      </main>

      <nav className="app-tabs">
        <button
          className={activeTab === "matrix" ? "active" : ""}
          onClick={() => setActiveTab("matrix")}
        >
          Matrix
        </button>
        <button
          className={activeTab === "monitor" ? "active" : ""}
          onClick={() => setActiveTab("monitor")}
        >
          Monitor
        </button>
      </nav>
    </div>
  );
}

export default App;
```

**Step 4: Add PresetBar styles to App.css**

Add to end of `src/App.css`:

```css
/* Preset Bar */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-bar label {
  font-size: 13px;
  color: #888;
}

.preset-bar select {
  padding: 6px 10px;
  background: #333;
  border: 1px solid #444;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
}

.preset-bar button {
  padding: 6px 12px;
  background: #333;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
}

.preset-bar button:hover {
  background: #444;
}

.save-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #2a2a2a;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #444;
  z-index: 1000;
  display: flex;
  gap: 8px;
}

.save-dialog input {
  padding: 8px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #e0e0e0;
}
```

**Step 5: Verify the app runs**

Run:
```bash
npm run tauri dev
```

Expected: Preset bar visible in header with dropdown and Save As button.

**Step 6: Commit**

```bash
git add src/
git commit -m "Add PresetBar UI component for preset management"
```

---

## Phase 5: Final Polish

### Task 20: Load Active Preset on Startup

**Files:**
- Modify: `src-tauri/src/main.rs`

**Step 1: Load preset on app setup**

Update `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod midi;
mod types;

use commands::AppState;
use config::preset::get_active_preset;
use midi::engine::MidiEngine;
use std::sync::Mutex;

fn main() {
    let engine = MidiEngine::new();

    // Load active preset if one exists
    let initial_routes = get_active_preset()
        .map(|p| p.routes)
        .unwrap_or_default();

    // Apply routes to engine
    if !initial_routes.is_empty() {
        let _ = engine.set_routes(initial_routes.clone());
    }

    let app_state = AppState {
        engine,
        routes: Mutex::new(initial_routes),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_ports,
            commands::get_routes,
            commands::add_route,
            commands::remove_route,
            commands::toggle_route,
            commands::set_route_channels,
            commands::start_midi_monitor,
            commands::list_presets,
            commands::save_preset,
            commands::load_preset,
            commands::delete_preset,
            commands::get_active_preset_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 2: Verify compilation and run**

Run:
```bash
npm run tauri dev
```

Expected: App loads with previously active preset's routes restored.

**Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "Load active preset on startup"
```

---

### Task 21: Add Refresh Ports Button

**Files:**
- Modify: `src/components/RoutingMatrix.tsx`

**Step 1: Add refresh button to matrix**

Update `src/components/RoutingMatrix.tsx`, add button before the table:

```typescript
export function RoutingMatrix() {
  const {
    inputPorts,
    outputPorts,
    routes,
    portActivity,
    loadingPorts,
    refreshPorts,
    addRoute,
    removeRoute,
    toggleRoute,
  } = useAppStore();

  // ... existing code ...

  return (
    <div className="routing-matrix">
      <div className="matrix-toolbar">
        <button onClick={() => refreshPorts()} disabled={loadingPorts}>
          {loadingPorts ? "Refreshing..." : "Refresh Ports"}
        </button>
      </div>
      <table>
        {/* ... existing table ... */}
      </table>

      {/* ... existing contextMenu code ... */}
    </div>
  );
}
```

**Step 2: Add toolbar styles to App.css**

Add to `src/App.css`:

```css
.matrix-toolbar {
  margin-bottom: 12px;
}

.matrix-toolbar button {
  padding: 8px 16px;
  background: #333;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
}

.matrix-toolbar button:hover:not(:disabled) {
  background: #444;
}

.matrix-toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 3: Commit**

```bash
git add src/components/RoutingMatrix.tsx src/App.css
git commit -m "Add refresh ports button to matrix view"
```

---

### Task 22: Final Build Test

**Step 1: Build release version**

Run:
```bash
npm run tauri build
```

Expected: Build completes successfully. Binary created in `src-tauri/target/release/`.

**Step 2: Test the built app**

On macOS, run:
```bash
open src-tauri/target/release/bundle/macos/midi-router.app
```

Expected: App launches, shows any connected MIDI devices, routing works.

**Step 3: Final commit**

```bash
git add -A
git commit -m "Complete v1 MIDI router implementation"
```

---

## Summary

After completing all tasks, you will have:

1. **Tauri + React app** with dark theme
2. **MIDI engine** running on dedicated thread with midir
3. **Routing matrix** UI with click-to-toggle connections
4. **Channel filtering** via right-click popup
5. **MIDI monitor** with scrolling activity log
6. **Presets** that save/load to JSON config file
7. **Cross-platform** support (macOS, Windows, Linux)

The app is ready for real-world testing with MIDI hardware.
