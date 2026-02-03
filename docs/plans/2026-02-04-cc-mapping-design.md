# CC Mapping Feature Design

## Overview

Each route gets an optional CC mapping layer that transforms incoming CCs before sending to the destination. This allows a single controller knob to control multiple parameters across multiple channels on the target synth.

## Data Model

```rust
struct CcTarget {
    cc: u8,
    channels: Vec<u8>,
}

struct CcMapping {
    source_cc: u8,
    targets: Vec<CcTarget>,
}

struct Route {
    // ...existing fields...
    cc_passthrough: bool,      // true = unmapped CCs pass through, false = block
    cc_mappings: Vec<CcMapping>,
}
```

**Example mapping:**
- Controller CC 1 → Digitone CC 74 (filter) on Ch 1, 2, 3
- Controller CC 1 → Digitone CC 71 (resonance) on Ch 1

## Behavior

1. When CC arrives on a route, check if a mapping exists for that CC number
2. If mapped: send to all target CC/channel combinations
3. If not mapped: pass through unchanged (if passthrough=true) or drop (if passthrough=false)
4. Non-CC messages (notes, pitch bend, etc.) always pass through unchanged

## UI Design

The route's right-click popup (ChannelPopup) gets a new "CC Mappings" tab:

```
┌─────────────────────────────────────────────────┐
│  Route: Minilab3 → Digitone II            [×]  │
├─────────────────────────────────────────────────┤
│  [Channels]  [CC Mappings]                      │
├─────────────────────────────────────────────────┤
│  ☑ Pass through unmapped CCs                    │
│                                                 │
│  Source CC │ Target CC │ Channels              │
│  ──────────┼───────────┼─────────────────────  │
│     1      │    74     │ 1, 2, 3               │
│     1      │    71     │ 1                     │
│     7      │    7      │ 1, 2, 3, 4            │
│                                                 │
│  [+ Add Mapping]                                │
│                                                 │
│  ─────────────────────────────────────────────  │
│  [Delete Route]                    [Apply]      │
└─────────────────────────────────────────────────┘
```

**Interactions:**
- Click "+ Add Mapping" to add a new row
- Edit cells inline (source CC, target CC, channels as comma-separated)
- Delete row with × button on hover
- Apply saves all changes

## Implementation

### Rust Types (types.rs)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CcTarget {
    pub cc: u8,
    pub channels: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CcMapping {
    pub source_cc: u8,
    pub targets: Vec<CcTarget>,
}

// Add to Route struct:
pub cc_passthrough: bool,
pub cc_mappings: Vec<CcMapping>,
```

### Router Logic (router.rs)

```rust
fn apply_cc_mappings(
    bytes: &[u8],
    route: &Route,
) -> Vec<Vec<u8>> {
    // Parse CC message
    let status = bytes[0];
    let cc_num = bytes[1];
    let value = bytes[2];

    // Check if this CC has mappings
    if let Some(mapping) = route.cc_mappings.iter().find(|m| m.source_cc == cc_num) {
        // Generate output messages for each target
        mapping.targets.iter().flat_map(|target| {
            target.channels.iter().map(|ch| {
                vec![0xB0 | (ch - 1), target.cc, value]
            })
        }).collect()
    } else if route.cc_passthrough {
        vec![bytes.to_vec()]
    } else {
        vec![]
    }
}
```

### Frontend Types (types/index.ts)

```typescript
interface CcTarget {
  cc: number;
  channels: number[];
}

interface CcMapping {
  source_cc: number;
  targets: CcTarget[];
}

interface Route {
  // ...existing fields...
  cc_passthrough: boolean;
  cc_mappings: CcMapping[];
}
```

### New Components

**CcMappingsEditor.tsx**
- Table with editable rows
- Passthrough checkbox
- Add/remove mapping buttons
- Validates CC numbers (0-127), channels (1-16)

**Modified: ChannelPopup.tsx**
- Add tabs: "Channels" | "CC Mappings"
- Channels tab shows existing channel filter UI
- CC Mappings tab shows new CcMappingsEditor

### API Additions

**Tauri command:**
- `set_route_cc_mappings(route_id, cc_passthrough, cc_mappings)` - save CC config for a route

**useMidi.ts:**
```typescript
export async function setRouteCcMappings(
  routeId: string,
  ccPassthrough: boolean,
  ccMappings: CcMapping[]
): Promise<void> {
  return invoke("set_route_cc_mappings", { routeId, ccPassthrough, ccMappings });
}
```

## Validation

- CC numbers: 0-127
- Channels: 1-16
- At least one target required per mapping
- At least one channel required per target
