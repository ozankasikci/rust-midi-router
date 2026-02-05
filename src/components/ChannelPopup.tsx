import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Route, ChannelFilter, CcMapping } from "../types";
import { removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { CcMappingsEditor } from "./CcMappingsEditor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, X, Trash2, Check } from "lucide-react";

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
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">(
    "all"
  );
  const [position, setPosition] = useState({ left: x, top: y });
  const popupRef = useRef<HTMLDivElement>(null);

  // CC mappings state
  const [ccPassthrough, setCcPassthrough] = useState(
    route.cc_passthrough ?? true
  );
  const [ccMappings, setCcMappings] = useState<CcMapping[]>(
    route.cc_mappings ?? []
  );

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

  const handleCcMappingsChange = (
    passthrough: boolean,
    mappings: CcMapping[]
  ) => {
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
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-[340px] rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ left: position.left, top: position.top }}
    >
      {/* Header: source -> dest port names + close */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-sm text-green-400 truncate">
            {route.source.display_name}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-sm text-blue-400 truncate">
            {route.destination.display_name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "channels" | "cc")}
      >
        <TabsList className="w-full rounded-none border-b bg-transparent h-9">
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="cc">CC Map</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="p-3">
          <div className="space-y-3">
            {/* Filter mode toggle group */}
            <ToggleGroup
              type="single"
              value={filterMode}
              onValueChange={(value) => {
                if (value) setFilterMode(value as "all" | "only" | "except");
              }}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="all" className="flex-1">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="only" className="flex-1">
                Only
              </ToggleGroupItem>
              <ToggleGroupItem value="except" className="flex-1">
                Except
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Channel grid */}
            {filterMode !== "all" && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  MIDI Channels
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                    <Toggle
                      key={ch}
                      size="sm"
                      pressed={selectedChannels.has(ch)}
                      onPressedChange={() => toggleChannel(ch)}
                      className="h-7 w-full text-xs font-mono data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {ch}
                    </Toggle>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      setSelectedChannels(
                        new Set(Array.from({ length: 16 }, (_, i) => i + 1))
                      )
                    }
                  >
                    All
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSelectedChannels(new Set())}
                  >
                    None
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="cc" className="p-3">
          <CcMappingsEditor
            ccPassthrough={ccPassthrough}
            ccMappings={ccMappings}
            sourcePort={route.source.name}
            destinationPort={route.destination.name}
            onChange={handleCcMappingsChange}
          />
        </TabsContent>
      </Tabs>

      {/* Actions footer */}
      <Separator />
      <div className="flex items-center justify-between px-3 py-2">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 />
          Delete
        </Button>
        <Button size="sm" onClick={handleApply}>
          <Check />
          Apply
        </Button>
      </div>
    </div>
  );
}
