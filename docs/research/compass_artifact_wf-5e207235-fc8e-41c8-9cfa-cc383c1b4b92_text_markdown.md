# Building a MIDI Router for macOS with Rust and Tauri

A Rust + Tauri stack provides an excellent foundation for building a performant, cross-platform MIDI routing application targeting Elektron synthesizers. The critical insight: **midir** handles Core MIDI abstraction, **Tauri channels** (not events) enable low-latency UI communication, and Elektron devices present as **class-compliant single-port USB MIDI** with per-track channel addressing—simplifying routing logic considerably.

## Rust MIDI libraries provide solid macOS foundations

The **midir** crate (v0.10.3, 758 GitHub stars, actively maintained) is the clear choice for cross-platform MIDI I/O. It wraps macOS Core MIDI via the coremidi crate internally, providing a Rust-idiomatic API while preserving low-latency access. For a macOS-focused app, you can also use **coremidi** directly for features like device hot-plug notifications.

**Recommended dependency stack:**
```toml
[dependencies]
midir = "0.10.3"           # Cross-platform MIDI I/O
wmidi = "4.0"              # Zero-allocation message parsing
crossbeam-channel = "0.5"  # Lock-free channels for real-time
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2", features = ["devtools"] }
```

Core MIDI on macOS uses a hierarchical model: **Driver → Device → Entity → Endpoint**. Each endpoint is either a Source (input) or Destination (output) representing a 16-channel MIDI stream. USB MIDI devices typically present one endpoint per direction. The **MIDIClientRef** represents your app's identity, while **MIDIPortRef** connections link your app to endpoints.

**Device enumeration with midir** is straightforward:
```rust
let midi_in = MidiInput::new("my-router")?;
let midi_out = MidiOutput::new("my-router")?;

for port in midi_in.ports() {
    println!("Input: {}", midi_in.port_name(&port)?);
}
for port in midi_out.ports() {
    println!("Output: {}", midi_out.port_name(&port)?);
}
```

For real-time MIDI routing, the callback model is essential. midir creates internal threads for input callbacks with the signature `FnMut(u64, &[u8], &mut T) + Send + 'static`—timestamps in microseconds, raw MIDI bytes, and optional user data. **Critical pattern**: never allocate or lock inside callbacks. Use lock-free channels (crossbeam or rtrb) to communicate with your main application thread.

## Tauri architecture requires dedicated MIDI threads

Tauri's command system works for configuration but **channels are mandatory for streaming MIDI data**—events serialize to JSON and evaluate JavaScript, adding unacceptable latency. The pattern: run MIDI I/O on dedicated threads using `std::sync::mpsc`, communicate with Tauri's async runtime via `tokio::mpsc`, and stream to the frontend via `tauri::ipc::Channel`.

**Proven architecture from existing Tauri MIDI apps:**
```rust
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum MidiStreamEvent {
    NoteOn { channel: u8, note: u8, velocity: u8 },
    NoteOff { channel: u8, note: u8 },
    DeviceConnected { name: String },
    DeviceDisconnected { name: String },
}

#[tauri::command]
fn start_midi_monitor(on_event: Channel<MidiStreamEvent>) {
    // Channel provides ordered delivery with better 
    // performance than Tauri events
    on_event.send(MidiStreamEvent::NoteOn { 
        channel: 0, note: 60, velocity: 100 
    }).unwrap();
}
```

The **Mididash** project (github.com/tiagolr/mididash) demonstrates this architecture in production: Tauri + Vue.js with node-based visual routing, Lua scripting, and device hot-plug detection. It achieves ~5% CPU under high MIDI throughput.

**State management pattern** for shared MIDI state:
```rust
struct MidiRouterState {
    inputs: Vec<MidiInputConnection<()>>,
    outputs: HashMap<String, MidiOutputConnection>,
    routes: Vec<RouteConfig>,
    device_watcher: Option<JoinHandle<()>>,
}

// Wrap in Mutex for Tauri state management
app.manage(Mutex::new(MidiRouterState::default()));
```

