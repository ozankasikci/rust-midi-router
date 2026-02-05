import { useState, useEffect } from "react";
import { Route, ChannelFilter, CcMapping } from "../types";
import { removeRoute } from "../hooks/useMidi";
import { useAppStore } from "../stores/appStore";
import { CcMappingsEditor } from "./CcMappingsEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Trash2, Check } from "lucide-react";

interface Props {
  route: Route;
  onClose: () => void;
}

export function ChannelPopup({ route, onClose }: Props) {
  const { updateRouteChannels, updateRouteCcMappings } = useAppStore();
  const [activeTab, setActiveTab] = useState<"channels" | "cc">("channels");
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(
    new Set()
  );
  const [filterMode, setFilterMode] = useState<"all" | "only" | "except">(
    "all"
  );

  // CC mappings state
  const [ccPassthrough, setCcPassthrough] = useState(
    route.cc_passthrough ?? true
  );
  const [ccMappings, setCcMappings] = useState<CcMapping[]>(
    route.cc_mappings ?? []
  );

  useEffect(() => {
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
    let filter: ChannelFilter;
    if (filterMode === "all") {
      filter = "All";
    } else if (filterMode === "only") {
      filter = { Only: Array.from(selectedChannels).sort((a, b) => a - b) };
    } else {
      filter = { Except: Array.from(selectedChannels).sort((a, b) => a - b) };
    }
    await updateRouteChannels(route.id, filter);
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden" showCloseButton>
        {/* Header — signal flow */}
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle className="flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span className="font-mono text-emerald-400 tracking-tight">
                {route.source.display_name}
              </span>
            </span>
            <ArrowRight className="size-3.5 text-white/20" />
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
              <span className="font-mono text-sky-400 tracking-tight">
                {route.destination.display_name}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure route settings
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "channels" | "cc")}
        >
          <div className="px-5">
            <TabsList className="w-full">
              <TabsTrigger value="channels" className="flex-1 text-xs">Channels</TabsTrigger>
              <TabsTrigger value="cc" className="flex-1 text-xs">CC Map</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="channels" className="px-5 py-4">
            <div className="space-y-4">
              {/* Filter mode */}
              <div className="space-y-2">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Filter Mode
                </label>
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
                  <ToggleGroupItem value="all" className="flex-1 text-xs">All</ToggleGroupItem>
                  <ToggleGroupItem value="only" className="flex-1 text-xs">Only</ToggleGroupItem>
                  <ToggleGroupItem value="except" className="flex-1 text-xs">Except</ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Channel grid */}
              {filterMode !== "all" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                      MIDI Channels
                    </label>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[10px]"
                        onClick={() =>
                          setSelectedChannels(
                            new Set(Array.from({ length: 16 }, (_, i) => i + 1))
                          )
                        }
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[10px]"
                        onClick={() => setSelectedChannels(new Set())}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                      <Toggle
                        key={ch}
                        size="sm"
                        pressed={selectedChannels.has(ch)}
                        onPressedChange={() => toggleChannel(ch)}
                        className="h-8 w-full text-xs font-mono data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-400 data-[state=on]:border-emerald-500/30 data-[state=on]:shadow-[inset_0_1px_0_rgba(52,211,153,0.1)]"
                      >
                        {ch}
                      </Toggle>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="cc" className="px-5 py-4">
            <CcMappingsEditor
              ccPassthrough={ccPassthrough}
              ccMappings={ccMappings}
              sourcePort={route.source.name}
              destinationPort={route.destination.name}
              onChange={handleCcMappingsChange}
            />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Separator />
        <DialogFooter className="flex-row items-center justify-between px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.15)]"
            onClick={handleApply}
          >
            <Check className="size-3.5" />
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
