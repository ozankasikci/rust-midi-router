import { useState, useEffect } from "react";
import { Route, ChannelFilter } from "../types";
import { setRouteChannels, removeRoute } from "../hooks/useMidi";

interface Props {
  route: Route;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelPopup({ route, x, y, onClose }: Props) {
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(
    new Set()
  );
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">("all");

  useEffect(() => {
    // Initialize from route
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
  }, [route]);

  const toggleChannel = (ch: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  };

  const handleApply = async () => {
    let filter: ChannelFilter;
    if (filterMode === "all") {
      filter = "All";
    } else if (filterMode === "only") {
      filter = { Only: Array.from(selectedChannels).sort((a, b) => a - b) };
    } else {
      filter = { Except: Array.from(selectedChannels).sort((a, b) => a - b) };
    }

    await setRouteChannels(route.id, filter);
    onClose();
  };

  const handleDelete = async () => {
    await removeRoute(route.id);
    onClose();
  };

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".channel-popup")) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      className="channel-popup"
      style={{ left: x, top: y, position: "fixed" }}
    >
      <div className="popup-header">
        <span>Channel Filter</span>
        <button onClick={onClose}>×</button>
      </div>

      <div className="filter-mode">
        <label>
          <input
            type="radio"
            checked={filterMode === "all"}
            onChange={() => setFilterMode("all")}
          />
          All channels
        </label>
        <label>
          <input
            type="radio"
            checked={filterMode === "only"}
            onChange={() => setFilterMode("only")}
          />
          Only selected
        </label>
        <label>
          <input
            type="radio"
            checked={filterMode === "except"}
            onChange={() => setFilterMode("except")}
          />
          All except selected
        </label>
      </div>

      {filterMode !== "all" && (
        <div className="channel-grid">
          {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
            <label key={ch} className="channel-checkbox">
              <input
                type="checkbox"
                checked={selectedChannels.has(ch)}
                onChange={() => toggleChannel(ch)}
              />
              {ch}
            </label>
          ))}
        </div>
      )}

      <div className="popup-actions">
        <button onClick={handleDelete} className="delete-btn">
          Delete Route
        </button>
        <button onClick={handleApply} className="apply-btn">
          Apply
        </button>
      </div>
    </div>
  );
}
