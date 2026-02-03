import { useState, useEffect, useRef } from "react";
import { Preset } from "../types";
import * as api from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { Select, Button, IconButton, Dialog, Menu, MenuItem, Input } from "./ui";

// Icons
const SaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

const MenuIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="12" cy="12" r="2"/>
    <circle cx="12" cy="19" r="2"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

export function PresetBar() {
  const { refreshRoutes } = useAppStore();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const menuContainerRef = useRef<HTMLDivElement>(null);

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
    setShowMenu(false);
    loadPresets();
  };

  return (
    <div className="preset-control">
      {/* Preset selector */}
      <Select
        value={activePresetId || ""}
        onChange={(e) => e.target.value && handleLoad(e.target.value)}
        size="sm"
        style={{ minWidth: 120, borderRadius: "var(--radius-md) 0 0 var(--radius-md)" }}
      >
        <option value="">No Preset</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      {/* Save button - only when preset selected */}
      {activePresetId && (
        <IconButton
          icon={<SaveIcon />}
          onClick={handleSave}
          title="Save preset"
          size="sm"
          style={{ borderRadius: 0, borderLeft: "none" }}
        />
      )}

      {/* Menu button */}
      <div className="preset-menu-container" ref={menuContainerRef}>
        <IconButton
          icon={<MenuIcon />}
          onClick={() => setShowMenu(!showMenu)}
          title="Preset options"
          size="sm"
          active={showMenu}
          style={{
            borderRadius: activePresetId ? "0 var(--radius-md) var(--radius-md) 0" : "0 var(--radius-md) var(--radius-md) 0",
            borderLeft: "none"
          }}
        />

        <Menu open={showMenu} onClose={() => setShowMenu(false)}>
          <MenuItem
            icon={<PlusIcon />}
            onClick={() => { setShowSaveDialog(true); setShowMenu(false); }}
          >
            Save as new...
          </MenuItem>
          {activePresetId && (
            <MenuItem
              icon={<TrashIcon />}
              onClick={handleDelete}
              danger
            >
              Delete preset
            </MenuItem>
          )}
        </Menu>
      </div>

      {/* Save dialog */}
      <Dialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        title="Save New Preset"
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAs}
              disabled={!newPresetName.trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <Input
          type="text"
          placeholder="Preset name"
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveAs();
            if (e.key === "Escape") setShowSaveDialog(false);
          }}
          inputSize="md"
          style={{ width: "100%" }}
        />
      </Dialog>
    </div>
  );
}
