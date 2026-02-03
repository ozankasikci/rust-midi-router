import { useState, useRef, useEffect } from "react";
import "./ChannelSelector.css";

interface ChannelSelectorProps {
  channels: number[];
  onChange: (channels: number[]) => void;
}

export function ChannelSelector({ channels, onChange }: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const toggleChannel = (ch: number) => {
    if (channels.includes(ch)) {
      onChange(channels.filter((c) => c !== ch).sort((a, b) => a - b));
    } else {
      onChange([...channels, ch].sort((a, b) => a - b));
    }
  };

  const selectAll = () => {
    onChange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  };

  const selectNone = () => {
    onChange([]);
  };

  // Format display text
  const getDisplayText = () => {
    if (channels.length === 0) return "—";
    if (channels.length === 16) return "All";
    if (channels.length <= 3) return channels.join(", ");
    return `${channels.length} ch`;
  };

  return (
    <div className="channel-selector" ref={containerRef}>
      <button
        className={`channel-selector-trigger ${isOpen ? "open" : ""} ${channels.length > 0 ? "has-selection" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="channel-selector-text">{getDisplayText()}</span>
        <span className="channel-selector-indicator">
          {channels.length > 0 && (
            <span className="channel-count-dot" style={{
              opacity: Math.min(1, 0.3 + (channels.length / 16) * 0.7)
            }} />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="channel-selector-dropdown">
          <div className="channel-grid-header">
            <button onClick={selectAll} className="channel-quick-btn">All</button>
            <button onClick={selectNone} className="channel-quick-btn">None</button>
          </div>
          <div className="channel-grid">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                className={`channel-btn ${channels.includes(ch) ? "active" : ""}`}
                onClick={() => toggleChannel(ch)}
                type="button"
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
