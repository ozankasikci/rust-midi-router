export interface PortId {
  name: string;
  display_name: string;
}

export interface MidiPort {
  id: PortId;
  is_input: boolean;
}

export type ChannelFilter =
  | { All: null }
  | { Only: number[] }
  | { Except: number[] };

export interface Route {
  id: string;
  source: PortId;
  destination: PortId;
  enabled: boolean;
  channels: ChannelFilter;
}

export type MessageKind =
  | { kind: "NoteOn"; data: { note: number; velocity: number } }
  | { kind: "NoteOff"; data: { note: number; velocity: number } }
  | { kind: "ControlChange"; data: { controller: number; value: number } }
  | { kind: "ProgramChange"; data: { program: number } }
  | { kind: "PitchBend"; data: { value: number } }
  | { kind: "Aftertouch"; data: { value: number } }
  | { kind: "PolyAftertouch"; data: { note: number; value: number } }
  | { kind: "SysEx" }
  | { kind: "Other" };

export interface MidiActivity {
  timestamp: number;
  port: string;
  channel: number | null;
  kind: MessageKind;
  raw: number[];
}

export interface Preset {
  id: string;
  name: string;
  routes: Route[];
  created_at: string;
  modified_at: string;
}
