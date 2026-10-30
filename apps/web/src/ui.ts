import { useSyncExternalStore } from "react";
import { create } from "zustand";

/** Telas estreitas (celular, tablet em pé): painéis viram folhas e a navegação vai para baixo. */
export const COMPACT_QUERY = "(max-width: 900px)";
export const isCompact = () => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches;
export function useCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(COMPACT_QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    isCompact,
    () => false,
  );
}

export type Page = "montagem" | "dashboard" | "graficos" | "tabelas" | "indicadores";
/** Como os sinais escolhidos se distribuem nos gráficos. */
export type ChartMode = "unit" | "each" | "all";
export type RightTab = "props" | "sim";

interface Ui {
  page: Page;
  leftOpen: boolean;
  rightOpen: boolean;
  rightTab: RightTab;
  showWireValues: boolean;
  snap: boolean;
  tool: "select" | "pan";
  chartSignal: number[];
  chartMode: ChartMode;
  setPage(p: Page): void;
  setLeftOpen(v: boolean): void;
  setRightOpen(v: boolean): void;
  openRight(tab: RightTab): void;
  setShowWireValues(v: boolean): void;
  setSnap(v: boolean): void;
  setTool(t: "select" | "pan"): void;
  setChartSignal(ids: number[]): void;
  setChartMode(m: ChartMode): void;
}

export const useUi = create<Ui>((set) => ({
  page: "montagem",
  leftOpen: !isCompact(),
  rightOpen: false,
  rightTab: "props",
  showWireValues: true,
  snap: true,
  tool: "select",
  chartSignal: [],
  chartMode: "unit",
  setPage: (page) => set({ page }),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  openRight: (rightTab) => set({ rightOpen: true, rightTab }),
  setShowWireValues: (v) => set({ showWireValues: v }),
  setSnap: (v) => set({ snap: v }),
  setTool: (t) => set({ tool: t }),
  setChartSignal: (ids) => set({ chartSignal: ids }),
  setChartMode: (chartMode) => set({ chartMode }),
}));
