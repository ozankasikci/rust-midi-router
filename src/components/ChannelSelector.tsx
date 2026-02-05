import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ChannelSelectorProps {
  channels: number[];
  onChange: (channels: number[]) => void;
}

export function ChannelSelector({ channels, onChange }: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  const getDisplayText = () => {
    if (channels.length === 0) return "\u2014";
    if (channels.length === 16) return "All";
    if (channels.length <= 3) return channels.join(", ");
    return `${channels.length} ch`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 min-w-[52px] text-[10px] font-mono border-white/[0.06] bg-transparent"
          type="button"
        >
          <span className="text-white/30 text-[9px]">CH</span>
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1 pb-2 mb-2 border-b border-white/[0.06]">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-6 text-[10px]"
            onClick={selectAll}
            type="button"
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-6 text-[10px]"
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
              className="h-6 w-6 text-[9px] font-mono p-0 data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-400 data-[state=on]:border-emerald-500/30"
              pressed={channels.includes(ch)}
              onPressedChange={() => toggleChannel(ch)}
            >
              {ch}
            </Toggle>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
