import { useState } from "react";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import { PresetBar } from "./components/PresetBar";
import { ClockControl } from "./components/ClockControl";
import "./styles/design-tokens.css";
import "./App.css";

type Tab = "matrix" | "monitor";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIDI Router</h1>
        <PresetBar />
        <ClockControl />
      </header>

      <main className="app-main">
        <div style={{ display: activeTab === "matrix" ? "block" : "none" }}>
          <RoutingMatrix />
        </div>
        <div style={{ display: activeTab === "monitor" ? "block" : "none" }}>
          <MonitorLog />
        </div>
      </main>

      <nav className="app-tabs">
        <button
          className={activeTab === "matrix" ? "active" : ""}
          onClick={() => setActiveTab("matrix")}
        >
          Matrix
        </button>
        <button
          className={activeTab === "monitor" ? "active" : ""}
          onClick={() => setActiveTab("monitor")}
        >
          Monitor
        </button>
      </nav>
    </div>
  );
}

export default App;
