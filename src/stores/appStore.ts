import { create } from "zustand";
import { MidiPort, Route, MidiActivity, CcMapping, ChannelFilter } from "../types";
import * as api from "../hooks/useMidi";

interface AppState {
  // Ports
  inputPorts: MidiPort[];
  outputPorts: MidiPort[];
  loadingPorts: boolean;

  // Routes
  routes: Route[];

  // Monitor
  monitorActive: boolean;
  activityLog: MidiActivity[];
  portActivity: Record<string, number>; // port name -> last activity timestamp

  // Actions
  refreshPorts: () => Promise<void>;
  refreshRoutes: () => Promise<void>;
  addRoute: (sourceName: string, destName: string) => Promise<void>;
  removeRoute: (routeId: string) => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
  updateRouteChannels: (routeId: string, filter: ChannelFilter) => Promise<void>;
  updateRouteCcMappings: (routeId: string, ccPassthrough: boolean, ccMappings: CcMapping[]) => Promise<void>;
  startMonitor: () => Promise<void>;
  clearLog: () => void;
}

const MAX_LOG_SIZE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  inputPorts: [],
  outputPorts: [],
  loadingPorts: false,
  routes: [],
  monitorActive: false,
  activityLog: [],
  portActivity: {},

  refreshPorts: async () => {
    set({ loadingPorts: true });
    try {
      const [inputs, outputs] = await api.getPorts();
      console.log("[Store] refreshPorts: inputs=", inputs.length, "outputs=", outputs.length);
      // Force new array references to ensure React re-renders
      set({ inputPorts: [...inputs], outputPorts: [...outputs] });
      // Also refresh routes when refreshing ports
      await get().refreshRoutes();
    } catch (e) {
      console.error("Failed to refresh ports:", e);
    } finally {
      set({ loadingPorts: false });
    }
  },

  refreshRoutes: async () => {
    try {
      const routes = await api.getRoutes();
      set({ routes });
    } catch (e) {
      console.error("Failed to refresh routes:", e);
    }
  },

  addRoute: async (sourceName: string, destName: string) => {
    const route = await api.addRoute(sourceName, destName);
    set((state) => ({ routes: [...state.routes, route] }));
  },

  removeRoute: async (routeId: string) => {
    await api.removeRoute(routeId);
    set((state) => ({
      routes: state.routes.filter((r) => r.id !== routeId),
    }));
  },

  toggleRoute: async (routeId: string) => {
    const newEnabled = await api.toggleRoute(routeId);
    set((state) => ({
      routes: state.routes.map((r) =>
        r.id === routeId ? { ...r, enabled: newEnabled } : r
      ),
    }));
  },

  updateRouteChannels: async (routeId: string, filter: ChannelFilter) => {
    await api.setRouteChannels(routeId, filter);
    set((state) => ({
      routes: state.routes.map((r) =>
        r.id === routeId ? { ...r, channels: filter } : r
      ),
    }));
  },

  updateRouteCcMappings: async (routeId: string, ccPassthrough: boolean, ccMappings: CcMapping[]) => {
    await api.setRouteCcMappings(routeId, ccPassthrough, ccMappings);
    set((state) => ({
      routes: state.routes.map((r) =>
        r.id === routeId ? { ...r, cc_passthrough: ccPassthrough, cc_mappings: ccMappings } : r
      ),
    }));
  },

  startMonitor: async () => {
    if (get().monitorActive) return;

    await api.startMidiMonitor((activity) => {
      set((state) => {
        const newLog = [activity, ...state.activityLog].slice(0, MAX_LOG_SIZE);
        const newActivity = {
          ...state.portActivity,
          [activity.port]: Date.now(),
        };
        return { activityLog: newLog, portActivity: newActivity };
      });
    });

    set({ monitorActive: true });
  },

  clearLog: () => {
    set({ activityLog: [] });
  },
}));
