# Clock Master Implementation Plan

## Tasks

### 1. Add clock state and commands to engine types
- Add `ClockState` struct to `types.rs`
- Add `SetBpm`, `StartClock`, `StopClock` to `EngineCommand`
- Add `ClockStateChanged` to `EngineEvent`

### 2. Implement clock generator in MIDI thread
- Add clock state (bpm, running) to engine loop
- Create high-precision timer loop that sends 0xF8 every (60000 / bpm / 24) ms
- Send clock to all connected outputs when running

### 3. Handle incoming transport messages
- When Start (0xFA) received: set running=true, forward to outputs
- When Stop (0xFC) received: set running=false, forward to outputs
- When Continue (0xFB) received: set running=true, forward to outputs
- Emit `ClockStateChanged` event when state changes

### 4. Add Tauri commands
- `set_bpm(bpm: f64)` - sends SetBpm command to engine
- `get_clock_state()` - returns current ClockState

### 5. Add ClockControl UI component
- BPM number input (20-300, step 0.1)
- Running indicator (● Stopped / ▶ Playing)
- Wire up to Tauri commands and events

### 6. Persist BPM in config
- Add `clock_bpm: f64` to AppConfig
- Load on startup, save on change
