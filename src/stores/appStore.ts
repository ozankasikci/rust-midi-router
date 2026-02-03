import { create } from "zustand";
import { MidiPort, Route, MidiActivity } from "../types";
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
  addRoute: (sourceName: string, destName: string) => Promise<void>;
  removeRoute: (routeId: string) => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
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
      set({ inputPorts: inputs, outputPorts: outputs });
    } catch (e) {
      console.error("Failed to refresh ports:", e);
    } finally {
      set({ loadingPorts: false });
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
