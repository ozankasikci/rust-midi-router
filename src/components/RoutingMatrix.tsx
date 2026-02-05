import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { ChannelPopup } from "./ChannelPopup";
import { Route } from "../types";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function RoutingMatrix() {
  const {
    inputPorts,
    outputPorts,
    routes,
    portActivity,
    loadingPorts,
    refreshPorts,
    addRoute,
    toggleRoute,
  } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    route: Route;
  } | null>(null);

  useEffect(() => {
    refreshPorts().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRoute = (inputName: string, outputName: string): Route | undefined => {
    return routes.find(
      (r) => r.source.name === inputName && r.destination.name === outputName
    );
  };

  const handleCellClick = async (inputName: string, outputName: string) => {
    const existingRoute = getRoute(inputName, outputName);
    if (existingRoute) {
      await toggleRoute(existingRoute.id);
    } else {
      await addRoute(inputName, outputName);
    }
  };

  const handleCellRightClick = (
    e: React.MouseEvent,
    inputName: string,
    outputName: string
  ) => {
    e.preventDefault();
    const route = getRoute(inputName, outputName);
    if (route) {
      setContextMenu({ route });
    }
  };

  const isActive = (portName: string): boolean => {
    const lastActivity = portActivity[portName];
    if (!lastActivity) return false;
    return Date.now() - lastActivity < 200;
  };

  const colCount = outputPorts.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshPorts()}
          disabled={loadingPorts}
        >
          <RefreshCw className={loadingPorts ? "animate-spin" : ""} />
          {loadingPorts ? "Refreshing..." : "Refresh Ports"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {inputPorts.length} in / {outputPorts.length} out
        </span>
      </div>

      {inputPorts.length === 0 || outputPorts.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-sm text-muted-foreground">
          No MIDI ports detected. Connect a device and refresh.
        </div>
      ) : (
        <div className="inline-block">
          {/* Column headers — rotated output port names */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `160px repeat(${colCount}, 44px)`,
            }}
          >
            {/* Corner spacer */}
            <div className="h-[100px]" />

            {outputPorts.map((out) => {
              const active = isActive(out.id.name);
              return (
                <div
                  key={out.id.name}
                  className="relative h-[100px] flex items-end justify-center"
                >
                  <span
                    className={`
                      absolute bottom-0 left-1/2 origin-bottom-left
                      -rotate-45 whitespace-nowrap
                      text-[11px] font-medium tracking-tight
                      transition-colors duration-150
                      ${active ? "text-emerald-400" : "text-muted-foreground"}
                    `}
                  >
                    {out.id.display_name}
                  </span>
                  {active && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Rows: input label + crosspoint cells */}
          {inputPorts.map((input) => {
            const active = isActive(input.id.name);
            return (
              <div
                key={input.id.name}
                className="grid group/row"
                style={{
                  gridTemplateColumns: `160px repeat(${colCount}, 44px)`,
                }}
              >
                {/* Input port label */}
                <div
                  className={`
                    flex items-center gap-2 pr-3 h-[44px]
                    text-[11px] font-medium tracking-tight
                    transition-colors duration-150
                    ${active ? "text-emerald-400" : "text-muted-foreground"}
                  `}
                >
                  {active && (
                    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                  )}
                  <span className="truncate text-right w-full">
                    {input.id.display_name}
                  </span>
                </div>

                {/* Crosspoint cells */}
                {outputPorts.map((output) => {
                  const route = getRoute(input.id.name, output.id.name);
                  const enabled = route?.enabled;
                  const hasRoute = !!route;

                  return (
                    <div
                      key={output.id.name}
                      className={`
                        relative flex items-center justify-center
                        h-[44px] border border-white/[0.04]
                        cursor-pointer select-none
                        transition-all duration-100
                        ${enabled
                          ? "bg-emerald-500/10"
                          : "hover:bg-white/[0.03]"
                        }
                        group/cell
                      `}
                      onClick={() =>
                        handleCellClick(input.id.name, output.id.name)
                      }
                      onContextMenu={(e) =>
                        handleCellRightClick(e, input.id.name, output.id.name)
                      }
                    >
                      {/* Crosspoint indicator */}
                      {enabled ? (
                        <div className="size-5 rounded-sm bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] transition-all" />
                      ) : hasRoute ? (
                        <div className="size-5 rounded-sm bg-white/[0.06] border border-white/10 transition-all" />
                      ) : (
                        <div className="size-1 rounded-full bg-white/[0.08] group-hover/cell:size-5 group-hover/cell:rounded-sm group-hover/cell:bg-white/[0.06] group-hover/cell:border group-hover/cell:border-white/10 transition-all" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <ChannelPopup
          route={contextMenu.route}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
