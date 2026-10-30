import { lazy, Suspense } from "react";
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
const MathPage = lazy(() => import("./pages/MathPage"));
import { BottomNav } from "./components/BottomNav";
import { useCompact, useUi } from "./ui";
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
  const rightOpen = useUi((s) => s.rightOpen);
  const setLeftOpen = useUi((s) => s.setLeftOpen);
  const setRightOpen = useUi((s) => s.setRightOpen);
  const compact = useCompact();
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        {/* A montagem fica sempre montada (só escondida) para manter o zoom e a posição da vista. */}
        <div className="main" hidden={page !== "montagem"}>
          {compact ? (
            <>
              <div className="center">
                <Canvas />
              </div>
              {(leftOpen || rightOpen) && (
                <div
                  className="sheet-scrim"
                  onClick={() => {
                    setLeftOpen(false);
                    setRightOpen(false);
                  }}
                />
              )}
              {leftOpen && <Library />}
              <RightDrawer />
            </>
          ) : (
            <>
              {leftOpen ? <Library /> : <LeftRail />}
              <div className="center">
                <Canvas />
              </div>
              <RightDrawer />
            </>
          )}
        </div>
        {page === "dashboard" && <DashboardPage />}
        {page === "graficos" && <GraficosPage />}
        {page === "tabelas" && <TabelasPage />}
        {page === "indicadores" && <IndicadoresPage />}
        {page === "math" && (
          <Suspense fallback={<div className="page-empty"><p>Carregando…</p></div>}>
            <MathPage />
          </Suspense>
        )}
        <StatusBar />
        <BottomNav />
      </div>
    </ReactFlowProvider>
  );
}
