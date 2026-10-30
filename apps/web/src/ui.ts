import { create } from "zustand";

export type BottomTab = "dashboard" | "graficos" | "tabelas" | "indicadores";

interface Ui {
  showWireValues: boolean;
  snap: boolean;
  tool: "select" | "pan";
  bottomTab: BottomTab;
  bottomOpen: boolean;
  chartSignal: number[];
  setShowWireValues(v: boolean): void;
  setSnap(v: boolean): void;
  setTool(t: "select" | "pan"): void;
  setBottomTab(t: BottomTab): void;
  setBottomOpen(v: boolean): void;
  setChartSignal(ids: number[]): void;
}

export const useUi = create<Ui>((set) => ({
  showWireValues: true,
  snap: true,
  tool: "select",
  bottomTab: "dashboard",
  bottomOpen: true,
  chartSignal: [],
  setShowWireValues: (v) => set({ showWireValues: v }),
  setSnap: (v) => set({ snap: v }),
  setTool: (t) => set({ tool: t }),
  setBottomTab: (t) => set({ bottomTab: t }),
  setBottomOpen: (v) => set({ bottomOpen: v }),
  setChartSignal: (ids) => set({ chartSignal: ids }),
}));
