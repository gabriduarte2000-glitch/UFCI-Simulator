import { emptyProject, newComponent, Simulation, type ProjectIR } from "../src";

export function mk(
  comps: { id: string; type: string; params?: Record<string, number | string | boolean> }[],
  conns: [string, string, string, string][],
  sim: Partial<ProjectIR["simulation"]> = {},
): ProjectIR {
  const p = emptyProject("teste");
  for (const c of comps) {
    const inst = newComponent(c.type, c.id);
    for (const [k, v] of Object.entries(c.params ?? {})) inst.params[k] = { ...inst.params[k], value: v };
    p.components.push(inst);
  }
  conns.forEach(([a, ap, b, bp], i) => p.connections.push({ id: `w${i}`, from: { component: a, port: ap }, to: { component: b, port: bp } }));
  p.simulation = { ...p.simulation, ...sim };
  return p;
}

export function sigIndex(sim: Simulation, id: string): number {
  const i = sim.signals.findIndex((s) => s.id === id);
  if (i < 0) throw new Error("sinal inexistente: " + id);
  return i;
}

/** Valor do sinal em t por interpolação cúbica de Lagrange (linear perto de saltos). */
export function at(sim: Simulation, id: string, t: number): number {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  const n = ts.length;
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= t) lo = m;
    else hi = m;
  }
  if (ts[hi] === t) {
    let k = hi;
    while (k + 1 < n && ts[k + 1] === t) k++;
    return ys[k];
  }
  const a = ts[lo],
    b = ts[hi];
  const idx = [lo - 1, lo, hi, hi + 1];
  const ok = idx.every((k) => k >= 0 && k < n) && new Set(idx.map((k) => ts[k])).size === 4;
  if (!ok) return b === a ? ys[hi] : ys[lo] + ((t - a) / (b - a)) * (ys[hi] - ys[lo]);
  let acc = 0;
  for (const k of idx) {
    let w = 1;
    for (const m of idx) if (m !== k) w *= (t - ts[m]) / (ts[k] - ts[m]);
    acc += w * ys[k];
  }
  return acc;
}
