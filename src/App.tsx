import { useState } from "react";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import "./App.css";

type Tab = "matrix" | "monitor";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIDI Router</h1>
      </header>

      <main className="app-main">
        {activeTab === "matrix" && <RoutingMatrix />}
        {activeTab === "monitor" && <MonitorLog />}
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
