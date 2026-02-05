# MIDI Learn — Two-Step Auto-Mapping

## Overview

A two-step MIDI learn flow that creates CC mappings by physically moving knobs — no manual number entry. Wiggle a knob on the controller (captures source CC + channel), then wiggle a parameter on the synth (captures destination CC + channel). The mapping is auto-created on the matching route.

## Three Entry Points

All three trigger the same underlying learn engine:

- **A) CC Mappings Editor** — "Auto Learn" button inside the per-route CC mappings panel. Route context is already known, so port detection is skipped.
- **B) Global Header Button** — "Learn" button in the top toolbar. Route is auto-detected from the ports the CCs arrive on.
- **C) Physical MIDI Trigger** — A dedicated CC on a controller button starts the flow without touching the UI. Route is auto-detected (same as B).

## Core State Machine

```
Idle → WaitingForSource → WaitingForDestination → Idle
```

### Idle → WaitingForSource

Triggered by UI button (A/B) or physical MIDI trigger (C). The engine intercepts all incoming CCs across all input ports.

### WaitingForSource → WaitingForDestination

First CC received is captured as `(source_port, source_cc, source_channel)`. The engine now listens on all input ports except the source port for the synth's response.

### WaitingForDestination → Idle

Second CC received (from a different input port) is captured as `(dest_input_port, dest_cc, dest_channel)`. The engine:

1. Finds the corresponding output port by name-matching `dest_input_port`.
2. Finds an existing route from `source_port → matched_output_port`, or creates one (enabled, ChannelFilter::All, cc_passthrough = true).
3. Adds the CC mapping: `source_cc → CcTarget { cc: dest_cc, channels: [dest_channel] }`.
4. If source_cc already has mappings on that route, appends as an additional target (never overwrites).
5. Persists to the active preset.
6. Emits a `LearnComplete` event to the frontend.

### Cancellation

Re-triggering learn (physical button or UI) from any non-Idle state returns to Idle. No timeout.

## Destination Capture via Bidirectional Ports

Synths connected via USB MIDI expose both an input and output port with the same (or similar) name. The learn flow listens for the synth's CC on its **input port**, then matches it to the corresponding **output port** by name (case-insensitive, trimmed).

Example:
```
Controller: Input "Keystep Pro" → captures source CC
Synth:      Input "Digitone II MIDI" → captures dest CC
            Output "Digitone II MIDI" → used as route destination
```

## Physical Trigger Configuration

Stored in AppConfig:

```rust
pub struct MidiLearnConfig {
    pub trigger_port: Option<PortId>,  // None = any input port
    pub trigger_cc: u8,
    pub trigger_channel: u8,
}
```

- Intercepted at the engine level before routing — never forwarded to outputs.
- If `trigger_port` is None, intercepted from any input port.
- Configured via a settings panel with its own mini learn flow ("Set Trigger" → press button).
- Optional — UI-based learn (A and B) works without this configured.

## Port Matching & Route Resolution

1. Match dest input port → output port by name (case-insensitive, trimmed).
2. Find existing route where `source = step1_port` and `destination = matched_output_port`.
   - Found: add CC mapping to that route.
   - Not found: create new route and add the mapping.
3. Self-referencing ignored — if step 2 CC arrives on the same port as step 1, skip it and keep waiting.
4. Learn trigger CC is always filtered out and never captured.

## Channel Handling

Both source and destination lock to the exact channel captured:
- Source: the channel the controller CC arrived on.
- Destination: the channel the synth CC arrived on.

## UI States

The global header button reflects learn state regardless of how it was triggered:

| State | Visual | Label |
|-------|--------|-------|
| Idle | Default | "Learn" |
| WaitingForSource | Pulsing | "Move a controller knob..." |
| WaitingForDestination | Different pulse | "Move a synth parameter..." |
| Complete | Brief flash/toast | "CC 1 ch1 → CC 74 ch1 on Digitone II" |

### Frontend Events

```
LearnStateChanged { state: "idle" | "waiting_source" | "waiting_destination" }
LearnComplete { route_id, source_cc, source_channel, dest_cc, dest_channel, created_new_route }
LearnCancelled
LearnError { message }
```

## Edge Cases

- **No matching output port** — Emit `LearnError`, return to Idle.
- **Learn triggered while already learning** — Cancel current, return to Idle.
- **Port disappears mid-learn** — Cancel, emit `LearnError`.
- **Multiple CCs simultaneously** — First one wins.
- **Same CC for source and destination** — Allowed (different ports/channels).
- **Physical trigger not configured** — UI buttons still work independently.
