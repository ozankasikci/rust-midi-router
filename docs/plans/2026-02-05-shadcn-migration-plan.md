# shadcn/ui Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the entire custom CSS design system and hand-built UI components with Tailwind CSS v4 + shadcn/ui default dark theme.

**Architecture:** Install Tailwind v4 + shadcn/ui into the existing Vite + React 19 + TypeScript project. Replace all custom `ui/` components with shadcn equivalents. Migrate all page components from custom CSS classes to Tailwind utility classes. Delete all old CSS files.

**Tech Stack:** Tailwind CSS v4, shadcn/ui, Radix UI, Lucide React, class-variance-authority, clsx, tailwind-merge

---

### Task 1: Install Tailwind CSS v4 and configure Vite

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Install Tailwind CSS v4 + Vite plugin**

Run:
```bash
npm install tailwindcss @tailwindcss/vite
```

**Step 2: Add Tailwind plugin to vite.config.ts**

Update `vite.config.ts` to:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**Step 3: Install @types/node for path module**

Run:
```bash
npm add -D @types/node
```

**Step 4: Verify build still works**

Run: `npm run build`
Expected: Build succeeds (Tailwind is installed but no classes used yet)

---

### Task 2: Configure TypeScript path aliases

**Files:**
- Modify: `tsconfig.json`
- Modify: `tsconfig.node.json`

**Step 1: Update tsconfig.json**

