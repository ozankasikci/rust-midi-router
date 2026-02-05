import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";

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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
    if (channels.length === 0) return "\u2014";
    if (channels.length === 16) return "All";
    if (channels.length <= 3) return channels.join(", ");
    return `${channels.length} ch`;
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 min-w-[54px] text-xs font-mono"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {getDisplayText()}
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 p-2 rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="flex gap-1 pb-2 mb-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-xs"
              onClick={selectAll}
              type="button"
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-xs"
              onClick={selectNone}
              type="button"
            >
              None
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <Toggle
                key={ch}
                className="h-6 w-6 text-[9px] font-mono p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                pressed={channels.includes(ch)}
                onPressedChange={() => toggleChannel(ch)}
              >
                {ch}
              </Toggle>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
