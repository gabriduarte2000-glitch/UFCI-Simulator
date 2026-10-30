import { describe, expect, it } from "vitest";
import { compile, Simulation, stepMetrics } from "../src";
import { at, mk } from "./helpers";
import ref from "./data/pid_loop.json";

const firstOrder = (extra = {}) =>
  mk(
    [
      { id: "u", type: "signal.step", params: { t_step: 0, v1: 1 } },
      { id: "g", type: "control.tf", params: { num: "1", den: "1 1" } },
    ],
    [["u", "out", "g", "in"]],
    { tf: 6, ...extra },
  );

describe("sistemas lineares com solução analítica", () => {
  it("1ª ordem com RK45 acompanha 1 − e^(−t)", () => {
    const sim = new Simulation(firstOrder({ solver: "rk45", rtol: 1e-8, atol: 1e-10 }));
    expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    sim.runToEnd();
    expect(sim.status).toBe("finished");
    for (const t of [0.5, 1, 2, 3, 5, 6]) expect(Math.abs(at(sim, "g.out", t) - (1 - Math.exp(-t)))).toBeLessThan(1e-6);
  });

  it("2ª ordem subamortecida: ultrapassagem e tempo de pico teóricos", () => {
    const zeta = 0.2;
    const p = mk(
      [
        { id: "u", type: "signal.step", params: { t_step: 0, v1: 1 } },
        { id: "g", type: "control.tf", params: { num: "1", den: `1 ${2 * zeta} 1` } },
      ],
      [["u", "out", "g", "in"]],
      { tf: 40, rtol: 1e-8, atol: 1e-10 },
    );
    const sim = new Simulation(p);
    sim.runToEnd();
    const m = stepMetrics(sim.series.timeView(), sim.series.colView(sim.signals.findIndex((s) => s.id === "g.out")), 0)!;
    const mp = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)) * 100;
    expect(m.overshootPct).toBeCloseTo(mp, 1);
    expect(m.peakTime).toBeCloseTo(Math.PI / Math.sqrt(1 - zeta * zeta), 1);
    expect(m.final).toBeCloseTo(1, 3);
  });

  it("RK4 tem ordem 4: reduzir o passo pela metade divide o erro por cerca de 16", () => {
    const err = (h: number) => {
      const sim = new Simulation(firstOrder({ solver: "rk4", h }));
      sim.runToEnd();
      return Math.abs(at(sim, "g.out", 6) - (1 - Math.exp(-6)));
    };
    const e1 = err(0.4),
      e2 = err(0.2);
    expect(e1 / e2).toBeGreaterThan(13);
    expect(e1 / e2).toBeLessThan(19);
  });

  it("Euler tem ordem 1", () => {
    const err = (h: number) => {
      const sim = new Simulation(firstOrder({ solver: "euler", h }));
      sim.runToEnd();
      return Math.abs(at(sim, "g.out", 6) - (1 - Math.exp(-6)));
    };
    const ratio = err(0.02) / err(0.01);
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.3);
  });
});

describe("descontinuidades", () => {
  it("integrador de degrau em instante fora da grade dá rampa exata", () => {
    const ts = 1.234567;
    const p = mk(
      [
        { id: "u", type: "signal.step", params: { t_step: ts, v1: 1 } },
        { id: "i", type: "math.integrator" },
      ],
      [["u", "out", "i", "in"]],
      { solver: "rk4", h: 0.1, tf: 3 },
    );
    const sim = new Simulation(p);
    sim.runToEnd();
    expect(at(sim, "i.out", 3)).toBeCloseTo(3 - ts, 10);
    expect(at(sim, "i.out", ts)).toBeCloseTo(0, 12);
  });

  it("registra os dois lados do salto no mesmo instante", () => {
    const sim = new Simulation(firstOrder());
    const p = mk([{ id: "u", type: "signal.step", params: { t_step: 2, v1: 1 } }], [], { tf: 4 });
    const s2 = new Simulation(p);
    s2.runToEnd();
    const t = s2.series.timeView();
    const j = s2.signals.findIndex((s) => s.id === "u.out");
    const y = s2.series.colView(j);
    const k = Array.from(t).findIndex((v, i) => v === 2 && t[i + 1] === 2);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(y[k]).toBe(0);
    expect(y[k + 1]).toBe(1);
    expect(sim.status).toBe("idle");
  });
});

