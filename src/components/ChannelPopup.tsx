import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Route, ChannelFilter, CcMapping } from "../types";
import { removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { CcMappingsEditor } from "./CcMappingsEditor";

interface Props {
  route: Route;
  x: number;
  y: number;
  onClose: () => void;
}

export function ChannelPopup({ route, x, y, onClose }: Props) {
  const { updateRouteChannels, updateRouteCcMappings } = useAppStore();
  const [activeTab, setActiveTab] = useState<"channels" | "cc">("channels");
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(
    new Set()
  );
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">("all");
  const [position, setPosition] = useState({ left: x, top: y });
  const popupRef = useRef<HTMLDivElement>(null);

  // CC mappings state
  const [ccPassthrough, setCcPassthrough] = useState(route.cc_passthrough ?? true);
  const [ccMappings, setCcMappings] = useState<CcMapping[]>(route.cc_mappings ?? []);

  useEffect(() => {
    // Initialize channel filter from route
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

    // Initialize CC mappings from route
    setCcPassthrough(route.cc_passthrough ?? true);
    setCcMappings(route.cc_mappings ?? []);
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
    // Save channel filter
    let filter: ChannelFilter;
    if (filterMode === "all") {
      filter = "All";
    } else if (filterMode === "only") {
      filter = { Only: Array.from(selectedChannels).sort((a, b) => a - b) };
    } else {
      filter = { Except: Array.from(selectedChannels).sort((a, b) => a - b) };
    }
    await updateRouteChannels(route.id, filter);

    // Save CC mappings
    await updateRouteCcMappings(route.id, ccPassthrough, ccMappings);

    onClose();
  };

  const handleCcMappingsChange = (passthrough: boolean, mappings: CcMapping[]) => {
    setCcPassthrough(passthrough);
    setCcMappings(mappings);
  };

  const handleDelete = async () => {
    await removeRoute(route.id);
    onClose();
  };

  // Adjust position to keep popup within viewport
  useLayoutEffect(() => {
    if (!popupRef.current) return;

    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const padding = 8; // Minimum distance from edge

    let newLeft = x;
    let newTop = y;

    // Check right edge
    if (x + rect.width > window.innerWidth - padding) {
      newLeft = window.innerWidth - rect.width - padding;
    }

    // Check bottom edge
    if (y + rect.height > window.innerHeight - padding) {
      newTop = window.innerHeight - rect.height - padding;
    }

    // Check left edge
    if (newLeft < padding) {
      newLeft = padding;
    }

    // Check top edge
    if (newTop < padding) {
      newTop = padding;
    }

    setPosition({ left: newLeft, top: newTop });
  }, [x, y, activeTab]); // Re-run when tab changes since size may differ

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
      ref={popupRef}
      className="channel-popup"
      style={{ left: position.left, top: position.top, position: "fixed" }}
    >
      <div className="popup-header">
        <span>{route.source.display_name} → {route.destination.display_name}</span>
        <button onClick={onClose}>×</button>
      </div>

      <div className="popup-tabs">
        <button
          className={activeTab === "channels" ? "active" : ""}
          onClick={() => setActiveTab("channels")}
        >
          Channels
        </button>
        <button
          className={activeTab === "cc" ? "active" : ""}
          onClick={() => setActiveTab("cc")}
        >
          CC Mappings
        </button>
      </div>

      {activeTab === "channels" && (
        <>
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
        </>
      )}

      {activeTab === "cc" && (
        <CcMappingsEditor
          ccPassthrough={ccPassthrough}
          ccMappings={ccMappings}
          sourcePort={route.source.name}
          destinationPort={route.destination.name}
          onChange={handleCcMappingsChange}
        />
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
