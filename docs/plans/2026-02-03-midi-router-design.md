# MIDI Router Design

## Overview

An open source, cross-platform MIDI router targeting power users who want a modern, actively maintained alternative to legacy tools like MidiPipe and Bome MIDI Translator.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Rust + Tauri 2 |
| Frontend | React + TypeScript |
| MIDI I/O | midir (cross-platform) |
| Message parsing | wmidi (zero-allocation) |
| Real-time comms | crossbeam-channel |
| Config | serde + JSON |

## v1 Scope

**In scope:**
- Routing matrix (grid UI)
- Channel filtering
- Global presets (save/load configurations)
- MIDI monitor (activity LEDs + full log)

**Out of scope (future):**
- Message type filtering
- Transformations (transpose, channel remap, velocity scaling)
- Hot-plug detection
- Per-device auto-profiles

**Target platforms:** macOS, Windows, Linux from day one.

## Architecture

### Threading Model

```
┌─────────────────────────────────────────────────────────┐
│                      Tauri App                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐      commands       ┌──────────────┐  │
│  │              │ ◄────────────────── │              │  │
│  │  MIDI Thread │                     │  Main Thread │  │
│  │              │ ────────────────►   │  (Tauri)     │  │
│  └──────────────┘   events/activity   └──────────────┘  │
│         │                                    │          │
│         │ midir callbacks                    │ IPC      │
│         ▼                                    ▼          │
│  ┌──────────────┐                     ┌──────────────┐  │
│  │ MIDI Devices │                     │ React UI     │  │
│  └──────────────┘                     └──────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Thread Responsibilities

| Thread | Does | Doesn't |
|--------|------|---------|
| MIDI thread | Receive MIDI, route messages, send to outputs | Touch UI, read/write files, serialize JSON |
| Main thread | Handle Tauri commands, manage config, bridge to UI | Process MIDI directly |

### Communication

- `std::sync::mpsc` for commands (main → MIDI thread)
- `crossbeam-channel` for events (MIDI → main)
- Tauri channels for UI streaming (main → frontend)

## Data Structures

### Rust Types

```rust
struct Route {
    id: Uuid,
    source: PortId,
    destination: PortId,
    enabled: bool,
    channels: ChannelFilter,
}

enum ChannelFilter {
    All,
    Only(Vec<u8>),
    Except(Vec<u8>),
}

struct PortId {
    name: String,
    display_name: String,
}

struct Preset {
    id: Uuid,
    name: String,
    routes: Vec<Route>,
    created_at: DateTime,
    modified_at: DateTime,
}

struct AppConfig {
    presets: Vec<Preset>,
    active_preset_id: Option<Uuid>,
    port_aliases: HashMap<String, String>,
    monitor_settings: MonitorSettings,
}

enum MidiActivity {
    Message {
        timestamp: u64,
        port: String,
        channel: u8,
        kind: MessageKind,
        data: Vec<u8>,
    },
    PortError { port: String, error: String },
}

enum MessageKind {
    NoteOn, NoteOff, ControlChange, ProgramChange,
    PitchBend, Aftertouch, SysEx, Other,
}
```

## UI Design

### Main Window Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Preset: [Studio Setup ▼]  [Save] [Save As]      [Settings] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ROUTING MATRIX                        │  OUTPUT 1 │ OUT 2 │
│  ─────────────────────────────────────┼───────────┼───────│
│  Digitakt                     [●]     │    [✓]    │  [ ]  │
│  Keystep                      [●]     │    [ ]    │  [✓]  │
│  DAW Out                      [ ]     │    [✓]    │  [✓]  │
│                                                             │
├──────────────────────────────────────────────────── [tabs] ─┤
│  [Matrix]  [Monitor]                                        │
├─────────────────────────────────────────────────────────────┤
│  Monitor Log (when Monitor tab active):                     │
│  12:01:05.123  Digitakt    Ch 1   NoteOn    C3  vel=100    │
│  12:01:05.125  Digitakt    Ch 1   NoteOff   C3  vel=0      │
│  12:01:05.200  Keystep     Ch 5   CC        74  val=64     │
│  [Clear]  [Pause]  Filter: [All ports ▼] [All types ▼]     │
└─────────────────────────────────────────────────────────────┘
```

### Interaction Model

