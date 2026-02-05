import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { ChannelPopup } from "./ChannelPopup";
import { Route } from "../types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, RefreshCw } from "lucide-react";

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
    x: number;
    y: number;
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
      setContextMenu({ x: e.clientX, y: e.clientY, route });
    }
  };

  const isActive = (portName: string): boolean => {
    const lastActivity = portActivity[portName];
    if (!lastActivity) return false;
    return Date.now() - lastActivity < 200;
  };

  return (
    <div className="flex flex-col gap-3">
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
      </div>

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background" />
              {outputPorts.map((out) => (
                <TableHead
                  key={out.id.name}
                  className={`text-center text-xs ${
                    isActive(out.id.name) ? "text-green-400" : ""
                  }`}
                >
                  {out.id.display_name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inputPorts.map((input) => (
              <TableRow key={input.id.name}>
                <TableCell
                  className={`sticky left-0 z-10 bg-background font-medium text-xs ${
                    isActive(input.id.name) ? "text-green-400" : ""
                  }`}
                >
                  {input.id.display_name}
                </TableCell>
                {outputPorts.map((output) => {
                  const route = getRoute(input.id.name, output.id.name);
                  return (
                    <TableCell
                      key={output.id.name}
                      className={`cursor-pointer select-none text-center transition-colors hover:bg-accent/50 ${
                        route?.enabled ? "bg-green-500/15" : ""
                      }`}
                      onClick={() => handleCellClick(input.id.name, output.id.name)}
                      onContextMenu={(e) =>
                        handleCellRightClick(e, input.id.name, output.id.name)
                      }
                    >
                      {route?.enabled && (
                        <Check className="mx-auto size-4 text-green-400" />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {contextMenu && (
        <ChannelPopup
          route={contextMenu.route}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
