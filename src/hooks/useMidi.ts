import { invoke, Channel } from "@tauri-apps/api/core";
import { MidiPort, Route, ChannelFilter, MidiActivity } from "../types";

export async function getPorts(): Promise<[MidiPort[], MidiPort[]]> {
  return invoke("get_ports");
}

export async function getRoutes(): Promise<Route[]> {
  return invoke("get_routes");
}

export async function addRoute(
  sourceName: string,
  destName: string
): Promise<Route> {
  return invoke("add_route", { sourceName, destName });
}

export async function removeRoute(routeId: string): Promise<void> {
  return invoke("remove_route", { routeId });
}

export async function toggleRoute(routeId: string): Promise<boolean> {
  return invoke("toggle_route", { routeId });
}

export async function setRouteChannels(
  routeId: string,
  filter: ChannelFilter
): Promise<void> {
  return invoke("set_route_channels", { routeId, filter });
}

export async function startMidiMonitor(
  onActivity: (activity: MidiActivity) => void
): Promise<void> {
  const channel = new Channel<MidiActivity>();
  channel.onmessage = onActivity;
  return invoke("start_midi_monitor", { onEvent: channel });
}