- **Left click** cell: Toggle route on/off (all channels by default)
- **Right click** cell: Open channel config popup with 16 checkboxes
- **Activity indicators**: Pulsing glow on port labels when MIDI flows

### Components

| Component | Purpose |
|-----------|---------|
| PresetBar | Dropdown to select preset, save/save-as buttons |
| RoutingMatrix | Grid of inputs × outputs with activity LEDs |
| MatrixCell | Single route toggle, shows channel badge if filtered |
| ChannelPopup | Right-click menu with 16 channel checkboxes |
| MonitorLog | Scrolling list of MIDI messages, filterable |
| PortLabel | Port name with activity indicator, double-click to rename |

### Visual Feedback

- Empty cell: no route
- Filled cell: route active (all channels)
- Filled cell with badge: route active with channel filter (e.g., "Ch 1-4")
- Pulsing glow on row/column headers: recent MIDI activity

## Project Structure

```
midi-router/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs              # Tauri setup, thread spawning
│       ├── commands.rs          # Tauri command handlers
│       ├── midi/
│       │   ├── mod.rs
│       │   ├── engine.rs        # MIDI thread main loop
│       │   ├── router.rs        # Route matching & message forwarding
│       │   └── ports.rs         # Port enumeration & connection
│       ├── config/
│       │   ├── mod.rs
│       │   ├── preset.rs        # Preset load/save logic
│       │   └── storage.rs       # File system operations
│       └── types.rs             # Shared types (Route, Preset, etc.)
│
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── PresetBar.tsx
│   │   ├── RoutingMatrix.tsx
│   │   ├── MatrixCell.tsx
│   │   ├── ChannelPopup.tsx
│   │   ├── PortLabel.tsx
│   │   └── MonitorLog.tsx
│   ├── hooks/
│   │   ├── useMidi.ts
│   │   ├── usePresets.ts
│   │   └── useMonitor.ts
│   ├── stores/
│   │   └── appStore.ts
│   └── types/
│       └── index.ts
│
├── package.json
└── README.md
```

### Config File Locations

- macOS: `~/Library/Application Support/midi-router/config.json`
- Windows: `%APPDATA%/midi-router/config.json`
- Linux: `~/.config/midi-router/config.json`

## Implementation Phases

### Phase 1: Skeleton
- Tauri + React project setup
- Basic window with placeholder UI
- Rust MIDI thread scaffold (no actual MIDI yet)
- Verify build works on all three platforms

### Phase 2: MIDI Engine
- Port enumeration with midir
- Connect to inputs, receive callbacks
- Connect to outputs, send messages
- Basic "route everything" pass-through (no filtering)
- Test with real hardware

### Phase 3: Routing Logic
- Route data structure implementation
- Route matching in MIDI callback
- Channel filtering
- Commands from main thread: add/remove/update routes

### Phase 4: Matrix UI
- RoutingMatrix component with dynamic rows/columns
- MatrixCell with click-to-toggle
- ChannelPopup on right-click
- Wire up to Tauri commands

### Phase 5: Monitor
- Activity events from MIDI thread → main → frontend
- Activity indicators on port labels
- MonitorLog component with scrolling messages
- Filter controls (by port, by message type)

### Phase 6: Presets
- Save/load config to JSON
- PresetBar UI
- Preset switching (clear routes, apply new ones)
- Auto-save on changes (optional)

### Phase 7: Polish
- Port aliasing (rename devices)
- Keyboard shortcuts
- Error handling & user feedback
- Platform testing & bug fixes

## Dependencies

```toml
# Cargo.toml
[dependencies]
midir = "0.10"
wmidi = "4.0"
crossbeam-channel = "0.5"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.0", features = ["v4", "serde"] }
dirs = "5.0"
tauri = { version = "2", features = ["devtools"] }
tokio = { version = "1", features = ["sync"] }
```

```json
// package.json (key deps)
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18",
    "zustand": "^4"
  }
}
```

## References

- Research doc: `docs/research/compass_artifact_*.md`
- midir: https://github.com/Boddlnagg/midir
- wmidi: https://github.com/RustAudio/wmidi
- Tauri channels: https://tauri.app/develop/calling-rust/#channels
- Mididash (similar project): https://github.com/tiagolr/mididash
