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
      {/* Preset selector */}
      <Select
        value={activePresetId || ""}
        onValueChange={(value) => {
          if (value === "__none__") {
            setActivePresetId(null);
          } else {
            handleLoad(value);
          }
        }}
      >
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue placeholder="No Preset" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No Preset</SelectItem>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Save button - only when preset selected */}
      {activePresetId && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleSave}
          title="Save preset"
        >
          <Save />
        </Button>
      )}

      {/* Menu button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Preset options"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setShowSaveDialog(true)}>
            <Plus />
            Save as new...
          </DropdownMenuItem>
          {activePresetId && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={handleDelete}
            >
              <Trash2 />
              Delete preset
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save New Preset</DialogTitle>
          </DialogHeader>
          <Input
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
