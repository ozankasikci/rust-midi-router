import { useState, useEffect } from "react";
import { Preset } from "../types";
import * as api from "../hooks/useMidi";

export function PresetBar() {
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
    // Refresh routes in store
    window.location.reload(); // Simple approach for now
  };

  const handleSave = async () => {
    if (!newPresetName.trim()) return;
    await api.savePreset(newPresetName.trim());
    setNewPresetName("");
    setShowSaveDialog(false);
    loadPresets();
  };

  const handleDelete = async (presetId: string) => {
    await api.deletePreset(presetId);
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
    loadPresets();
  };

  return (
    <div className="preset-bar">
      <label>Preset:</label>
      <select
        value={activePresetId || ""}
        onChange={(e) => e.target.value && handleLoad(e.target.value)}
      >
        <option value="">-- Select --</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <button onClick={() => setShowSaveDialog(true)}>Save As</button>

      {activePresetId && (
        <button onClick={() => handleDelete(activePresetId)}>Delete</button>
      )}

      {showSaveDialog && (
        <div className="save-dialog">
          <input
            type="text"
            placeholder="Preset name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