describe("diagnósticos", () => {
  it("detecta laço algébrico e explica", () => {
    const p = mk(
      [
        { id: "s", type: "math.sum", params: { signs: "++" } },
        { id: "g", type: "math.gain", params: { K: 2 } },
        { id: "c", type: "signal.constant" },
      ],
      [
        ["c", "out", "s", "in1"],
        ["s", "out", "g", "in"],
        ["g", "out", "s", "in2"],
      ],
    );
    const r = compile(p);
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "algebraic-loop")!;
    expect(d.message).toContain("integrador");
  });

  it("laço com integrador é aceito", () => {
    const p = mk(
      [
        { id: "c", type: "signal.constant" },
        { id: "s", type: "math.sum", params: { signs: "+-" } },
        { id: "i", type: "math.integrator" },
      ],
      [
        ["c", "out", "s", "in1"],
        ["s", "out", "i", "in"],
        ["i", "out", "s", "in2"],
      ],
      { tf: 5 },
    );
    expect(compile(p).ok).toBe(true);
  });

  it("entrada sem fio e entrada com dois fios geram erro claro", () => {
    const a = compile(mk([{ id: "g", type: "math.gain" }], []));
    expect(a.diagnostics.some((d) => d.code === "no-input")).toBe(true);
    const b = compile(
      mk(
        [
          { id: "c1", type: "signal.constant" },
          { id: "c2", type: "signal.constant" },
          { id: "g", type: "math.gain" },
        ],
        [
          ["c1", "out", "g", "in"],
          ["c2", "out", "g", "in"],
        ],
      ),
    );
    expect(b.diagnostics.some((d) => d.code === "multi-driver")).toBe(true);
  });

  it("parâmetro inválido é recusado", () => {
    const r = compile(mk([{ id: "g", type: "control.tf", params: { den: "0 0" } }, { id: "c", type: "signal.constant" }], [["c", "out", "g", "in"]]));
    expect(r.ok).toBe(false);
  });
});

describe("PID em malha fechada contra SciPy", () => {
  const build = (solver: "rk45" | "rk4", extra = {}) =>
    mk(
      [
        { id: "ref", type: "signal.step", params: { t_step: ref.params.t_step, v1: 1 } },
        { id: "soma", type: "math.sum", params: { signs: "+-" } },
        { id: "pid", type: "control.pid", params: { Kp: ref.params.Kp, Ki: ref.params.Ki, Kd: ref.params.Kd, N: ref.params.N } },
        { id: "pl", type: "control.tf", params: { num: "1", den: "1 3 2" } },
      ],
      [
        ["ref", "out", "soma", "in1"],
        ["soma", "out", "pid", "in"],
        ["pid", "out", "pl", "in"],
        ["pl", "out", "soma", "in2"],
      ],
      { solver, tf: 10, h: 0.005, rtol: 1e-8, atol: 1e-10, ...extra },
    );

  it("RK45 coincide com DOP853 (diferença máxima abaixo de 1e-6)", () => {
    const sim = new Simulation(build("rk45"));
    expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    sim.runToEnd();
    let worst = 0;
    ref.t.forEach((t, i) => (worst = Math.max(worst, Math.abs(at(sim, "pl.out", t) - ref.y[i]))));
    expect(worst).toBeLessThan(1e-6);
  });

  it("RK4 com passo 5 ms coincide (abaixo de 1e-6)", () => {
    const sim = new Simulation(build("rk4"));
    sim.runToEnd();
    let worst = 0;
    ref.t.forEach((t, i) => (worst = Math.max(worst, Math.abs(at(sim, "pl.out", t) - ref.y[i]))));
    expect(worst).toBeLessThan(1e-6);
  });

  it("o resultado não depende do ritmo com que advanceTo é chamado", () => {
    const a = new Simulation(build("rk45"));
    a.runToEnd();
    const b = new Simulation(build("rk45"));
    for (let t = 0; t <= 10.0001; t += 0.037) b.advanceTo(t);
    expect(at(b, "pl.out", 10)).toBeCloseTo(at(a, "pl.out", 10), 12);
  });
});