On macOS specifically, Core MIDI callbacks run on high-priority threads. Use `std::sync::Mutex` (not tokio's) for most cases—only use async mutex when holding locks across `.await` points.

## Elektron devices use single-port, multi-channel architecture

Elektron gear (Digitakt, Syntakt, Analog Four, Analog Rytm) is **class-compliant for USB MIDI**—no drivers needed. Each device presents as a **single USB MIDI port** to macOS, using **MIDI channels to address individual tracks**:

| Device | Track Configuration | Default Channel Mapping |
|--------|--------------------|-----------------------|
| **Digitakt** | 8 audio + 8 MIDI tracks | Tracks 1-8 = Ch 1-8; MIDI tracks configurable |
| **Syntakt** | 12 configurable tracks | Each track assignable to any channel |
| **Analog Four** | 4 synth + FX + CV tracks | Each assignable |
| **Analog Rytm** | 12 drum + FX tracks | Each assignable; sequencer doesn't output notes |

**The Auto-Channel feature** is crucial for Elektron workflow: a special channel (default 9 or 10) that automatically routes to whichever track is currently selected. External keyboards send on the auto-channel, and the device routes to the focused track—no channel switching required when browsing sounds.

**USB vs DIN MIDI configuration** matters: Elektron devices default to DIN-only output. Users must explicitly enable `USB` or `MIDI+USB` in each project's MIDI CONFIG → PORT CONFIG. This setting is **project-specific**, not global—a common source of "why isn't my USB MIDI working" issues.

**Known macOS quirks:**
- Audio MIDI Setup can create duplicate device entries causing connection failures—users should delete duplicates in MIDI Studio
- Direct USB connection recommended over hubs (powered hubs work better if needed)
- Overbridge mode changes USB behavior; device may disappear from standard MIDI device lists
- If system has >16 total MIDI ports, Elektron Transfer app may fail (acknowledged bug)

## Routing matrix design patterns from existing tools

Analysis of MidiPipe, Bome MIDI Translator, JACK, and Rust-based routers reveals consistent patterns:

**1. Route configuration structure:**
```rust
#[derive(Serialize, Deserialize, Clone)]
struct RouteConfig {
    id: Uuid,
    name: String,
    enabled: bool,
    source: PortSelector,
    destination: Vec<PortSelector>,
    filter: FilterConfig,
    transform: TransformConfig,
}

#[derive(Serialize, Deserialize, Clone)]
struct FilterConfig {
    channels: Option<Vec<u8>>,        // None = all, Some([1,2,3]) = specific
    message_types: Option<Vec<MessageType>>,  // NoteOn, CC, etc.
    note_range: Option<(u8, u8)>,     // (min, max) inclusive
    cc_numbers: Option<Vec<u8>>,      // Specific CC numbers
}

#[derive(Serialize, Deserialize, Clone)]
struct TransformConfig {
    channel_remap: Option<HashMap<u8, u8>>,  // in_ch -> out_ch
    transpose: Option<i8>,
    velocity_scale: Option<f32>,
    cc_remap: Option<HashMap<u8, u8>>,
}
```

**2. Device hot-plug via polling** (midir doesn't expose Core MIDI notifications directly):
```rust
fn device_watcher(tx: Sender<DeviceEvent>, interval: Duration) {
    let mut known_inputs: HashSet<String> = HashSet::new();
    let mut known_outputs: HashSet<String> = HashSet::new();
    
    loop {
        let midi_in = MidiInput::new("watcher").unwrap();
        let midi_out = MidiOutput::new("watcher").unwrap();
        
        let current_inputs: HashSet<_> = midi_in.ports()
            .iter()
            .filter_map(|p| midi_in.port_name(p).ok())
            .collect();
            
        // Detect additions
        for name in current_inputs.difference(&known_inputs) {
            tx.send(DeviceEvent::InputConnected(name.clone())).ok();
        }
        // Detect removals
        for name in known_inputs.difference(&current_inputs) {
            tx.send(DeviceEvent::InputDisconnected(name.clone())).ok();
        }
        
        known_inputs = current_inputs;
        // Same for outputs...
        
        thread::sleep(interval); // 1-2 seconds typical
    }
}
```

For direct Core MIDI notifications (more responsive but macOS-only), use the coremidi crate's `Client::new_with_notifications()`.

**3. Message routing logic** with wmidi for zero-allocation parsing:
```rust
use wmidi::MidiMessage;

fn route_message(
    bytes: &[u8], 
    routes: &[RouteConfig],
    outputs: &mut HashMap<String, MidiOutputConnection>
) {
    let Ok(msg) = MidiMessage::try_from(bytes) else { return };
    
    for route in routes.iter().filter(|r| r.enabled) {
        if !matches_filter(&msg, &route.filter) { continue; }
        
        let transformed = apply_transform(&msg, &route.transform);
        let out_bytes = transformed.to_bytes();
        
        for dest in &route.destination {
            if let Some(conn) = outputs.get_mut(&dest.name) {
                conn.send(&out_bytes).ok();
            }
        }
    }
}

fn matches_filter(msg: &MidiMessage, filter: &FilterConfig) -> bool {
    // Check channel filter
    if let Some(channels) = &filter.channels {
        let msg_ch = match msg {
            MidiMessage::NoteOn(ch, _, _) |
            MidiMessage::NoteOff(ch, _, _) |
            MidiMessage::ControlChange(ch, _, _) => ch.index(),
            _ => return true, // System messages pass through
        };
        if !channels.contains(&msg_ch) { return false; }
    }
    // Check message type, note range, etc...
    true
}
```

## MVP architecture recommendation

**Project structure:**
```
midi-router/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Tauri setup, state init
│   │   ├── commands.rs       # Tauri command handlers
│   │   ├── midi/
│   │   │   ├── mod.rs
│   │   │   ├── router.rs     # Core routing logic
│   │   │   ├── devices.rs    # Enumeration, hot-plug
│   │   │   └── types.rs      # RouteConfig, FilterConfig
│   │   └── config.rs         # Persistence (JSON/TOML)
│   └── Cargo.toml
├── src/                      # Frontend (React/Svelte/Vue)
│   ├── components/
│   │   ├── DeviceList.tsx
│   │   ├── RoutingMatrix.tsx
│   │   └── MidiMonitor.tsx
│   └── App.tsx
└── package.json
```

**Backend architecture:**

```rust
// main.rs - Core threading model
fn main() {
    let (midi_cmd_tx, midi_cmd_rx) = std::sync::mpsc::channel();
    let (midi_event_tx, midi_event_rx) = std::sync::mpsc::channel();
    
    // Spawn dedicated MIDI processing thread
    let midi_thread = std::thread::spawn(move || {
        midi_processor_loop(midi_cmd_rx, midi_event_tx);
    });
    
    tauri::Builder::default()
        .manage(MidiCommandSender(Mutex::new(midi_cmd_tx)))
        .setup(|app| {
            // Bridge MIDI events to Tauri async runtime
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(event) = midi_event_rx.recv() {
                    handle.emit("midi-activity", event).ok();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_devices, create_route, update_route, 
            delete_route, start_monitor, load_config, save_config
        ])
        .run(tauri::generate_context!())
        .unwrap();
}
```

**Configuration persistence** using serde:
```rust
#[derive(Serialize, Deserialize)]
struct AppConfig {
    routes: Vec<RouteConfig>,
    device_aliases: HashMap<String, String>,  // Display name -> port name
    auto_connect: bool,
    polling_interval_ms: u64,
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap()
        .join("midi-router")
        .join("config.json")
}

fn load_config() -> Result<AppConfig, Error> {
    let contents = fs::read_to_string(config_path())?;
    Ok(serde_json::from_str(&contents)?)
}
```

**Frontend routing matrix UI** (React example):
```tsx
function RoutingMatrix({ inputs, outputs, routes, onRouteToggle }) {
    return (
        <table className="routing-matrix">
            <thead>
                <tr>
                    <th></th>
                    {outputs.map(out => <th key={out}>{out}</th>)}
                </tr>
            </thead>
            <tbody>
                {inputs.map(input => (
                    <tr key={input}>
                        <td>{input}</td>
                        {outputs.map(output => (
                            <td key={output}>
                                <RouteCell 
                                    active={hasRoute(routes, input, output)}
                                    onClick={() => onRouteToggle(input, output)}
                                />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
```

## Implementation phases for the MVP

**Phase 1 (Core routing):** Device enumeration, basic input→output routing, single callback thread. Validate with Elektron device connected.

**Phase 2 (Filtering):** Channel filtering (essential for Elektron multi-track routing), message type filtering, note range filtering for keyboard splits.

**Phase 3 (UI):** Tauri frontend with device list, routing matrix grid, connection status indicators. Use throttled updates for MIDI activity display.

**Phase 4 (Persistence):** Save/load configurations, device aliases for reconnection after unplug, auto-connect on startup.

**Phase 5 (Polish):** Hot-plug handling with graceful reconnection, channel remapping transforms, MIDI activity monitor for debugging.

**Latency expectations:** USB MIDI on macOS typically achieves **1-3ms** round-trip. Core MIDI itself adds sub-millisecond overhead. The midir + wmidi stack preserves this performance with zero-allocation message handling. Avoid JSON serialization in the hot path—use Tauri channels with binary or pre-serialized formats for activity monitoring.

**Key Elektron-specific considerations:** Support auto-channel awareness in the UI (highlight which channel goes to selected track), remember that Elektron devices default USB MIDI to OFF (document this clearly), and handle the single-port-multi-channel model where each Elektron device is one MIDI "endpoint" with 16 channels rather than multiple ports.