Add `baseUrl` and `paths` to compilerOptions:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 2: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 3: Initialize shadcn/ui and install components

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/index.css` (will be rewritten by shadcn init)
- Create: `src/components/ui/button.tsx` (shadcn replaces old Button.tsx)
- Create: multiple `src/components/ui/*.tsx` files

**Step 1: Run shadcn init**

Run:
```bash
npx shadcn@latest init -d
```

If the CLI prompts interactively, choose:
- Style: Default
- Base color: Zinc
- CSS variables: Yes

This will create `components.json`, `src/lib/utils.ts`, and update `src/index.css` with shadcn CSS variables + `@import "tailwindcss"`.

**Step 2: Delete old custom ui components before installing shadcn ones**

Delete these files (shadcn will create replacements with lowercase names):
- `src/components/ui/Button.tsx`
- `src/components/ui/IconButton.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/Menu.tsx`
- `src/components/ui/ui.css`
- `src/components/ui/index.ts`

Keep `ChannelSelector.tsx` and `ChannelSelector.css` (will be rewritten later).

**Step 3: Install all needed shadcn components**

Run:
```bash
npx shadcn@latest add button input select dialog dropdown-menu tabs table popover toggle toggle-group switch badge separator tooltip
```

This creates files in `src/components/ui/` with lowercase names (button.tsx, input.tsx, etc.).

**Step 4: Delete old CSS files**

Delete:
- `src/styles/design-tokens.css`
- `src/components/ChannelPopup.css`
- `src/components/CcMappingsEditor.css`

**Step 5: Set dark mode on html element**

In `index.html`, add `class="dark"` to the `<html>` tag:
```html
<html lang="en" class="dark">
```

**Step 6: Verify shadcn index.css has proper content**

`src/index.css` should have `@import "tailwindcss"` at the top followed by the shadcn CSS variable theme. Verify it exists and includes dark theme variables.

**Step 7: Update main.tsx to import index.css**

Ensure `src/main.tsx` imports `./index.css` (instead of through App.tsx design-tokens import).

---

### Task 4: Migrate App.tsx

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/App.css`

**Step 1: Rewrite App.tsx with shadcn Tabs and Tailwind**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import { PresetBar } from "./components/PresetBar";
import { ClockControl } from "./components/ClockControl";

function App() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-sm font-medium">MIDI Router</h1>
        <PresetBar />
        <ClockControl />
      </header>

      <Tabs defaultValue="matrix" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
          <TabsTrigger value="monitor">Monitor</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="flex-1 overflow-auto p-4">
          <RoutingMatrix />
        </TabsContent>
        <TabsContent value="monitor" className="flex-1 overflow-auto p-4">
          <MonitorLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App;
```

**Step 2: Delete App.css**

Delete `src/App.css`.

---

### Task 5: Migrate RoutingMatrix

**Files:**
- Modify: `src/components/RoutingMatrix.tsx`

**Step 1: Rewrite RoutingMatrix with shadcn Table and Tailwind**

```tsx
import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { ChannelPopup } from "./ChannelPopup";
import { Route } from "../types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check } from "lucide-react";

export function RoutingMatrix() {
  const {
    inputPorts,
    outputPorts,
    routes,
    portActivity,
    loadingPorts,
    refreshPorts,
    addRoute,
    toggleRoute,
  } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    route: Route;
  } | null>(null);

  useEffect(() => {
    refreshPorts().catch(console.error);
  }, []);

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
    <div>
      <div className="mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshPorts()}
          disabled={loadingPorts}
        >
          {loadingPorts ? "Refreshing..." : "Refresh Ports"}
        </Button>
      </div>

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40"></TableHead>
              {outputPorts.map((out) => (
                <TableHead
                  key={out.id.name}
                  className={`text-center text-xs ${isActive(out.id.name) ? "text-green-400" : ""}`}
                >
                  {out.id.display_name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inputPorts.map((input) => (
              <TableRow key={input.id.name}>
                <TableCell
                  className={`text-xs font-medium ${isActive(input.id.name) ? "text-green-400" : "text-muted-foreground"}`}
                >
                  {input.id.display_name}
                </TableCell>
                {outputPorts.map((output) => {
                  const route = getRoute(input.id.name, output.id.name);
                  return (
                    <TableCell
                      key={output.id.name}
                      className={`text-center cursor-pointer transition-colors hover:bg-accent/50 ${
                        route?.enabled ? "bg-green-500/15" : ""
                      }`}
                      onClick={() => handleCellClick(input.id.name, output.id.name)}
                      onContextMenu={(e) =>
                        handleCellRightClick(e, input.id.name, output.id.name)
                      }
                    >
                      {route?.enabled && (
                        <Check className="mx-auto h-4 w-4 text-green-400" />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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

---

### Task 6: Migrate MonitorLog

**Files:**
- Modify: `src/components/MonitorLog.tsx`

**Step 1: Rewrite MonitorLog with shadcn Table, Badge, Button, and Tailwind**

```tsx
import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { MidiActivity, MessageKind } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMessage(kind: MessageKind): string {
  if (kind.kind === "NoteOn") return `NoteOn  ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  if (kind.kind === "NoteOff") return `NoteOff ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  if (kind.kind === "ControlChange") return `CC ${kind.data.controller} val=${kind.data.value}`;
  if (kind.kind === "ProgramChange") return `PC ${kind.data.program}`;
  if (kind.kind === "PitchBend") return `Pitch ${kind.data.value}`;
  if (kind.kind === "Aftertouch") return `AT ${kind.data.value}`;
  if (kind.kind === "PolyAftertouch") return `PolyAT ${noteName(kind.data.note)} ${kind.data.value}`;
  if (kind.kind === "SysEx") return "SysEx";
  if (kind.kind === "Clock") return "Clock";
  if (kind.kind === "Start") return "Start";
  if (kind.kind === "Continue") return "Continue";
  if (kind.kind === "Stop") return "Stop";
  return "Other";
}

function noteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 1;
  return `${names[note % 12]}${octave}`.padEnd(4);
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts / 1000);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${timeStr}.${ms}`;
}

function getBadgeVariant(kind: string): "default" | "secondary" | "destructive" | "outline" {
  if (kind === "NoteOn" || kind === "NoteOff") return "default";
  if (kind === "ControlChange") return "secondary";
  if (kind === "Stop") return "destructive";
  return "outline";
}

function ActivityRow({ activity }: { activity: MidiActivity }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {formatTimestamp(activity.timestamp)}
      </TableCell>
      <TableCell className="text-xs text-blue-400">
        {activity.port}
      </TableCell>
      <TableCell className="text-xs">
        {activity.channel !== null ? (
          <Badge variant="outline" className="text-xs">{`Ch ${activity.channel + 1}`}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        <Badge variant={getBadgeVariant(activity.kind.kind)} className="text-xs font-mono">
          {formatMessage(activity.kind)}
        </Badge>
      </TableCell>
    </TableRow>
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">MIDI Monitor</span>
        <Button variant="outline" size="sm" onClick={clearLog}>
          Clear
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Time</TableHead>
              <TableHead className="w-32">Port</TableHead>
              <TableHead className="w-16">Ch</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activityLog.map((activity, i) => (
              <ActivityRow key={i} activity={activity} />
            ))}
          </TableBody>
        </Table>
        {activityLog.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No MIDI activity yet
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Task 7: Migrate PresetBar

**Files:**
- Modify: `src/components/PresetBar.tsx`

**Step 1: Rewrite PresetBar with shadcn Select, Button, Dialog, DropdownMenu**

```tsx
import { useState, useEffect } from "react";
import { Preset } from "../types";
import * as api from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Save, MoreVertical, Plus, Trash2 } from "lucide-react";

export function PresetBar() {
  const { refreshRoutes } = useAppStore();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

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
    await refreshRoutes();
  };

  const handleSaveAs = async () => {
    if (!newPresetName.trim()) return;
    const preset = await api.savePreset(newPresetName.trim());
    setActivePresetId(preset.id);
    setNewPresetName("");
    setShowSaveDialog(false);
    loadPresets();
  };

  const handleSave = async () => {
    if (!activePresetId) return;
    await api.updatePreset(activePresetId);
    loadPresets();
  };

  const handleDelete = async () => {
    if (!activePresetId) return;
    await api.deletePreset(activePresetId);
    setActivePresetId(null);
    loadPresets();
  };

  return (
    <div className="flex items-center gap-1">
      <Select
        value={activePresetId || ""}
        onValueChange={(val) => val && handleLoad(val)}
      >
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue placeholder="No Preset" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activePresetId && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} title="Save preset">
          <Save className="h-3.5 w-3.5" />
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowSaveDialog(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Save as new...
          </DropdownMenuItem>
          {activePresetId && (
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete preset
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save New Preset</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Preset name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveAs();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAs} disabled={!newPresetName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

### Task 8: Migrate ClockControl

**Files:**
- Modify: `src/components/ClockControl.tsx`

**Step 1: Rewrite ClockControl with shadcn Button, Input, and Lucide icons**

```tsx
import { useState, useEffect } from "react";
import * as api from "../hooks/useMidi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Square } from "lucide-react";

export function ClockControl() {
  const [bpm, setBpm] = useState(120);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.getClockBpm().then(setBpm);
    api.startClockMonitor((state) => {
      setBpm(state.bpm);
      setRunning(state.running);
    });
  }, []);

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseFloat(e.target.value);
    if (!isNaN(newBpm) && newBpm >= 20 && newBpm <= 300) {
      setBpm(newBpm);
      api.setBpm(newBpm);
    }
  };

  return (
    <div className="flex items-center gap-2 pl-4 border-l">
      <div className="flex gap-0.5">
        <Button
          variant={running ? "default" : "outline"}
          size="icon"
          className={`h-7 w-7 ${running ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
          onClick={() => api.sendTransportStart()}
          title="Play (Send MIDI Start)"
        >
          <Play className="h-3 w-3" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => api.sendTransportStop()}
          title="Stop (Send MIDI Stop)"
        >
          <Square className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">BPM</span>
        <Input
          type="number"
          value={bpm}
          onChange={handleBpmChange}
          min={20}
          max={300}
          step={0.1}
          className="h-7 w-16 text-xs font-mono text-center"
        />
      </div>
    </div>
  );
}
```

---

### Task 9: Migrate ChannelPopup

**Files:**
- Modify: `src/components/ChannelPopup.tsx`

**Step 1: Rewrite ChannelPopup with shadcn Tabs, ToggleGroup, Toggle, Button and Tailwind**

The popup remains a fixed-position div (not a Popover, since it's triggered by right-click coordinates). Use shadcn components inside it with Tailwind for layout.

```tsx
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Route, ChannelFilter, CcMapping } from "../types";
import { removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { CcMappingsEditor } from "./CcMappingsEditor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, X, Trash2, Check } from "lucide-react";

interface Props {
  route: Route;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelPopup({ route, x, y, onClose }: Props) {
  const { updateRouteChannels, updateRouteCcMappings } = useAppStore();
  const [activeTab, setActiveTab] = useState("channels");
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">("all");
  const [position, setPosition] = useState({ left: x, top: y });
  const popupRef = useRef<HTMLDivElement>(null);

  const [ccPassthrough, setCcPassthrough] = useState(route.cc_passthrough ?? true);
  const [ccMappings, setCcMappings] = useState<CcMapping[]>(route.cc_mappings ?? []);

  useEffect(() => {
    const channels = route.channels;
    if (channels === "All") {
      setFilterMode("all");
      setSelectedChannels(new Set());
    } else if ("Only" in channels) {
      setFilterMode("only");
      setSelectedChannels(new Set(channels.Only));
    } else if ("Except" in channels) {
      setFilterMode("except");
      setSelectedChannels(new Set(channels.Except));
    }
    setCcPassthrough(route.cc_passthrough ?? true);
    setCcMappings(route.cc_mappings ?? []);
  }, [route]);

  const toggleChannel = (ch: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  };

  const handleApply = async () => {
    let filter: ChannelFilter;
    if (filterMode === "all") filter = "All";
    else if (filterMode === "only") filter = { Only: Array.from(selectedChannels).sort((a, b) => a - b) };
    else filter = { Except: Array.from(selectedChannels).sort((a, b) => a - b) };
    await updateRouteChannels(route.id, filter);
    await updateRouteCcMappings(route.id, ccPassthrough, ccMappings);
    onClose();
  };

  const handleDelete = async () => {
    await removeRoute(route.id);
    onClose();
  };

  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    const padding = 8;
    let newLeft = x;
    let newTop = y;
    if (x + rect.width > window.innerWidth - padding) newLeft = window.innerWidth - rect.width - padding;
    if (y + rect.height > window.innerHeight - padding) newTop = window.innerHeight - rect.height - padding;
    if (newLeft < padding) newLeft = padding;
    if (newTop < padding) newTop = padding;
    setPosition({ left: newLeft, top: newTop });
  }, [x, y, activeTab]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-[340px] rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ left: position.left, top: position.top }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-green-400">{route.source.display_name}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-blue-400">{route.destination.display_name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full rounded-none border-b bg-transparent h-9">
          <TabsTrigger value="channels" className="flex-1 text-xs">Channels</TabsTrigger>
          <TabsTrigger value="cc" className="flex-1 text-xs">CC Map</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="p-3 space-y-3 mt-0">
          <ToggleGroup
            type="single"
            value={filterMode}
            onValueChange={(val) => val && setFilterMode(val as "all" | "only" | "except")}
            className="justify-start"
          >
            <ToggleGroupItem value="all" className="text-xs h-7">All</ToggleGroupItem>
            <ToggleGroupItem value="only" className="text-xs h-7">Only</ToggleGroupItem>
            <ToggleGroupItem value="except" className="text-xs h-7">Except</ToggleGroupItem>
          </ToggleGroup>

          {filterMode !== "all" && (
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-1">
                {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                  <Toggle
                    key={ch}
                    pressed={selectedChannels.has(ch)}
                    onPressedChange={() => toggleChannel(ch)}
                    className="h-7 w-full text-xs font-mono data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {ch}
                  </Toggle>
                ))}
              </div>
              <div className="flex gap-2 justify-center">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedChannels(new Set(Array.from({ length: 16 }, (_, i) => i + 1)))}>
                  All
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedChannels(new Set())}>
                  None
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cc" className="p-3 mt-0">
          <CcMappingsEditor
            ccPassthrough={ccPassthrough}
            ccMappings={ccMappings}
            sourcePort={route.source.name}
            destinationPort={route.destination.name}
            onChange={(p, m) => { setCcPassthrough(p); setCcMappings(m); }}
          />
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Actions */}
      <div className="flex gap-2 p-3">
        <Button variant="destructive" size="sm" className="flex-1 text-xs" onClick={handleDelete}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Delete
        </Button>
        <Button size="sm" className="flex-1 text-xs" onClick={handleApply}>
          <Check className="mr-1.5 h-3 w-3" />
          Apply
        </Button>
      </div>
    </div>
  );
}
```

---

### Task 10: Migrate CcMappingsEditor

**Files:**
- Modify: `src/components/CcMappingsEditor.tsx`

**Step 1: Rewrite CcMappingsEditor with shadcn Switch, Input, Button, Badge**

```tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { CcMapping, CcTarget, MidiActivity } from "../types";
import { findDeviceCcMap, getParametersByCategory } from "../data/deviceCcMaps";
import { startMidiMonitor } from "../hooks/useMidi";
import { ChannelSelector } from "./ChannelSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Plus, X, CircleDot } from "lucide-react";

