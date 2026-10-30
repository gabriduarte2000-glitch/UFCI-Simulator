import { describe, expect, it } from "vitest";
import { SITUATIONS, Simulation } from "../src";
import { at, mk } from "./helpers";

const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  expect(sim.status).toBe("finished");
  return sim;
};
const RHOCP = 4.186e6;

describe("tanque", () => {
  it("sem saída, o nível sobe linear e para na altura total (transborda)", () => {
    const sim = run(
      mk(
        [
          { id: "q", type: "signal.constant", params: { value: 60 } },
          { id: "t", type: "process.tank", params: { A: 0.1, hmax: 1.5, kout: 0, h0: 0.5 } },
        ],
        [["q", "out", "t", "qin"]],
        { tf: 200 },
      ),
    );
    // 60 L/min = 0,001 m³/s; A = 0,1 m² → 0,01 m/s
    expect(at(sim, "t.h", 50)).toBeCloseTo(0.5 + 0.01 * 50, 4);
    expect(at(sim, "t.h", 200)).toBeCloseTo(1.5, 6);
    expect(at(sim, "t.pct", 200)).toBeCloseTo(100, 4);
  });

  it("com saída por gravidade, o nível de equilíbrio é (q/k)²", () => {
    const sim = run(
      mk(
        [
          { id: "q", type: "signal.constant", params: { value: 30 } },
          { id: "t", type: "process.tank", params: { A: 0.05, hmax: 3, kout: 40, h0: 0 } },
        ],
        [["q", "out", "t", "qin"]],
        { tf: 1500, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    expect(at(sim, "t.h", 1500)).toBeCloseTo((30 / 40) ** 2, 3);
    expect(at(sim, "t.qout", 1500)).toBeCloseTo(30, 2);
  });

  it("o nível não fica negativo quando só há saída", () => {
    const sim = run(
      mk(
        [
          { id: "q", type: "signal.constant", params: { value: 0 } },
          { id: "e", type: "signal.constant", params: { value: 50 } },
          { id: "t", type: "process.tank", params: { A: 0.05, hmax: 1, kout: 0, h0: 0.2 } },
        ],
        [
          ["q", "out", "t", "qin"],
          ["e", "out", "t", "qext"],
        ],
        { tf: 100 },
      ),
    );
    const j = sim.signals.findIndex((s) => s.id === "t.h");
    expect(Math.min(...sim.series.colView(j))).toBeGreaterThanOrEqual(0);
    expect(at(sim, "t.h", 100)).toBeCloseTo(0, 9);
  });
});

describe("atuadores", () => {
  it("válvula linear responde como 1ª ordem ao comando de 100%", () => {
    const sim = run(
      mk(
        [
          { id: "c", type: "signal.constant", params: { value: 100 } },
          { id: "v", type: "process.valve", params: { max: 120, tau: 4, p0: 0 } },
        ],
        [["c", "out", "v", "cmd"]],
        { tf: 20, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    for (const t of [2, 4, 8]) expect(at(sim, "v.out", t)).toBeCloseTo(120 * (1 - Math.exp(-t / 4)), 3);
  });

  it("válvula igual porcentagem vale 0 fechada e Qmax aberta, e fica abaixo da linear no meio", () => {
    const at50 = (ch: string) => {
      const sim = run(
        mk(
          [
            { id: "c", type: "signal.constant", params: { value: 50 } },
            { id: "v", type: "process.valve", params: { max: 100, tau: 0.01, p0: 50, char: ch } },
          ],
          [["c", "out", "v", "cmd"]],
          { tf: 1 },
        ),
      );
      return at(sim, "v.out", 0.5);
    };
    expect(at50("linear")).toBeCloseTo(50, 3);
    expect(at50("eqpct")).toBeCloseTo(100 * ((50 ** 0.5 - 1) / 49), 3);
    expect(at50("eqpct")).toBeLessThan(25);
  });

  it("comando fora de 0..100 é limitado", () => {
    const sim = run(
      mk(
        [
          { id: "c", type: "signal.constant", params: { value: 500 } },
          { id: "p", type: "process.pump", params: { max: 150, tau: 0.1, p0: 0 } },
        ],
        [["c", "out", "p", "cmd"]],
        { tf: 5 },
      ),
    );
    expect(at(sim, "p.out", 5)).toBeCloseTo(150, 3);
  });
});

describe("tanque aquecido", () => {
  it("regime permanente: T = (F·ρcp·Tin + P + UA·Tamb)/(F·ρcp + UA)", () => {
    const F = 3,
      P = 5,
      Tin = 18,
      UA = 15,
      Tamb = 22;
    const sim = run(
      mk(
        [
          { id: "f", type: "signal.constant", params: { value: F } },
          { id: "ti", type: "signal.constant", params: { value: Tin } },
          { id: "p", type: "signal.constant", params: { value: P } },
          { id: "t", type: "process.heated_tank", params: { V: 0.01, UA, Tamb, T0: 25 } },
        ],
        [
          ["f", "out", "t", "F"],
          ["ti", "out", "t", "Tin"],
          ["p", "out", "t", "P"],
        ],
        { tf: 3000, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    const fm = (F / 60000) * RHOCP;
    expect(at(sim, "t.T", 3000)).toBeCloseTo((fm * Tin + P * 1000 + UA * Tamb) / (fm + UA), 3);
  });

  it("sem vazão nem perdas, a temperatura sobe P/(ρ·cp·V) por segundo", () => {
    const sim = run(
      mk(
        [
          { id: "f", type: "signal.constant", params: { value: 0 } },
          { id: "ti", type: "signal.constant", params: { value: 20 } },
          { id: "p", type: "signal.constant", params: { value: 2 } },
          { id: "t", type: "process.heated_tank", params: { V: 0.02, UA: 0, Tamb: 20, T0: 25 } },
        ],
        [
          ["f", "out", "t", "F"],
          ["ti", "out", "t", "Tin"],
          ["p", "out", "t", "P"],
        ],
        { tf: 100 },
      ),
    );
    expect(at(sim, "t.T", 100)).toBeCloseTo(25 + (2000 / (RHOCP * 0.02)) * 100, 4);
  });
});

describe("caldeira", () => {
  const boiler = (P: number, feed: number) =>
    run(
      mk(
        [
          { id: "f", type: "signal.constant", params: { value: feed } },
          { id: "p", type: "signal.constant", params: { value: P } },
          { id: "b", type: "process.boiler", params: { A: 0.1, hmax: 0.6, Tf: 20, UA: 30, Tamb: 20, h0: 0.3, T0: 25 } },
        ],
        [
          ["f", "out", "b", "feed"],
          ["p", "out", "b", "P"],
        ],
        { tf: 600, rtol: 1e-8, atol: 1e-10 },
      ),
    );

  it("aquece até 100 °C e para ali enquanto ferve", () => {
    const sim = boiler(100, 0);
    const j = sim.signals.findIndex((s) => s.id === "b.T");
    expect(Math.max(...sim.series.colView(j))).toBeLessThanOrEqual(100.0001);
    expect(at(sim, "b.T", 600)).toBeGreaterThan(99.9);
  });

  it("balanço de energia: vapor = energia excedente / calor latente, e o nível desce pela massa evaporada", () => {
    const sim = boiler(100, 0);
    const expected = ((100e3 - 30 * (100 - 20)) / 2.257e6) * 60; // kg/min, sem alimentação
    expect(at(sim, "b.steam", 600)).toBeCloseTo(expected, 1);
    // massa evaporada entre dois instantes com T = 100 °C
    const dm = ((at(sim, "b.h", 300) - at(sim, "b.h", 500)) * 1000 * 0.1);
    expect(dm / 200).toBeCloseTo(expected / 60, 2);
  });

  it("com alimentação certa, o nível fica constante", () => {
    // vapor de regime com alimentação f: (P − UA·ΔT − ṁ·cp·(100−Tf))/hfg = ṁ  →  resolve ṁ
    const P = 100e3,
      UA = 30,
      cp = 4186,
      hfg = 2.257e6;
    const mdot = (P - UA * 80) / (hfg + cp * 80);
    const sim = boiler(100, mdot * 60);
    expect(at(sim, "b.h", 600)).toBeCloseTo(at(sim, "b.h", 500), 4);
  });
});

describe("outros blocos", () => {
  it("tempo morto de Padé: um sinal lento sai atrasado de T", () => {
    const T = 10;
    const sim = run(
      mk(
        [
          { id: "u", type: "signal.sine", params: { amp: 1, freq: 0.01 } },
          { id: "d", type: "control.deadtime", params: { T, n: 4, y0: 0 } },
        ],
        [["u", "out", "d", "in"]],
        { tf: 300, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    for (const t of [120, 180, 250]) expect(at(sim, "d.out", t)).toBeCloseTo(Math.sin(2 * Math.PI * 0.01 * (t - T)), 2);
  });

  it("tempo morto de Padé: degrau leva o atraso para o valor certo, com resposta inversa inicial conhecida", () => {
    const sim = run(
      mk(
        [
          { id: "u", type: "signal.step", params: { t_step: 0, v1: 1 } },
          { id: "d", type: "control.deadtime", params: { T: 10, n: 3, y0: 0 } },
        ],
        [["u", "out", "d", "in"]],
        { tf: 60, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    expect(at(sim, "d.out", 0)).toBeCloseTo(-1, 6); // H(∞) = (−1)ⁿ
    expect(at(sim, "d.out", 40)).toBeCloseTo(1, 2);
  });

  it("tempo morto com valor inicial não gera salto antes da chegada", () => {
    const sim = run(
      mk(
        [
          { id: "u", type: "signal.constant", params: { value: 25 } },
          { id: "d", type: "control.deadtime", params: { T: 5, n: 3, y0: 25 } },
        ],
        [["u", "out", "d", "in"]],
        { tf: 30 },
      ),
    );
    const j = sim.signals.findIndex((s) => s.id === "d.out");
    for (const v of sim.series.colView(j)) expect(v).toBeCloseTo(25, 6);
  });

  it("atraso de 1ª ordem começa na saída inicial", () => {
    const sim = run(
      mk(
        [
          { id: "u", type: "signal.constant", params: { value: 10 } },
          { id: "l", type: "control.lag", params: { K: 2, tau: 3, y0: 4 } },
        ],
        [["u", "out", "l", "in"]],
        { tf: 30, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    expect(at(sim, "l.out", 0)).toBeCloseTo(4, 9);
    expect(at(sim, "l.out", 6)).toBeCloseTo(20 + (4 - 20) * Math.exp(-2), 4);
  });

  it("produto, divisão, raiz e valor absoluto", () => {
    const sim = run(
      mk(
        [
          { id: "a", type: "signal.constant", params: { value: 6 } },
          { id: "b", type: "signal.constant", params: { value: 4 } },
          { id: "n", type: "signal.constant", params: { value: -9 } },
          { id: "m", type: "math.product", params: { ops: "*/" } },
          { id: "r", type: "math.sqrt" },
          { id: "s", type: "math.abs" },
          { id: "c16", type: "signal.constant", params: { value: 16 } },
        ],
        [
          ["a", "out", "m", "in1"],
          ["b", "out", "m", "in2"],
          ["c16", "out", "r", "in"],
          ["n", "out", "s", "in"],
        ],
        { tf: 1 },
      ),
    );
    expect(at(sim, "m.out", 1)).toBeCloseTo(1.5, 12);
    expect(at(sim, "r.out", 1)).toBe(4);
    expect(at(sim, "s.out", 1)).toBe(9);
  });

  it("integrador limitado não acumula além dos limites e sai deles sem atraso", () => {
    const p = mk(
      [
        { id: "u", type: "signal.sine", params: { amp: 1, freq: 0.2 } },
        { id: "k", type: "math.gain", params: { K: 5 } },
        { id: "i", type: "nonlinear.integrator_lim", params: { lo: -1, hi: 1, x0: 0 } },
      ],
      [
        ["u", "out", "k", "in"],
        ["k", "out", "i", "in"],
      ],
      { tf: 20 },
    );
    const sim = run(p);
    const j = sim.signals.findIndex((s) => s.id === "i.out");
    const y = sim.series.colView(j);
    expect(Math.max(...y)).toBeLessThanOrEqual(1);
    expect(Math.min(...y)).toBeGreaterThanOrEqual(-1);
    // com a entrada senoidal longa, passa tempo saturado e volta a variar
    expect(y.some((v) => v === 1)).toBe(true);
    expect(y.some((v) => v < 0.5)).toBe(true);
  });

  it("estoque, fila e caixa", () => {
    const sim = run(
      mk(
        [
          { id: "e", type: "signal.constant", params: { value: 10 } },
          { id: "s", type: "signal.constant", params: { value: 30 } },
          { id: "est", type: "business.stock", params: { max: 100, x0: 50 } },
          { id: "cx", type: "business.cash", params: { x0: 1000 } },
        ],
        [
          ["e", "out", "est", "in"],
          ["s", "out", "est", "out"],
          ["e", "out", "cx", "in"],
          ["s", "out", "cx", "out"],
        ],
        { tf: 10 },
      ),
    );
    expect(at(sim, "est.level", 1)).toBeCloseTo(30, 6); // 50 − 20·1
    expect(at(sim, "est.level", 10)).toBe(0); // zerou em t = 2,5 e fica em zero
    expect(at(sim, "cx.level", 10)).toBeCloseTo(1000 - 200, 6); // pode ficar abaixo do inicial, sem piso
  });

  it("anotação não participa da simulação nem gera erro", () => {
    const sim = run(
      mk(
        [
          { id: "c", type: "signal.constant" },
          { id: "n", type: "note.text", params: { text: "oi" } },
        ],
        [],
        { tf: 1 },
      ),
    );
    expect(sim.signals.length).toBe(1);
  });
});

describe("situações prontas", () => {
  const checks: Record<string, (s: Simulation) => void> = {
    "tank-level": (s) => expect(at(s, "tank.h", 900)).toBeCloseTo(1, 1),
    "tank-temperature": (s) => expect(at(s, "tank.T", 1800)).toBeCloseTo(60, 1),
    boiler: (s) => {
      expect(at(s, "boiler.h", 1200)).toBeGreaterThan(0.26);
      expect(at(s, "boiler.h", 1200)).toBeLessThan(0.34);
      expect(at(s, "boiler.T", 1200)).toBeGreaterThan(99.5);
      expect(at(s, "boiler.steam", 1200)).toBeGreaterThan(1.5);
    },
    "two-tanks": (s) => expect(at(s, "t2.h", 2400)).toBeCloseTo(0.6, 1),
    "pump-flow": (s) => expect(at(s, "net.out", 150)).toBeCloseTo(80, 1),
    inventory: (s) => expect(Math.abs(at(s, "stock.level", 200) - 500)).toBeLessThan(1),
    queue: (s) => expect(at(s, "q.level", 300)).toBeCloseTo(5, 1),
  };
  for (const st of SITUATIONS) {
    it(`${st.title} compila, termina e chega ao regime esperado`, () => {
      const sim = new Simulation(st.make());
      expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
      expect(sim.status).toBe("finished");
      checks[st.id]?.(sim);
    });
  }

  it("as situações reagem à perturbação (consumo, vazamento, vazão)", () => {
    // nível: abrir o consumo derruba o nível e o PI recupera
    const p = SITUATIONS.find((x) => x.id === "tank-level")!.make();
    const sim = new Simulation(p);
    sim.advanceTo(400);
    const h0 = at(sim, "tank.h", 399);
    sim.setParam("dem", "value", 30);
    sim.advanceTo(430);
    expect(at(sim, "tank.h", 430)).toBeLessThan(h0 - 0.01);
    sim.runToEnd();
    expect(at(sim, "tank.h", 900)).toBeCloseTo(1, 1);
    expect(sim.events.some((e) => e.key === "value" && e.to === 30)).toBe(true);
  });
});
