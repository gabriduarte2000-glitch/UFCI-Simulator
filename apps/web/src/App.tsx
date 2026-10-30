import { ReactFlowProvider } from "@xyflow/react";
import { TopBar } from "./components/TopBar";
import { Library } from "./components/Library";
import { Canvas } from "./components/Canvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { BottomPanel } from "./components/BottomPanel";
import { SimControls } from "./components/SimControls";
import { StatusBar } from "./components/StatusBar";
import "./live";
import "./diagnostics";

export function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <div className="main">
          <Library />
          <div className="center">
            <Canvas />
            <BottomPanel />
          </div>
          <div className="right">
            <PropertiesPanel />
            <SimControls />
          </div>
        </div>
        <StatusBar />
      </div>
    </ReactFlowProvider>
  );
}
