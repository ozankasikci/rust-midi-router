# shadcn/ui Migration Design

## Goal

Replace the custom CSS design system and hand-built UI components with Tailwind CSS + shadcn/ui. Full UI overhaul using shadcn's default dark theme.

## Setup

### Dependencies to add

- `tailwindcss` v4 (CSS-first config, no tailwind.config.js)
- `@tailwindcss/vite` (Vite plugin)
- `class-variance-authority` (component variants)
- `clsx` + `tailwind-merge` (class merging utility)
- `lucide-react` (icon library used by shadcn)
- shadcn/ui components (installed via CLI, copies source into project)

### Configuration files

- `components.json` — shadcn CLI config (style: "default", baseColor: "zinc", cssVariables: true)
- `src/lib/utils.ts` — `cn()` helper (clsx + twMerge)
- Update `src/index.css` — Replace design-tokens with shadcn CSS variables + Tailwind import
- Update `vite.config.ts` — Add Tailwind plugin, path aliases
- Update `tsconfig.json` — Add `@/*` path alias

### shadcn CSS variables (dark theme)

Standard shadcn dark palette using zinc grays. Applied via `:root` with `.dark` class on html element.

## Component Migration

### shadcn components to install

| shadcn component | Replaces |
|---|---|
| button | ui/Button.tsx |
| input | ui/Input.tsx |
| select | ui/Select.tsx |
| dialog | ui/Dialog.tsx |
| dropdown-menu | ui/Menu.tsx, MenuItem.tsx |
| tabs | App tab navigation, ChannelPopup tabs |
| table | RoutingMatrix grid, MonitorLog |
| popover | ChannelPopup positioned popup |
| toggle | Channel selector LED buttons |
| toggle-group | Channel filter mode (all/only/except) |
| switch | CC passthrough toggle |
| badge | Status indicators, port activity |
| separator | Visual dividers |
| tooltip | Icon button labels |

### Page components

**App.tsx**
- Layout: `flex flex-col h-screen bg-background text-foreground`
- Header: flex row with preset bar and clock controls
- Content: shadcn Tabs (matrix / monitor)
- Remove bottom tab bar, use proper Tabs at top of content area

**RoutingMatrix.tsx**
- Use shadcn Table for the routing grid
- TableHead for port names (inputs as rows, outputs as columns)
- TableCell for intersection cells (click to toggle route)
- Active routes shown with colored cell background
- Activity indicator via subtle pulse/badge

**MonitorLog.tsx**
- Table for log entries
- Badge for message type (Note, CC, etc.)
- Monospace font for hex/raw data via `font-mono` class

**PresetBar.tsx**
- Select for preset dropdown
- Button for save
- DropdownMenu for overflow (delete, rename, export)

**ClockControl.tsx**
- Button with play/stop icons (lucide-react)
- Input for BPM (number, compact)

**ChannelPopup.tsx → RoutePopover.tsx**
- Popover for positioned popup (replaces fixed-position div)
- Tabs inside popover (Channels / CC Map)
- Channels tab: ToggleGroup for filter mode, Toggle buttons in 4x4 grid for channels
- CC tab: CcMappingsEditor
- Footer: Button (danger variant) for delete, Button (default) for apply

**CcMappingsEditor.tsx**
- Switch for passthrough toggle
- Each mapping row: Input (number) for source CC, Select for target, Button for learn
- Button for add mapping
- Keep FROM → TO layout with arrow between

**ChannelSelector.tsx**
- Rewrite with Toggle buttons in a compact grid
- Quick-select buttons (All / None)

### Files to delete after migration

- `src/styles/design-tokens.css`
- `src/components/ui.css`
- `src/components/ChannelPopup.css`
- `src/components/CcMappingsEditor.css`
- `src/components/ui/Button.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/Menu.tsx`
- `src/components/ui/MenuItem.tsx`
- `src/components/ui/IconButton.tsx`

ChannelSelector.tsx gets rewritten in-place with shadcn primitives.

## Implementation Order

1. Install Tailwind v4 + Vite plugin, verify build works
2. Configure shadcn (components.json, path aliases, cn utility)
3. Install all shadcn components
4. Replace index.css with shadcn CSS variables + Tailwind
5. Migrate App.tsx layout + tabs
6. Migrate RoutingMatrix
7. Migrate MonitorLog
8. Migrate PresetBar + ClockControl
9. Migrate ChannelPopup → RoutePopover
10. Migrate CcMappingsEditor
11. Rewrite ChannelSelector
12. Delete old CSS files and custom ui components
13. Clean up unused imports and verify build
