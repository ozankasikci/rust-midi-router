import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { MidiActivity, MessageKind } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  if (kind.kind === "Clock") {
    return "Clock";
  }
  if (kind.kind === "Start") {
    return "Start";
  }
  if (kind.kind === "Continue") {
    return "Continue";
  }
  if (kind.kind === "Stop") {
    return "Stop";
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

function getBadgeVariant(
  kind: MessageKind["kind"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (kind) {
    case "NoteOn":
    case "NoteOff":
      return "default";
    case "ControlChange":
      return "secondary";
    case "Stop":
      return "destructive";
    default:
      return "outline";
  }
}

function ActivityRow({ activity }: { activity: MidiActivity }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {formatTimestamp(activity.timestamp)}
      </TableCell>
      <TableCell className="text-xs text-blue-400">
        {activity.port}
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {activity.channel !== null ? `Ch ${activity.channel + 1}` : "-"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={getBadgeVariant(activity.kind.kind)}
          className="text-xs font-mono"
        >
          {formatMessage(activity.kind)}
        </Badge>
      </TableCell>
    </TableRow>
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">MIDI Monitor</span>
        <Button variant="outline" size="sm" onClick={clearLog}>
          Clear
        </Button>
      </div>
      <div className="flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Port</TableHead>
              <TableHead>Ch</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activityLog.map((activity, i) => (
              <ActivityRow key={i} activity={activity} />
            ))}
          </TableBody>
        </Table>
        {activityLog.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No MIDI activity yet
          </div>
        )}
      </div>
    </div>
  );
}
