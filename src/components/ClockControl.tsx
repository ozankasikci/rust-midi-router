import { useState, useEffect } from "react";
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

  return (
    <div className="clock-control">
      <label>BPM:</label>
      <input
        type="number"
        value={bpm}
        onChange={handleBpmChange}
        min={20}
        max={300}
        step={0.1}
      />
      <span className={`clock-status ${running ? "playing" : "stopped"}`}>
        {running ? "\u25B6 Playing" : "\u25CF Stopped"}
      </span>
    </div>
  );
}