interface Props {
  ccPassthrough: boolean;
  ccMappings: CcMapping[];
  sourcePort: string;
  destinationPort: string;
  onChange: (passthrough: boolean, mappings: CcMapping[]) => void;
}

interface FlatRow {
  sourceCC: number;
  targetCC: number;
  channels: number[];
}

export function CcMappingsEditor({
  ccPassthrough,
  ccMappings,
  sourcePort,
  destinationPort,
  onChange,
}: Props) {
  const [passthrough, setPassthrough] = useState(ccPassthrough);
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [learningRowIndex, setLearningRowIndex] = useState<number | null>(null);

  const deviceMap = useMemo(() => findDeviceCcMap(destinationPort), [destinationPort]);
  const parametersByCategory = useMemo(
    () => (deviceMap ? getParametersByCategory(deviceMap) : null),
    [deviceMap]
  );

  useEffect(() => {
    const flatRows: FlatRow[] = [];
    for (const mapping of ccMappings) {
      for (const target of mapping.targets) {
        flatRows.push({
          sourceCC: mapping.source_cc,
          targetCC: target.cc,
          channels: [...target.channels],
        });
      }
    }
    setRows(flatRows);
    setPassthrough(ccPassthrough);
  }, [ccMappings, ccPassthrough]);

  const handleMidiActivity = useCallback(
    (activity: MidiActivity) => {
      if (learningRowIndex === null) return;
      if (activity.port !== sourcePort) return;
      if (activity.kind.kind !== "ControlChange") return;
      const ccNumber = activity.kind.data.controller;
      setRows((prevRows) => {
        const newRows = [...prevRows];
        if (learningRowIndex < newRows.length) {
          newRows[learningRowIndex] = { ...newRows[learningRowIndex], sourceCC: ccNumber };
        }
        onChange(passthrough, rowsToMappings(newRows));
        return newRows;
      });
      setLearningRowIndex(null);
    },
    [learningRowIndex, sourcePort, passthrough, onChange]
  );

  useEffect(() => {
    if (learningRowIndex !== null) {
      startMidiMonitor(handleMidiActivity);
    }
  }, [learningRowIndex, handleMidiActivity]);

  const rowsToMappings = (flatRows: FlatRow[]): CcMapping[] => {
    const mappingMap = new Map<number, CcTarget[]>();
    for (const row of flatRows) {
      const target: CcTarget = { cc: row.targetCC, channels: row.channels };
      if (!mappingMap.has(row.sourceCC)) mappingMap.set(row.sourceCC, []);
      mappingMap.get(row.sourceCC)!.push(target);
    }
    return Array.from(mappingMap.entries()).map(([source_cc, targets]) => ({ source_cc, targets }));
  };

  const updateRow = (index: number, field: keyof FlatRow, value: string | number[]) => {
    const newRows = [...rows];
    if (field === "sourceCC" || field === "targetCC") {
      const num = parseInt(value as string, 10);
      if (isNaN(num) || num < 0 || num > 127) return;
      newRows[index] = { ...newRows[index], [field]: num };
    } else if (field === "channels") {
      newRows[index] = { ...newRows[index], channels: value as number[] };
    }
    setRows(newRows);
    onChange(passthrough, rowsToMappings(newRows));
  };

  const addRow = () => {
    const defaultTargetCC = deviceMap ? 16 : 74;
    const newRows = [...rows, { sourceCC: 1, targetCC: defaultTargetCC, channels: [1] }];
    setRows(newRows);
    onChange(passthrough, rowsToMappings(newRows));
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    onChange(passthrough, rowsToMappings(newRows));
    if (learningRowIndex === index) setLearningRowIndex(null);
    else if (learningRowIndex !== null && learningRowIndex > index) setLearningRowIndex(learningRowIndex - 1);
  };

  const handlePassthroughChange = (checked: boolean) => {
    setPassthrough(checked);
    onChange(checked, rowsToMappings(rows));
  };

  const renderTargetCcSelector = (row: FlatRow, index: number) => {
    if (deviceMap && parametersByCategory) {
      return (
        <Select
          value={String(row.targetCC)}
          onValueChange={(val) => updateRow(index, "targetCC", val)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from(parametersByCategory.entries()).map(([category, params]) => (
              <SelectGroup key={category}>
                <SelectLabel>{category}</SelectLabel>
                {params.map((param) => (
                  <SelectItem key={param.cc} value={String(param.cc)}>
                    {param.name} ({param.cc})
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type="number"
        min={0}
        max={127}
        value={row.targetCC}
        onChange={(e) => updateRow(index, "targetCC", e.target.value)}
        className="h-7 w-16 text-xs font-mono text-center"
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={passthrough} onCheckedChange={handlePassthroughChange} className="scale-75" />
          <span className="text-xs text-muted-foreground">Pass unmapped</span>
        </div>
        {deviceMap && (
          <Badge variant="secondary" className="text-xs">
            {deviceMap.name}
          </Badge>
        )}
      </div>

      {/* Learn banner */}
      {learningRowIndex !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="flex-1">Move a knob or fader...</span>
          <Button variant="ghost" size="sm" className="h-5 text-xs text-yellow-400" onClick={() => setLearningRowIndex(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Mapping rows */}
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <p className="font-medium">No CC mappings</p>
            <p className="mt-1 opacity-60">Map controller knobs to device parameters</p>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={index}
              className={`flex items-end gap-2 p-2 rounded-md border ${
                learningRowIndex === index ? "border-yellow-500/30 bg-yellow-500/5" : "bg-card"
              }`}
            >
              {/* Source CC */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">From</span>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={127}
                    value={row.sourceCC}
                    onChange={(e) => updateRow(index, "sourceCC", e.target.value)}
                    disabled={learningRowIndex === index}
                    className="h-7 w-14 text-xs font-mono text-center"
                  />
                  <Button
                    variant={learningRowIndex === index ? "default" : "outline"}
                    size="sm"
                    className={`h-7 text-xs ${learningRowIndex === index ? "bg-yellow-500 hover:bg-yellow-600 text-black" : ""}`}
                    onClick={() => learningRowIndex === index ? setLearningRowIndex(null) : setLearningRowIndex(index)}
                  >
                    {learningRowIndex === index ? "..." : (
                      <>
                        <CircleDot className="mr-1 h-3 w-3" />
                        Learn
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-muted-foreground mb-1 shrink-0" />

              {/* Target CC */}
              <div className="flex-1 space-y-1 min-w-0">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">To</span>
                {renderTargetCcSelector(row, index)}
              </div>

              {/* Channel selector */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ch</span>
                <ChannelSelector
                  channels={row.channels}
                  onChange={(channels) => updateRow(index, "channels", channels)}
                />
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 mb-0.5"
                onClick={() => removeRow(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      <Button variant="outline" size="sm" className="w-full text-xs" onClick={addRow}>
        <Plus className="mr-1.5 h-3 w-3" />
        Add Mapping
      </Button>
    </div>
  );
}
```

---

### Task 11: Rewrite ChannelSelector

**Files:**
- Modify: `src/components/ui/ChannelSelector.tsx` → move to `src/components/ChannelSelector.tsx`
- Delete: `src/components/ui/ChannelSelector.css`

**Step 1: Move ChannelSelector out of ui/ to components/ and rewrite with shadcn**

Delete `src/components/ui/ChannelSelector.tsx` and `src/components/ui/ChannelSelector.css`.

Create `src/components/ChannelSelector.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";

interface ChannelSelectorProps {
  channels: number[];
  onChange: (channels: number[]) => void;
}

export function ChannelSelector({ channels, onChange }: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const toggleChannel = (ch: number) => {
    if (channels.includes(ch)) {
      onChange(channels.filter((c) => c !== ch).sort((a, b) => a - b));
    } else {
      onChange([...channels, ch].sort((a, b) => a - b));
    }
  };

  const getDisplayText = () => {
    if (channels.length === 0) return "—";
    if (channels.length === 16) return "All";
    if (channels.length <= 3) return channels.join(", ");
    return `${channels.length} ch`;
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 min-w-[54px] text-xs font-mono"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {getDisplayText()}
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 p-2 rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="flex gap-1 mb-2 pb-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-xs"
              onClick={() => onChange([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-xs"
              onClick={() => onChange([])}
            >
              None
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <Toggle
                key={ch}
                pressed={channels.includes(ch)}
                onPressedChange={() => toggleChannel(ch)}
                className="h-6 w-6 text-[9px] font-mono p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {ch}
              </Toggle>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Task 12: Update imports and barrel exports

**Files:**
- Delete: `src/components/ui/index.ts` (old barrel)
- Modify: `src/components/CcMappingsEditor.tsx` — update ChannelSelector import
- Modify: `src/main.tsx` — ensure index.css import

**Step 1: Delete old barrel export**

Delete `src/components/ui/index.ts` if it still exists and only contained old exports. shadcn components are imported directly from their individual files (e.g., `@/components/ui/button`).

**Step 2: Update CcMappingsEditor import**

Change:
```ts
import { ChannelSelector } from "./ui";
```
To:
```ts
import { ChannelSelector } from "./ChannelSelector";
```

(Already done in Task 10 code above)

**Step 3: Update main.tsx**

Ensure `src/main.tsx` imports `./index.css`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

---

### Task 13: Clean up and verify build

**Files:**
- Delete any remaining old CSS/component files
- Verify: full build

**Step 1: Delete remaining old files**

Verify and delete these if they still exist:
- `src/styles/design-tokens.css`
- `src/App.css`
- `src/components/ui/ui.css`
- `src/components/ui/Button.tsx`
- `src/components/ui/IconButton.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/Menu.tsx`
- `src/components/ui/index.ts`
- `src/components/ui/ChannelSelector.tsx`
- `src/components/ui/ChannelSelector.css`
- `src/components/ChannelPopup.css`
- `src/components/CcMappingsEditor.css`

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "Migrate UI to shadcn/ui with Tailwind CSS v4"
```
