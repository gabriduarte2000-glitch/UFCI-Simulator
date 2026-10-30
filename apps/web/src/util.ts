import type { ProjectIR } from "@ufci/engine";
import { Series } from "@ufci/engine";
import type { SignalMeta } from "@ufci/engine";

export const PALETTE = ["#4da3ff", "#ff9f40", "#4ade80", "#c084fc", "#f87171", "#facc15", "#22d3ee", "#f472b6"];

export function download(name: string, text: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (s: string) => s.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "projeto";

export function projectToFile(p: ProjectIR): string {
  return JSON.stringify(p, null, 2);
}

export function seriesToCsv(series: Series, signals: SignalMeta[], only?: number[]): string {
  const idx = only && only.length ? only : signals.map((_, i) => i);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [["t (s)", ...idx.map((i) => esc(signals[i].label + (signals[i].unit ? ` (${signals[i].unit})` : "")))].join(",")];
  const t = series.timeView();
  const cols = idx.map((i) => series.colView(i));
  for (let r = 0; r < t.length; r++) lines.push([t[r], ...cols.map((c) => c[r])].join(","));
  return lines.join("\n");
}

export const fmtNum = (v: number | undefined, digits = 4) => {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(2).replace(".", ",");
  return String(+v.toPrecision(digits)).replace(".", ",");
};
