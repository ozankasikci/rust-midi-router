import { useState, useEffect, useMemo, useCallback } from "react";
import { CcMapping, CcTarget, MidiActivity } from "../types";
import {
  findDeviceCcMap,
  getParametersByCategory,
} from "../data/deviceCcMaps";
import { startMidiMonitor } from "../hooks/useMidi";
import { ChannelSelector } from "./ui";
import "./CcMappingsEditor.css";

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

  return (
    <div className="cc-editor">
      {/* Header with passthrough toggle */}
      <div className="cc-editor-header">
        <label className="passthrough-toggle">
          <input
            type="checkbox"
            checked={passthrough}
            onChange={(e) => handlePassthroughChange(e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">Pass unmapped</span>
        </label>

        {deviceMap && (
          <div className="device-badge">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="3" fill="currentColor"/>
            </svg>
            {deviceMap.name}
          </div>
        )}
      </div>

      {/* Learning indicator */}
      {learningRowIndex !== null && (
        <div className="learn-banner">
          <div className="learn-pulse" />
          <span>Move a knob or fader...</span>
          <button onClick={cancelLearning}>Cancel</button>
        </div>
      )}

      {/* Mappings list */}
      <div className="mappings-list">
        {rows.length === 0 ? (
          <div className="empty-mappings">
            <svg width="32" height="32" viewBox="0 0 32 32" className="empty-icon">
              <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
              <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
              <path d="M11 11 L21 21" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.3"/>
            </svg>
            <p>No CC mappings</p>
            <span>Map controller knobs to device parameters</span>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={index}
              className={`mapping-row ${learningRowIndex === index ? "learning" : ""}`}
            >
              {/* Source section */}
              <div className="mapping-source">
                <div className="section-label">FROM</div>
                <div className="cc-input-group">
                  <input
                    type="number"
                    min="0"
                    max="127"
                    value={row.sourceCC}
                    onChange={(e) => updateRow(index, "sourceCC", e.target.value)}
                    disabled={learningRowIndex === index}
                    className="cc-number-input"
                  />
                  <button
                    className={`learn-btn ${learningRowIndex === index ? "active" : ""}`}
                    onClick={() => learningRowIndex === index ? cancelLearning() : startLearning(index)}
                  >
                    {learningRowIndex === index ? (
                      <span className="learning-dots">...</span>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10">
                          <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                          <circle cx="5" cy="5" r="1" fill="currentColor"/>
                        </svg>
                        Learn
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Arrow */}
              <div className="mapping-arrow">
                <svg width="24" height="12" viewBox="0 0 24 12">
                  <path d="M0 6 H18 M14 2 L18 6 L14 10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>

              {/* Target section */}
              <div className="mapping-target">
                <div className="section-label">TO</div>
                {renderTargetCcSelector(row, index)}
              </div>

              {/* Channel section */}
              <div className="mapping-channels">
                <div className="section-label">CH</div>
                <ChannelSelector
                  channels={row.channels}
                  onChange={(channels) => updateRow(index, "channels", channels)}
                />
              </div>

              {/* Delete button */}
              <button
                className="mapping-delete"
                onClick={() => removeRow(index)}
                title="Remove mapping"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add mapping button */}
      <button className="add-mapping" onClick={addRow}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 2 V10 M2 6 H10" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        Add Mapping
      </button>
    </div>
  );
}
