import { useState, useEffect } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "../hooks/useMidi";

export function ClockControl() {
  const [bpm, setBpm] = useState(120);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    // Load initial BPM
    api.getClockBpm().then(setBpm);

    // Subscribe to clock state changes
    api.startClockMonitor((state) => {
      setBpm(state.bpm);
      setRunning(state.running);
    });
  }, []);

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseFloat(e.target.value);
    if (!isNaN(newBpm) && newBpm >= 20 && newBpm <= 300) {
      setBpm(newBpm);
      api.setBpm(newBpm);
    }
  };

  const handlePlay = () => {
    api.sendTransportStart();
  };

  const handleStop = () => {
    api.sendTransportStop();
  };

  return (
    <div className="flex items-center gap-2 pl-4 border-l">
      <div className="flex gap-0.5">
        <Button
          variant={running ? "default" : "outline"}
          size="icon"
          className={`h-7 w-7 ${running ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
          onClick={handlePlay}
          title="Play (Send MIDI Start)"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleStop}
          title="Stop (Send MIDI Stop)"
        >
          <Square className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">BPM</span>
        <Input
          type="number"
          value={bpm}
          onChange={handleBpmChange}
          min={20}
          max={300}
          step={0.1}
          className="h-7 w-16 text-xs font-mono text-center"
        />
      </div>
    </div>
  );
}
