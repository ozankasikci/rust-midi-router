import { invoke, Channel } from "@tauri-apps/api/core";
import { MidiPort, Route, ChannelFilter, MidiActivity, Preset, ClockState, CcMapping } from "../types";

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

export async function setRouteCcMappings(
  routeId: string,
  ccPassthrough: boolean,
  ccMappings: CcMapping[]
): Promise<void> {
  return invoke("set_route_cc_mappings", { routeId, ccPassthrough, ccMappings });
}

export async function startMidiMonitor(
  onActivity: (activity: MidiActivity) => void
): Promise<void> {
  const channel = new Channel<MidiActivity>();
  channel.onmessage = onActivity;
  return invoke("start_midi_monitor", { onEvent: channel });
}

export async function listPresets(): Promise<Preset[]> {
  return invoke("list_presets");
}

export async function savePreset(name: string): Promise<Preset> {
  return invoke("save_preset", { name });
}

export async function updatePreset(presetId: string): Promise<Preset> {
  return invoke("update_preset", { presetId });
}

export async function loadPreset(presetId: string): Promise<Preset> {
  return invoke("load_preset", { presetId });
}

export async function deletePreset(presetId: string): Promise<void> {
  return invoke("delete_preset", { presetId });
}

export async function getActivePresetId(): Promise<string | null> {
  return invoke("get_active_preset_id");
}

export async function setBpm(bpm: number): Promise<void> {
  return invoke("set_bpm", { bpm });
}

export async function getClockBpm(): Promise<number> {
  return invoke("get_clock_bpm");
}

export async function startClockMonitor(
  onClockState: (state: ClockState) => void
): Promise<void> {
  const channel = new Channel<ClockState>();
  channel.onmessage = onClockState;
  return invoke("start_clock_monitor", { onEvent: channel });
}

export async function sendTransportStart(): Promise<void> {
  return invoke("send_transport_start");
}

export async function sendTransportStop(): Promise<void> {
  return invoke("send_transport_stop");
}
