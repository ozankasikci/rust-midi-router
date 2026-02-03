import { useState, useEffect, useMemo, useCallback } from "react";
import { CcMapping, CcTarget, MidiActivity } from "../types";
import {
  findDeviceCcMap,
  getParametersByCategory,
} from "../data/deviceCcMaps";
import { startMidiMonitor } from "../hooks/useMidi";
import { ChannelSelector } from "./ui";

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
        <select
          value={row.targetCC}
          onChange={(e) => updateRow(index, "targetCC", e.target.value)}
          className="cc-select"
        >
          {Array.from(parametersByCategory.entries()).map(
            ([category, params]) => (
              <optgroup key={category} label={category}>
                {params.map((param) => (
                  <option key={param.cc} value={param.cc}>
                    {param.name} ({param.cc})
                  </option>
                ))}
              </optgroup>
            )
          )}
          {/* Allow manual CC entry if not in list */}
          {!deviceMap.parameters.find((p) => p.cc === row.targetCC) && (
            <option value={row.targetCC}>CC {row.targetCC}</option>
          )}
        </select>
      );
    }

    return (
      <input
        type="number"
        min="0"
        max="127"
        value={row.targetCC}
        onChange={(e) => updateRow(index, "targetCC", e.target.value)}
      />
    );
  };

  // Render source CC input with learn button
  const renderSourceCcInput = (row: FlatRow, index: number) => {
    const isLearning = learningRowIndex === index;

    return (
      <div className="source-cc-input">
        <input
          type="number"
          min="0"
          max="127"
          value={row.sourceCC}
          onChange={(e) => updateRow(index, "sourceCC", e.target.value)}
          disabled={isLearning}
          className={isLearning ? "learning" : ""}
        />
        {isLearning ? (
          <button
            className="learn-btn learning"
            onClick={cancelLearning}
            title="Cancel learning"
          >
            ...
          </button>
        ) : (
          <button
            className="learn-btn"
            onClick={() => startLearning(index)}
            title="Learn: move a knob on your controller"
          >
            Learn
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="cc-mappings-editor">
      <label className="passthrough-checkbox">
        <input
          type="checkbox"
          checked={passthrough}
          onChange={(e) => handlePassthroughChange(e.target.checked)}
        />
        Pass through unmapped CCs
      </label>

      {deviceMap && (
        <div className="device-detected">
          Device: {deviceMap.name}
        </div>
      )}

      {learningRowIndex !== null && (
        <div className="learn-prompt">
          Move a knob or fader on your controller...
        </div>
      )}

      {rows.length > 0 && (
        <table className="cc-mappings-table">
          <thead>
            <tr>
              <th>Source CC</th>
              <th>Target Parameter</th>
              <th>Channels</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={learningRowIndex === index ? "learning-row" : ""}>
                <td>{renderSourceCcInput(row, index)}</td>
                <td>{renderTargetCcSelector(row, index)}</td>
                <td>
                  <ChannelSelector
                    channels={row.channels}
                    onChange={(channels) => updateRow(index, "channels", channels)}
                  />
                </td>
                <td>
                  <button
                    className="remove-row-btn"
                    onClick={() => removeRow(index)}
                    title="Remove mapping"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="add-mapping-btn" onClick={addRow}>
        + Add Mapping
      </button>
    </div>
  );
}
