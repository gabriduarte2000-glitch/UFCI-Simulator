import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index";
import { SITUATIONS } from "../src/situations";

describe("situações de petroquímica", () => {
  for (const s of SITUATIONS.filter((x) => x.folder === "Petroquímica e refino")) {
    it(`${s.id} roda sem erro e com valores finitos`, () => {
      const sim = new Simulation(s.make());
      expect(sim.diagnostics.filter((d: any) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
      for (let j = 0; j < sim.signals.length; j++) {
        const c = sim.series.colView(j);
        expect(Number.isFinite(c[c.length - 1])).toBe(true);
      }
    });
  }
});

import { build } from "../src/examples";
describe("Arduino Uno", () => {
  const run = (sketch: string, a0 = 0) => {
    const ir = build("a", [
      { id: "a0", type: "signal.constant", params: { value: a0 }, pos: [0, 0] },
      { id: "u", type: "ic.arduino", params: { sketch }, pos: [100, 0] },
    ], [["a0", "out", "u", "A0"]], { tf: 12, rtol: 1e-6, atol: 1e-8 });
    const sim = new Simulation(ir);
    expect(sim.diagnostics.filter((d: any) => d.severity === "error")).toEqual([]);
    sim.runToEnd();
    const tv = sim.series.timeView();
    const val = (id: string, t: number) => { const j = sim.signals.findIndex((x: any) => x.id === id); let i = 0; while (i < tv.length - 1 && tv[i] < t) i++; return sim.series.colView(j)[i]; };
    return val;
  };
  it("pisca", () => { const v = run("blink"); expect(v("u.D13", 0.25)).toBe(1); expect(v("u.D13", 0.75)).toBe(0); });
  it("analógico", () => { const v = run("analog", 4); expect(v("u.D9", 5)).toBeCloseTo(4, 1); expect(v("u.D13", 5)).toBe(1); });
  it("termostato liga abaixo do limite", () => { const v = run("thermo", 1); expect(v("u.D12", 5)).toBe(1); });
  it("semáforo: verde no início, vermelho depois", () => { const v = run("traffic"); expect(v("u.D10", 1)).toBe(1); expect(v("u.D12", 9)).toBe(1); });
});