describe("edição com a simulação rodando", () => {
  it("mudar o ganho mantém os estados e marca o instante", () => {
    const p = mk(
      [
        { id: "c", type: "signal.constant", params: { value: 1 } },
        { id: "s", type: "math.sum", params: { signs: "+-" } },
        { id: "k", type: "math.gain", params: { K: 1 } },
        { id: "g", type: "control.tf", params: { num: "1", den: "1 1" } },
      ],
      [
        ["c", "out", "s", "in1"],
        ["s", "out", "k", "in"],
        ["k", "out", "g", "in"],
        ["g", "out", "s", "in2"],
      ],
      { tf: 10, solver: "rk45", rtol: 1e-8, atol: 1e-10 },
    );
    const sim = new Simulation(p);
    sim.advanceTo(2);
    const before = Array.from(sim.x);
    const r = sim.setParam("k", "K", 10);
    expect(r.ok).toBe(true);
    expect(Array.from(sim.x)).toEqual(before);
    expect(sim.events.at(-1)).toMatchObject({ kind: "param", componentId: "k", key: "K", from: 1, to: 10 });
    sim.runToEnd();
    // Regime permanente de malha fechada com K = 10: 10/(1+10)
    expect(at(sim, "g.out", 10)).toBeCloseTo(10 / 11, 4);
  });

  it("mudança estrutural reinicia e registra o evento", () => {
    const p = mk(
      [
        { id: "a", type: "signal.constant" },
        { id: "b", type: "signal.constant" },
        { id: "s", type: "math.sum", params: { signs: "++" } },
      ],
      [
        ["a", "out", "s", "in1"],
        ["b", "out", "s", "in2"],
      ],
      { tf: 2 },
    );
    const sim = new Simulation(p);
    sim.advanceTo(1);
    const r = sim.setParam("s", "signs", "+-");
    expect(r.reset).toBe(true);
    expect(sim.t).toBe(0);
    expect(sim.events.at(-1)?.kind).toBe("reset");
  });

  it("condição inicial só vale ao reiniciar", () => {
    const p = mk([{ id: "c", type: "signal.constant", params: { value: 0 } }, { id: "i", type: "math.integrator", params: { x0: 0 } }], [["c", "out", "i", "in"]], { tf: 4 });
    const sim = new Simulation(p);
    sim.advanceTo(1);
    const r = sim.setParam("i", "x0", 5);
    expect(r.pending).toBe(true);
    expect(sim.x[0]).toBe(0);
    sim.reset();
    expect(sim.x[0]).toBe(5);
  });
});

describe("PID com limite", () => {
  it("anti-windup reduz o sobressinal após saturação longa", () => {
    const run = (Kaw: number) => {
      const p = mk(
        [
          { id: "ref", type: "signal.step", params: { t_step: 0, v1: 1 } },
          { id: "soma", type: "math.sum", params: { signs: "+-" } },
          { id: "pid", type: "control.pid", params: { Kp: 2, Ki: 5, Kd: 0, limit: true, umin: -1, umax: 1, Kaw } },
          { id: "pl", type: "control.tf", params: { num: "4", den: "1 1" } },
        ],
        [
          ["ref", "out", "soma", "in1"],
          ["soma", "out", "pid", "in"],
          ["pid", "out", "pl", "in"],
          ["pl", "out", "soma", "in2"],
        ],
        { tf: 30, rtol: 1e-8, atol: 1e-10 },
      );
      const sim = new Simulation(p);
      sim.runToEnd();
      const j = sim.signals.findIndex((s) => s.id === "pl.out");
      return Math.max(...sim.series.colView(j));
    };
    expect(run(20)).toBeLessThan(run(0));
  });
});
