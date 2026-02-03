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

  const handlePlay = () => {
    api.sendTransportStart();
  };

  const handleStop = () => {
    api.sendTransportStop();
  };

  return (
    <div className="clock-control">
      <div className="transport-buttons">
        <button
          className={`transport-btn play-btn ${running ? "active" : ""}`}
          onClick={handlePlay}
          title="Play (Send MIDI Start)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
        <button
          className="transport-btn stop-btn"
          onClick={handleStop}
          title="Stop (Send MIDI Stop)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" />
          </svg>
        </button>
      </div>
      <div className="bpm-control">
        <label>BPM</label>
        <input
          type="number"
          value={bpm}
          onChange={handleBpmChange}
          min={20}
          max={300}
          step={0.1}
        />
      </div>
    </div>
  );
}
