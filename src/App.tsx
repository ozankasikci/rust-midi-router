import { useState } from "react";
import { RoutingMatrix } from "./components/RoutingMatrix";
import { MonitorLog } from "./components/MonitorLog";
import { PresetBar } from "./components/PresetBar";
import { ClockControl } from "./components/ClockControl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "matrix" | "monitor";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-medium">MIDI Router</h1>
        <PresetBar />
        <ClockControl />
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
            <TabsTrigger value="monitor">Monitor</TabsTrigger>
          </TabsList>
        </div>

        <main className="min-h-0 flex-1 overflow-auto p-4">
          <div style={{ display: activeTab === "matrix" ? "block" : "none" }}>
            <RoutingMatrix />
          </div>
          <div style={{ display: activeTab === "monitor" ? "block" : "none" }}>
            <MonitorLog />
          </div>
        </main>
      </Tabs>
    </div>
  );
}

export default App;
