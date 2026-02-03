# Clock Master Feature Design

## Overview

The app becomes a MIDI clock master that generates tempo-accurate clock pulses (0xF8) and forwards transport messages (Start/Stop/Continue) to all connected outputs.

**How it works:**
- User sets BPM in the top bar (e.g., 120.0)
- When an external device sends Start (0xFA), the app begins emitting 24 clock pulses per beat to all outputs
- When Stop (0xFC) is received, clock stops
- Connected devices receive clock + transport and play in sync

**Use case:** Minilab 3 sends Start/Stop but no clock. App generates clock. Digitone receives both and plays in sync.

## UI Design

Clock controls live in the top bar, always visible:

```
[Preset: Studio Setup ▼] [Save]  |  BPM: [120.0] ● Stopped  |  [Settings]
```

The indicator shows:
- `● Stopped` (gray) - clock not running
- `▶ Playing` (green) - clock running

**BPM input:**
- Number input field
- Range: 20-300 BPM
- Precision: 0.1 BPM increments
- Default: 120 BPM

## Architecture

The MIDI thread gets a clock generator that runs alongside the existing router:

```
┌─────────────────────────────────────────────────────────┐
│  MIDI Thread                                            │
│                                                         │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │ Clock Gen    │     │ Router       │                 │
│  │ (24 ppqn)    │     │ (existing)   │                 │
│  └──────┬───────┘     └──────┬───────┘                 │
│         │                    │                          │
│         └────────┬───────────┘                          │
│                  ▼                                      │
│         ┌──────────────┐                               │
│         │ All Outputs  │                               │
│         └──────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

**Clock timing:**
- MIDI clock sends 24 pulses per quarter note (PPQN standard)
- At 120 BPM: one pulse every 20.83ms (1000ms / 120 / 24)
- Uses high-resolution timer for accuracy

**Transport handling:**
- Incoming Start (0xFA) → start clock generator + forward to outputs
- Incoming Stop (0xFC) → stop clock generator + forward to outputs
- Incoming Continue (0xFB) → resume clock + forward to outputs

## Data Structures

### Rust Types

```rust
struct ClockState {
    bpm: f64,           // e.g., 120.0
    running: bool,      // true when playing
}

enum EngineCommand {
    // ... existing commands
    SetBpm(f64),
    StartClock,
    StopClock,
}

enum EngineEvent {
    // ... existing events
    ClockStateChanged { bpm: f64, running: bool },
}
```

### Frontend State (Zustand)

```typescript
interface AppState {
  // ... existing state
  clockBpm: number;
  clockRunning: boolean;
  setClockBpm: (bpm: number) => void;
}
```

### Tauri Commands

- `set_bpm(bpm: f64)` - Update tempo, takes effect immediately
- `get_clock_state()` - Returns current BPM and running status

Clock responds to incoming transport automatically. UI observes state changes via Tauri events.

## UI Component

```tsx
function ClockControl() {
  const { clockBpm, clockRunning, setClockBpm } = useAppStore();

  return (
    <div className="clock-control">
      <label>BPM:</label>
      <input
        type="number"
        value={clockBpm}
        onChange={e => setClockBpm(parseFloat(e.target.value))}
        min={20} max={300} step={0.1}
      />
      <span className={clockRunning ? "playing" : "stopped"}>
        {clockRunning ? "▶ Playing" : "● Stopped"}
      </span>
    </div>
  );
}
```

## Configuration

BPM is persisted in the app config:

```json
{
  "clock": {
    "bpm": 120.0
  },
  "presets": [...],
  "active_preset_id": "..."
}
```

## Implementation Notes

1. **Timer accuracy** - Use `std::time::Instant` and spin-wait for sub-millisecond precision
2. **Thread safety** - Clock state protected by mutex, BPM changes are atomic
3. **Output selection** - Clock goes to all currently connected outputs (same as routes)
4. **No UI play button** - Transport controlled entirely by incoming MIDI (Minilab 3)
