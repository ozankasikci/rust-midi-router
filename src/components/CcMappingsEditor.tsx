import { useState, useEffect, useMemo, useCallback } from "react";
import { CcMapping, CcTarget, MidiActivity } from "../types";
import {
  findDeviceCcMap,
  getParametersByCategory,
} from "../data/deviceCcMaps";
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

  // Find device CC map for destination
  const deviceMap = useMemo(
    () => findDeviceCcMap(destinationPort),
    [destinationPort]
  );

  // Group parameters by category for the dropdown
  const parametersByCategory = useMemo(
    () => (deviceMap ? getParametersByCategory(deviceMap) : null),
    [deviceMap]
  );

  // Flatten mappings into rows for display
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

  // Handle incoming MIDI activity for learn mode
  const handleMidiActivity = useCallback(
    (activity: MidiActivity) => {
      if (learningRowIndex === null) return;

      // Check if it's from the source port and is a CC message
      if (activity.port !== sourcePort) return;
      if (activity.kind.kind !== "ControlChange") return;

      const ccNumber = activity.kind.data.controller;

      // Update the row with the learned CC
      setRows((prevRows) => {
        const newRows = [...prevRows];
        if (learningRowIndex < newRows.length) {
          newRows[learningRowIndex] = {
            ...newRows[learningRowIndex],
            sourceCC: ccNumber,
          };
        }
        // Notify parent of change
        onChange(passthrough, rowsToMappings(newRows));
        return newRows;
      });

      // Exit learn mode
      setLearningRowIndex(null);
    },
    [learningRowIndex, sourcePort, passthrough, onChange]
  );

  // Start MIDI monitor when in learn mode
  useEffect(() => {
    if (learningRowIndex !== null) {
      startMidiMonitor(handleMidiActivity);
    }
  }, [learningRowIndex, handleMidiActivity]);

  // Convert flat rows back to nested CcMapping structure
  // Keep rows even with empty channels (they just won't route anything)
  const rowsToMappings = (flatRows: FlatRow[]): CcMapping[] => {
    const mappingMap = new Map<number, CcTarget[]>();

    for (const row of flatRows) {
      const target: CcTarget = {
        cc: row.targetCC,
        channels: row.channels,
      };

      if (!mappingMap.has(row.sourceCC)) {
        mappingMap.set(row.sourceCC, []);
      }
      mappingMap.get(row.sourceCC)!.push(target);
    }

    return Array.from(mappingMap.entries()).map(([source_cc, targets]) => ({
      source_cc,
      targets,
    }));
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
    // Default to Filter Freq (CC 16) if Digitone, otherwise CC 74
    const defaultTargetCC = deviceMap ? 16 : 74;
    const newRows = [
      ...rows,
      { sourceCC: 1, targetCC: defaultTargetCC, channels: [1] },
    ];
    setRows(newRows);
    onChange(passthrough, rowsToMappings(newRows));
  };

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    onChange(passthrough, rowsToMappings(newRows));
    // Cancel learn mode if we're removing the row being learned
    if (learningRowIndex === index) {
      setLearningRowIndex(null);
    } else if (learningRowIndex !== null && learningRowIndex > index) {
      setLearningRowIndex(learningRowIndex - 1);
    }
  };

  const handlePassthroughChange = (checked: boolean) => {
    setPassthrough(checked);
    onChange(checked, rowsToMappings(rows));
  };

  const startLearning = (index: number) => {
    setLearningRowIndex(index);
  };

  const cancelLearning = () => {
    setLearningRowIndex(null);
  };

  // Render target CC selector - dropdown if device known, number input otherwise
  const renderTargetCcSelector = (row: FlatRow, index: number) => {
    if (deviceMap && parametersByCategory) {
      return (
        <Select
          value={String(row.targetCC)}
          onValueChange={(value) => updateRow(index, "targetCC", value)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from(parametersByCategory.entries()).map(
              ([category, params]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{category}</SelectLabel>
                  {params.map((param) => (
                    <SelectItem key={param.cc} value={String(param.cc)}>
                      {param.name} ({param.cc})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            )}
            {/* Allow manual CC entry if not in list */}
            {!deviceMap.parameters.find((p) => p.cc === row.targetCC) && (
              <SelectItem value={String(row.targetCC)}>
                CC {row.targetCC}
              </SelectItem>
            )}
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
        className="h-7 w-14 text-xs font-mono text-center"
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Header with passthrough toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={passthrough}
            onCheckedChange={handlePassthroughChange}
            className="scale-75"
          />
          <span className="text-xs text-muted-foreground">Pass unmapped</span>
        </div>

        {deviceMap && (
          <Badge variant="secondary" className="text-xs">
            <CircleDot className="mr-1 h-3 w-3" />
            {deviceMap.name}
          </Badge>
        )}
      </div>

      {/* Learning indicator */}
      {learningRowIndex !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
          </span>
          <span className="flex-1">Move a knob or fader...</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs text-yellow-400 hover:text-yellow-300"
            onClick={cancelLearning}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Mappings list */}
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm font-medium">No CC mappings</p>
            <span className="text-xs">Map controller knobs to device parameters</span>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={index}
              className={`flex items-end gap-2 p-2 rounded-md border bg-card ${
                learningRowIndex === index
                  ? "border-yellow-500/30 bg-yellow-500/5"
                  : ""
              }`}
            >
              {/* Source section */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  FROM
                </span>
                <div className="flex items-center gap-1">
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
                    className={`h-7 text-xs ${
                      learningRowIndex === index
                        ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                        : ""
                    }`}
                    onClick={() =>
                      learningRowIndex === index
                        ? cancelLearning()
                        : startLearning(index)
                    }
                  >
                    {learningRowIndex === index ? (
                      <span>...</span>
                    ) : (
                      <>
                        <CircleDot className="mr-1 h-3 w-3" />
                        Learn
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center pb-1">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Target section */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  TO
                </span>
                {renderTargetCcSelector(row, index)}
              </div>

              {/* Channel section */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  CH
                </span>
                <ChannelSelector
                  channels={row.channels}
                  onChange={(channels) => updateRow(index, "channels", channels)}
                />
              </div>

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(index)}
                title="Remove mapping"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Add mapping button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={addRow}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add Mapping
      </Button>
    </div>
  );
}
