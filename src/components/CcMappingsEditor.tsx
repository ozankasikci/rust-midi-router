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

  const deviceMap = useMemo(
    () => findDeviceCcMap(destinationPort),
    [destinationPort]
  );

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
          newRows[learningRowIndex] = {
            ...newRows[learningRowIndex],
            sourceCC: ccNumber,
          };
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

  const renderTargetCcSelector = (row: FlatRow, index: number) => {
    if (deviceMap && parametersByCategory) {
      return (
        <Select
          value={String(row.targetCC)}
          onValueChange={(value) => updateRow(index, "targetCC", value)}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
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
        className="h-7 w-16 text-xs font-mono text-center"
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Header: passthrough toggle + device badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={passthrough}
            onCheckedChange={handlePassthroughChange}
            size="sm"
          />
          <span className="text-[11px] text-muted-foreground">Pass unmapped CCs</span>
        </div>

        {deviceMap && (
          <Badge variant="outline" className="text-[10px] text-emerald-400/80 border-emerald-500/20">
            <CircleDot className="size-2.5" />
            {deviceMap.name}
          </Badge>
        )}
      </div>

      {/* Learning indicator */}
      {learningRowIndex !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/8 border border-amber-500/15 text-xs text-amber-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
          </span>
          <span className="flex-1">Move a knob or fader...</span>
          <Button
            variant="ghost"
            size="xs"
            className="text-amber-400 hover:text-amber-300 h-5 text-[10px]"
            onClick={cancelLearning}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Mappings list */}
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-xs font-medium">No CC mappings</p>
            <span className="text-[10px] mt-0.5">Map controller knobs to device parameters</span>
          </div>
        ) : (
          rows.map((row, index) => {
            const isLearning = learningRowIndex === index;
            return (
              <div
                key={index}
                className={`flex items-center gap-1.5 p-1.5 rounded-md border transition-colors ${
                  isLearning
                    ? "border-amber-500/25 bg-amber-500/5"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                {/* Source CC */}
                <Input
                  type="number"
                  min={0}
                  max={127}
                  value={row.sourceCC}
                  onChange={(e) => updateRow(index, "sourceCC", e.target.value)}
                  disabled={isLearning}
                  className="h-7 w-14 text-xs font-mono text-center shrink-0"
                />
                <Button
                  variant={isLearning ? "default" : "ghost"}
                  size="xs"
                  className={
                    isLearning
                      ? "bg-amber-500 hover:bg-amber-400 text-amber-950 shrink-0 text-[10px]"
                      : "shrink-0 text-[10px] text-muted-foreground"
                  }
                  onClick={() =>
                    isLearning ? cancelLearning() : startLearning(index)
                  }
                >
                  {isLearning ? "..." : "Learn"}
                </Button>

                {/* Arrow */}
                <ArrowRight className="size-3 shrink-0 text-white/15" />

                {/* Target */}
                <div className="flex-1 min-w-0">
                  {renderTargetCcSelector(row, index)}
                </div>

                {/* Channel */}
                <ChannelSelector
                  channels={row.channels}
                  onChange={(channels) => updateRow(index, "channels", channels)}
                />

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-white/15 hover:text-destructive shrink-0"
                  onClick={() => removeRow(index)}
                  title="Remove mapping"
                >
                  <X className="size-3" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Add mapping button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs border-dashed border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
        onClick={addRow}
      >
        <Plus className="size-3" />
        Add Mapping
      </Button>
    </div>
  );
}
