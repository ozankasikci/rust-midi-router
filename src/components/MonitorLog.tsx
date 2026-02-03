import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { MidiActivity, MessageKind } from "../types";

function formatMessage(kind: MessageKind): string {
  if (kind.kind === "NoteOn") {
    return `NoteOn  ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  }
  if (kind.kind === "NoteOff") {
    return `NoteOff ${noteName(kind.data.note)} vel=${kind.data.velocity}`;
  }
  if (kind.kind === "ControlChange") {
    return `CC ${kind.data.controller} val=${kind.data.value}`;
  }
  if (kind.kind === "ProgramChange") {
    return `PC ${kind.data.program}`;
  }
  if (kind.kind === "PitchBend") {
    return `Pitch ${kind.data.value}`;
  }
  if (kind.kind === "Aftertouch") {
    return `AT ${kind.data.value}`;
  }
  if (kind.kind === "PolyAftertouch") {
    return `PolyAT ${noteName(kind.data.note)} ${kind.data.value}`;
  }
  if (kind.kind === "SysEx") {
    return "SysEx";
  }
  return "Other";
}

function noteName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave}`.padEnd(4);
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts / 1000); // Convert microseconds to milliseconds
  const timeStr = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${timeStr}.${ms}`;
}

function ActivityRow({ activity }: { activity: MidiActivity }) {
  return (
    <tr>
      <td className="timestamp">{formatTimestamp(activity.timestamp)}</td>
      <td className="port">{activity.port}</td>
      <td className="channel">
        {activity.channel !== null ? `Ch ${activity.channel + 1}` : "-"}
      </td>
      <td className="message">{formatMessage(activity.kind)}</td>
    </tr>
  );
}

export function MonitorLog() {
  const { activityLog, monitorActive, startMonitor, clearLog } = useAppStore();

  useEffect(() => {
    if (!monitorActive) {
      startMonitor();
    }
  }, [monitorActive, startMonitor]);

  return (
    <div className="monitor-log">
      <div className="monitor-header">
        <span>MIDI Monitor</span>
        <button onClick={clearLog}>Clear</button>
      </div>
      <div className="log-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Port</th>
              <th>Ch</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {activityLog.map((activity, i) => (
              <ActivityRow key={i} activity={activity} />
            ))}
          </tbody>
        </table>
        {activityLog.length === 0 && (
          <div className="empty-state">No MIDI activity yet</div>
        )}
      </div>
    </div>
  );
}
