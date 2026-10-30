import { ReactFlowProvider } from "@xyflow/react";
import { TopBar } from "./components/TopBar";
import { Library } from "./components/Library";
import { Canvas } from "./components/Canvas";
import { RightDrawer } from "./components/RightDrawer";
import { StatusBar } from "./components/StatusBar";
import { Icon } from "./components/Icon";
import { DashboardPage } from "./pages/DashboardPage";
import { GraficosPage } from "./pages/GraficosPage";
import { TabelasPage } from "./pages/TabelasPage";
import { IndicadoresPage } from "./pages/IndicadoresPage";
import { useUi } from "./ui";
import "./live";
import "./diagnostics";

function LeftRail() {
  const setOpen = useUi((s) => s.setLeftOpen);
  return (
    <div className="rail left-rail">
      <button className="rail-btn" onClick={() => setOpen(true)} title="Abrir a biblioteca de componentes" aria-label="Abrir a biblioteca">
        <Icon name="book" size={18} />
      </button>
      <span className="rail-label">Biblioteca</span>
    </div>
  );
}

export function App() {
  const page = useUi((s) => s.page);
  const leftOpen = useUi((s) => s.leftOpen);
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        {/* A montagem fica sempre montada (só escondida) para manter o zoom e a posição da vista. */}
        <div className="main" hidden={page !== "montagem"}>
          {leftOpen ? <Library /> : <LeftRail />}
          <div className="center">
            <Canvas />
          </div>
          <RightDrawer />
        </div>
        {page === "dashboard" && <DashboardPage />}
        {page === "graficos" && <GraficosPage />}
        {page === "tabelas" && <TabelasPage />}
        {page === "indicadores" && <IndicadoresPage />}
        <StatusBar />
      </div>
    </ReactFlowProvider>
  );
}
