import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Route, ChannelFilter, CcMapping } from "../types";
import { removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { CcMappingsEditor } from "./CcMappingsEditor";
import "./ChannelPopup.css";

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
  const [isVisible, setIsVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // CC mappings state
  const [ccPassthrough, setCcPassthrough] = useState(route.cc_passthrough ?? true);
  const [ccMappings, setCcMappings] = useState<CcMapping[]>(route.cc_mappings ?? []);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

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
      className={`route-popup ${isVisible ? 'visible' : ''}`}
      style={{ left: position.left, top: position.top, position: "fixed" }}
    >
      {/* Rack-style header with notches */}
      <div className="popup-rack-header">
        <div className="rack-notch" />
        <div className="rack-notch" />
        <div className="rack-notch" />
      </div>

      <div className="popup-header">
        <div className="route-path">
          <span className="port-name source">{route.source.display_name}</span>
          <span className="route-arrow">
            <svg width="20" height="10" viewBox="0 0 20 10">
              <path d="M0 5 L14 5 M10 1 L14 5 L10 9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </span>
          <span className="port-name dest">{route.destination.display_name}</span>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
      </div>

      <div className="popup-tabs">
        <button
          className={activeTab === "channels" ? "active" : ""}
          onClick={() => setActiveTab("channels")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" className="tab-icon">
            <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.8"/>
            <rect x="9" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.4"/>
            <rect x="1" y="9" width="4" height="4" rx="1" fill="currentColor" opacity="0.4"/>
            <rect x="9" y="9" width="4" height="4" rx="1" fill="currentColor" opacity="0.8"/>
          </svg>
          Channels
        </button>
        <button
          className={activeTab === "cc" ? "active" : ""}
          onClick={() => setActiveTab("cc")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" className="tab-icon">
            <circle cx="4" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M5.5 5.5 L8.5 8.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          CC Map
        </button>
      </div>

      <div className="popup-content">
        {activeTab === "channels" && (
          <div className="channels-tab">
            <div className="filter-mode">
              <label className={`filter-option ${filterMode === "all" ? "selected" : ""}`}>
                <input
                  type="radio"
                  checked={filterMode === "all"}
                  onChange={() => setFilterMode("all")}
                />
                <span className="filter-radio" />
                <span className="filter-label">All channels</span>
              </label>
              <label className={`filter-option ${filterMode === "only" ? "selected" : ""}`}>
                <input
                  type="radio"
                  checked={filterMode === "only"}
                  onChange={() => setFilterMode("only")}
                />
                <span className="filter-radio" />
                <span className="filter-label">Only selected</span>
              </label>
              <label className={`filter-option ${filterMode === "except" ? "selected" : ""}`}>
                <input
                  type="radio"
                  checked={filterMode === "except"}
                  onChange={() => setFilterMode("except")}
                />
                <span className="filter-radio" />
                <span className="filter-label">All except</span>
              </label>
            </div>

            {filterMode !== "all" && (
              <div className="led-matrix">
                <div className="matrix-label">MIDI Channels</div>
                <div className="led-grid">
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                    <button
                      key={ch}
                      className={`led-btn ${selectedChannels.has(ch) ? "active" : ""}`}
                      onClick={() => toggleChannel(ch)}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
                <div className="matrix-quick-actions">
                  <button onClick={() => setSelectedChannels(new Set(Array.from({ length: 16 }, (_, i) => i + 1)))}>
                    All
                  </button>
                  <button onClick={() => setSelectedChannels(new Set())}>
                    None
                  </button>
                </div>
              </div>
            )}
          </div>
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
      </div>

      <div className="popup-actions">
        <button onClick={handleDelete} className="action-btn danger">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Delete
        </button>
        <button onClick={handleApply} className="action-btn primary">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
          Apply
        </button>
      </div>
    </div>
  );
}
