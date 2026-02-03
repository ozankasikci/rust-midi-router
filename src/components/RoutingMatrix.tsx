import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { ChannelPopup } from "./ChannelPopup";
import { Route } from "../types";

export function RoutingMatrix() {
  const {
    inputPorts,
    outputPorts,
    routes,
    portActivity,
    refreshPorts,
    addRoute,
    removeRoute,
    toggleRoute,
  } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    route: Route;
  } | null>(null);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

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
    <div className="routing-matrix">
      <table>
        <thead>
          <tr>
            <th></th>
            {outputPorts.map((out) => (
              <th key={out.id.name} className={isActive(out.id.name) ? "active" : ""}>
                {out.id.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inputPorts.map((input) => (
            <tr key={input.id.name}>
              <td className={`port-label ${isActive(input.id.name) ? "active" : ""}`}>
                {input.id.display_name}
              </td>
              {outputPorts.map((output) => {
                const route = getRoute(input.id.name, output.id.name);
                return (
                  <td
                    key={output.id.name}
                    className={`matrix-cell ${route?.enabled ? "connected" : ""}`}
                    onClick={() => handleCellClick(input.id.name, output.id.name)}
                    onContextMenu={(e) =>
                      handleCellRightClick(e, input.id.name, output.id.name)
                    }
                  >
                    {route?.enabled && <span className="check">&#10003;</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

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
