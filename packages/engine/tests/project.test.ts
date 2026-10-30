import { describe, expect, it } from "vitest";
import { EXAMPLES, emptyProject, parseProject, Simulation, stepMetrics } from "../src";

describe("exemplos", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.title} compila, simula até o fim e sem avisos de erro`, () => {
      const sim = new Simulation(ex.make());
      expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
      expect(sim.status).toBe("finished");
      expect(sim.series.n).toBeGreaterThan(50);
    });
  }

  it("PID do exemplo estabiliza em 1 sem erro em regime", () => {
    const sim = new Simulation(EXAMPLES[1].make());
    sim.runToEnd();
    const j = sim.signals.findIndex((s) => s.id === "planta.out");
    const m = stepMetrics(sim.series.timeView(), sim.series.colView(j), 1)!;
    expect(m.final).toBeCloseTo(1, 3);
    expect(m.overshootPct).toBeLessThan(15);
  });
});

describe("arquivo do projeto", () => {
  it("ida e volta em JSON preserva o projeto", () => {
    const p = EXAMPLES[1].make();
    const r = parseProject(JSON.parse(JSON.stringify(p)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.components.length).toBe(p.components.length);
  });

  it("recusa arquivos que não são projetos, com mensagem em português", () => {
    for (const bad of [null, 3, [], {}, { schemaVersion: "1.0.0" }, { schemaVersion: "9.0.0", meta: { name: "x" }, components: [], connections: [] }]) {
      const r = parseProject(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it("projeto vazio é válido para o formato e recusado pelo compilador com aviso didático", () => {
    expect(parseProject(emptyProject()).ok).toBe(true);
    const sim = new Simulation(emptyProject());
    expect(sim.status).toBe("error");
    expect(sim.diagnostics[0].code).toBe("empty");
  });
});

describe("métricas", () => {
  it("1ª ordem: tempo de subida de 10-90% = 2,197 constantes de tempo", () => {
    const p = EXAMPLES[0].make();
    p.simulation.tf = 30; // longo o bastante para o valor final ser o de regime
    const sim = new Simulation(p);
    sim.runToEnd();
    const j = sim.signals.findIndex((s) => s.id === "g.out");
    const m = stepMetrics(sim.series.timeView(), sim.series.colView(j), 0)!;
    expect(m.riseTime).toBeCloseTo(Math.log(9), 2);
    expect(m.overshootPct).toBeLessThan(1e-6);
  });
});
