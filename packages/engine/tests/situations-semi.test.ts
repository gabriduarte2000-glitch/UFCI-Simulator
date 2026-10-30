import { describe, expect, it } from "vitest";
import { Simulation } from "../src";
import { SITUATIONS } from "../src/situations";

const ids = ["rectifier", "zener", "ce-amp", "mosfet-led", "inv-amp", "timer555", "counter-disp", "full-adder", "sr-latch", "dac-stair", "thermostat"];

describe("situações de semicondutores e digital", () => {
  for (const id of ids) {
    it(`${id} compila e roda até o fim`, () => {
      const s = SITUATIONS.find((x) => x.id === id)!;
      expect(s).toBeTruthy();
      const sim = new Simulation(s.make());
      expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
      expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(sim.status).toBe("finished");
    });
  }
});

import { sigIndex } from "./helpers";
const col = (sim: Simulation, id: string) => {
  const j = sigIndex(sim, id);
  return { t: sim.series.timeView(), y: sim.series.colView(j) };
};
const runSit = (id: string) => {
  const sim = new Simulation(SITUATIONS.find((x) => x.id === id)!.make());
  sim.runToEnd();
  return sim;
};
describe("comportamento das situações", () => {
  it("termostato mantém a temperatura na faixa", () => {
    const { t, y } = col(runSit("thermostat"), "tank.T");
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < t.length; i++) if (t[i] > 3600) (lo = Math.min(lo, y[i])), (hi = Math.max(hi, y[i]));
    expect(lo).toBeGreaterThan(56.5);
    expect(hi).toBeLessThan(63.5);
  });
  it("latch SR guarda o bit", () => {
    const { t, y } = col(runSit("sr-latch"), "n1.y");
    const at = (x: number) => { let v = y[0]; for (let i = 0; i < t.length && t[i] <= x; i++) v = y[i]; return v; };
    expect(at(2)).toBe(0);
    expect(at(5)).toBe(1);
    expect(at(10)).toBe(0);
  });
  it("somador 1+1+0", () => {
    const sim = runSit("full-adder");
    const s = col(sim, "x2.y"), c = col(sim, "o1.y");
    expect(s.y[s.y.length - 1]).toBe(0);
    expect(c.y[c.y.length - 1]).toBe(1);
  });
  it("555 oscila", () => {
    const { t, y } = col(runSit("timer555"), "t.out");
    let n = 0;
    for (let i = 1; i < t.length; i++) if (y[i - 1] < 0.5 && y[i] >= 0.5) n++;
    expect(n).toBeGreaterThanOrEqual(3);
  });
  it("DAC faz escada até perto de 5 V", () => {
    const { y } = col(runSit("dac-stair"), "dac.y");
    expect(Math.max(...y)).toBeGreaterThan(4.5);
  });
});
