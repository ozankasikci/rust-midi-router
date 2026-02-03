import { useState, useEffect, useRef } from "react";
import { Preset } from "../types";
import * as api from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";

export function PresetBar() {
  const { refreshRoutes } = useAppStore();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPresets();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

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
      <div className="preset-selector">
        <select
          value={activePresetId || ""}
          onChange={(e) => e.target.value && handleLoad(e.target.value)}
        >
          <option value="">No Preset</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Save button - only when preset selected */}
      {activePresetId && (
        <button
          className="preset-btn save-btn"
          onClick={handleSave}
          title="Save preset"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </button>
      )}

      {/* Menu button */}
      <div className="preset-menu-container" ref={menuRef}>
        <button
          className={`preset-btn menu-btn ${showMenu ? 'active' : ''}`}
          onClick={() => setShowMenu(!showMenu)}
          title="Preset options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>

        {showMenu && (
          <div className="preset-menu">
            <button onClick={() => { setShowSaveDialog(true); setShowMenu(false); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Save as new...
            </button>
            {activePresetId && (
              <button className="danger" onClick={handleDelete}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete preset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <>
          <div className="preset-dialog-backdrop" onClick={() => setShowSaveDialog(false)} />
          <div className="preset-dialog">
            <div className="preset-dialog-header">Save New Preset</div>
            <input
              type="text"
              placeholder="Preset name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveAs();
                if (e.key === "Escape") setShowSaveDialog(false);
              }}
              autoFocus
            />
            <div className="preset-dialog-actions">
              <button className="cancel" onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button className="confirm" onClick={handleSaveAs} disabled={!newPresetName.trim()}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
