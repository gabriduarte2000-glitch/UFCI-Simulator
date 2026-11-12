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
