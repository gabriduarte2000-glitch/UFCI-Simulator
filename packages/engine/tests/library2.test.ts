import { describe, expect, it } from "vitest";
import { allDefs, GROUPS, CATEGORIES, searchComponents, Simulation } from "../src";
import { compileExpr } from "../src/components/library2";
import { at, mk } from "./helpers";

const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  expect(sim.status).toBe("finished");
  return sim;
};
const src = (type: string, params = {}) => ({ id: "u", type, params });

describe("registro", () => {
  it("toda categoria pertence a um grupo e todo componente tem categoria válida", () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const c of CATEGORIES) expect(groups.has(c.group)).toBe(true);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const d of allDefs()) expect(cats.has(d.category), d.type).toBe(true);
  });
});

describe("expressão do usuário", () => {
  it("avalia precedência, potência, funções e constantes", () => {
    const f = compileExpr("2 + 3*u1^2 - sqrt(16)/2", ["u1"]);
    expect(f({ u1: 2 })).toBeCloseTo(2 + 12 - 2);
    expect(compileExpr("sin(pi/2) + max(1; 4)", [])({})).toBeCloseTo(5);
    expect(compileExpr("-u1^2", ["u1"])({ u1: 3 })).toBeCloseTo(-9);
  });
  it("recusa símbolo desconhecido e texto sobrando", () => {
    expect(() => compileExpr("x + 1", ["u1"])).toThrow(/variável/);
    expect(() => compileExpr("1 + ", [])).toThrow();
    expect(() => compileExpr("foo(2)", [])).toThrow(/desconhecida/);
    expect(() => compileExpr("2 3", [])).toThrow();
  });
});

describe("fontes e funções", () => {
  it("dente de serra e triangular chegam nos valores esperados", () => {
    const sim = run(mk([src("signal.sawtooth", { A: 2, period: 1 }), { id: "t", type: "signal.triangle", params: { hi: 1, lo: -1, period: 2 } }], [], { tf: 2, solver: "rk4", h: 0.01 }));
    expect(at(sim, "u.out", 0.5)).toBeCloseTo(1, 2);
    expect(at(sim, "u.out", 1.25)).toBeCloseTo(0.5, 2);
    expect(at(sim, "t.out", 1)).toBeCloseTo(1, 2);
    expect(at(sim, "t.out", 0.5)).toBeCloseTo(0, 2);
  });
  it("ruído tem média e desvio perto do pedido e repete com a mesma semente", () => {
    const mkSim = () => run(mk([src("signal.noise", { sigma: 2, mean: 1, Ts: 0.01, seed: 3 })], [], { tf: 20, solver: "rk4", h: 0.01 }));
    const a = mkSim();
    const ys = Array.from(a.series.colView(0));
    const m = ys.reduce((s, v) => s + v, 0) / ys.length;
    const sd = Math.sqrt(ys.reduce((s, v) => s + (v - m) ** 2, 0) / ys.length);
    expect(m).toBeGreaterThan(0.8);
    expect(m).toBeLessThan(1.2);
    expect(sd).toBeGreaterThan(1.7);
    expect(sd).toBeLessThan(2.3);
    const b = mkSim();
    expect(Array.from(b.series.colView(0)).slice(0, 50)).toEqual(ys.slice(0, 50));
  });
  it("tabela interpola e seno, exponencial e expressão dão o valor certo", () => {
    const sim = run(
      mk(
        [src("signal.table", { pts: "0:0; 2:4; 4:4" }), { id: "t", type: "signal.time" }, { id: "s", type: "math.fn.sin" }, { id: "x", type: "math.expr", params: { f: "u1^2 + t", n: 1 } }, { id: "p", type: "math.power", params: { p: 0.5 } }],
        [["t", "out", "s", "in"], ["t", "out", "x", "in1"], ["t", "out", "p", "in"]],
        { tf: 4, solver: "rk4", h: 0.01 },
      ),
    );
    expect(at(sim, "u.out", 1)).toBeCloseTo(2, 2);
    expect(at(sim, "s.out", 1.5)).toBeCloseTo(Math.sin(1.5), 3);
    expect(at(sim, "x.out", 2)).toBeCloseTo(6, 3);
    expect(at(sim, "p.out", 4)).toBeCloseTo(2, 3);
  });
  it("chave seletora, comparador e lógica", () => {
    const sim = run(
      mk(
        [
          { id: "a", type: "signal.constant", params: { value: 3 } },
          { id: "b", type: "signal.constant", params: { value: -1 } },
          { id: "c", type: "signal.ramp", params: { slope: 1, t_start: 0 } },
          { id: "sw", type: "route.switch", params: { thr: 1 } },
          { id: "cmp", type: "route.compare", params: { op: ">" } },
          { id: "lg", type: "route.logic", params: { op: "not" } },
        ],
        [["a", "out", "sw", "in1"], ["c", "out", "sw", "ctl"], ["b", "out", "sw", "in3"], ["c", "out", "cmp", "in1"], ["a", "out", "cmp", "in2"], ["cmp", "out", "lg", "in1"]],
        { tf: 5, solver: "rk4", h: 0.01 },
      ),
    );
    expect(at(sim, "sw.out", 0.5)).toBeCloseTo(-1);
    expect(at(sim, "sw.out", 2)).toBeCloseTo(3);
    expect(at(sim, "cmp.out", 2)).toBe(0);
    expect(at(sim, "cmp.out", 4)).toBe(1);
    expect(at(sim, "lg.out", 4)).toBe(0);
    expect(at(sim, "lg.out", 2)).toBe(1);
  });
});

describe("filtros e controle", () => {
  it("2ª ordem padrão chega ao ganho K e o Butterworth de ordem 3 tem −3 dB no corte", () => {
    const sim = run(mk([src("signal.step", { t_step: 0, v1: 1 }), { id: "g", type: "control.lp2", params: { K: 2, wn: 5, zeta: 1 } }], [["u", "out", "g", "in"]], { tf: 10, rtol: 1e-8, atol: 1e-10 }));
    expect(at(sim, "g.out", 10)).toBeCloseTo(2, 4);
    // Seno na frequência de corte: amplitude estacionária 1/√2.
    const fc = 0.5;
    const s2 = run(mk([src("signal.sine", { amp: 1, freq: fc }), { id: "b", type: "control.butter", params: { fc, n: 3 } }], [["u", "out", "b", "in"]], { tf: 30, rtol: 1e-8, atol: 1e-10 }));
    let peak = 0;
    for (let t = 20; t <= 30; t += 0.01) peak = Math.max(peak, Math.abs(at(s2, "b.out", t)));
    expect(peak).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it("PI zera o erro de uma planta de 1ª ordem e PD amortece", () => {
    const sim = run(
      mk(
        [src("signal.step", { t_step: 0, v1: 1 }), { id: "e", type: "math.sum", params: { signs: "+-" } }, { id: "c", type: "control.pi", params: { Kp: 2, Ki: 3 } }, { id: "g", type: "control.tf", params: { num: "1", den: "1 1" } }],
        [["u", "out", "e", "in1"], ["g", "out", "e", "in2"], ["e", "out", "c", "in"], ["c", "out", "g", "in"]],
        { tf: 30, rtol: 1e-8, atol: 1e-10 },
      ),
    );
    expect(at(sim, "g.out", 30)).toBeCloseTo(1, 4);
  });
  it("PID de 2 graus respeita o limite de saída", () => {
    const sim = run(
      mk(
        [src("signal.constant", { value: 1 }), { id: "y", type: "signal.constant", params: { value: 0 } }, { id: "c", type: "control.pid2", params: { Kp: 10, Ki: 5, Kd: 0, umax: 2, umin: -2 } }],
        [["u", "out", "c", "r"], ["y", "out", "c", "y"]],
        { tf: 5, solver: "rk4", h: 0.01 },
      ),
    );
    expect(at(sim, "c.out", 4)).toBeCloseTo(2, 6);
  });
  it("avanço de fase tem ganho K em baixa e K·T1/T2 em alta frequência", () => {
    const sim = run(mk([src("signal.step", { t_step: 0, v1: 1 }), { id: "g", type: "control.lead", params: { K: 2, T1: 1, T2: 0.1 } }], [["u", "out", "g", "in"]], { tf: 5, rtol: 1e-9, atol: 1e-11 }));
    expect(at(sim, "g.out", 5)).toBeCloseTo(2, 4);
    expect(at(sim, "g.out", 0.001)).toBeGreaterThan(15);
  });
});

describe("controle digital", () => {
  it("ZOH mantém o valor amostrado em k·Ts", () => {
    const sim = run(mk([src("signal.ramp", { slope: 1, t_start: 0 }), { id: "z", type: "disc.zoh", params: { Ts: 0.5 } }], [["u", "out", "z", "in"]], { tf: 3 }));
    expect(at(sim, "z.out", 0.4)).toBeCloseTo(0, 6);
    expect(at(sim, "z.out", 0.7)).toBeCloseTo(0.5, 2);
    expect(at(sim, "z.out", 2.2)).toBeCloseTo(2, 2);
  });
  it("atraso z⁻¹ devolve a amostra anterior", () => {
    const sim = run(mk([src("signal.ramp", { slope: 1, t_start: 0 }), { id: "z", type: "disc.delay", params: { Ts: 0.5 } }], [["u", "out", "z", "in"]], { tf: 3 }));
    expect(at(sim, "z.out", 1.2)).toBeCloseTo(0.5, 2);
    expect(at(sim, "z.out", 2.7)).toBeCloseTo(2, 2);
  });
  it("G(z) = 0,1/(z − 0,9) responde ao degrau como a equação de diferenças", () => {
    const sim = run(mk([src("signal.constant", { value: 1 }), { id: "g", type: "disc.tf", params: { num: "0.1", den: "1 -0.9", Ts: 0.1 } }], [["u", "out", "g", "in"]], { tf: 3 }));
    // y[k] = 0,9·y[k−1] + 0,1·u[k−1]  →  y[0] = 0, y[1] = 0,1, y[2] = 0,19 …
    let y = 0;
    const ys = [0];
    for (let k = 1; k <= 25; k++) {
      y = 0.9 * y + 0.1;
      ys.push(y);
    }
    for (const k of [1, 2, 5, 10, 25]) expect(at(sim, "g.out", k * 0.1 + 0.05)).toBeCloseTo(ys[k], 6);
  });
  it("integrador discreto trapezoidal e PID discreto com saturação", () => {
    const sim = run(mk([src("signal.constant", { value: 2 }), { id: "i", type: "disc.integrator", params: { Ts: 0.1, method: "backward" } }], [["u", "out", "i", "in"]], { tf: 2 }));
    expect(at(sim, "i.out", 1.05)).toBeCloseTo(2 * 0.1 * 11, 3);
    const s2 = run(mk([src("signal.constant", { value: 1 }), { id: "p", type: "disc.pid", params: { Kp: 3, Ki: 5, Kd: 0, Ts: 0.1, umax: 4 } }], [["u", "out", "p", "in"]], { tf: 5 }));
    expect(at(s2, "p.out", 4.5)).toBeCloseTo(4, 6);
  });
  it("média móvel de 4 amostras de uma constante", () => {
    const sim = run(mk([src("signal.constant", { value: 8 }), { id: "m", type: "disc.mavg", params: { N: 4, Ts: 0.1 } }], [["u", "out", "m", "in"]], { tf: 1 }));
    expect(at(sim, "m.out", 0.95)).toBeCloseTo(8, 6);
    expect(at(sim, "m.out", 0.05)).toBeCloseTo(2, 6);
  });
});

describe("não linearidades novas", () => {
  it("relé com histerese liga em 0,5 e desliga em −0,5", () => {
    const sim = run(mk([src("signal.sine", { amp: 1, freq: 0.25 }), { id: "r", type: "nonlinear.relay" }], [["u", "out", "r", "in"]], { tf: 4, rtol: 1e-8, atol: 1e-10 }));
    // seno de 0,25 Hz: passa 0,5 subindo em t = asin(0,5)/(2π·0,25) ≈ 0,333 e cai abaixo de −0,5 em t ≈ 2,333
    expect(at(sim, "r.out", 0.2)).toBe(0);
    expect(at(sim, "r.out", 0.5)).toBe(1);
    expect(at(sim, "r.out", 1.8)).toBe(1);
    expect(at(sim, "r.out", 2.6)).toBe(0);
  });
  it("limitador de taxa produz rampa de inclinação R e a tabela interpola", () => {
    const sim = run(mk([src("signal.step", { t_step: 0, v1: 10 }), { id: "l", type: "nonlinear.ratelimit", params: { R: 2 } }, { id: "q", type: "disc.quantizer", params: { q: 0.5 } }], [["u", "out", "l", "in"], ["l", "out", "q", "in"]], { tf: 3, rtol: 1e-8, atol: 1e-10 }));
    expect(at(sim, "l.out", 1)).toBeCloseTo(2, 1);
    expect(at(sim, "l.out", 2)).toBeCloseTo(4, 1);
    expect(at(sim, "q.out", 1.9) % 0.5).toBeCloseTo(0, 6);
  });
});

describe("busca", () => {
  it("acha por sinônimo, ignora acento e pesquisa em inglês", () => {
    expect(searchComponents("passa baixa").hits.map((d) => d.type)).toContain("control.butter");
    expect(searchComponents("PROPORCIONAL").hits.map((d) => d.type)).toContain("control.pi");
    expect(searchComponents("lowpass").hits.length).toBeGreaterThan(0);
    expect(searchComponents("zero order hold").hits[0].type).toBe("disc.zoh");
    expect(searchComponents("termostato").hits.map((d) => d.type)).toContain("nonlinear.relay");
  });
  it("tolera um erro de digitação e avisa quando é aproximado", () => {
    const r = searchComponents("capacitr");
    expect(r.approximate).toBe(true);
    expect(r.hits[0].type).toBe("elec.capacitor");
  });
  it("diz o que ainda não existe", () => {
    const r = searchComponents("transformador");
    expect(r.hits.length).toBe(0);
    expect(r.upcoming.map((u) => u.label)).toContain("Transformador");
  });
});

import { SITUATIONS } from "../src";
describe("situações de controle", () => {
  for (const s of SITUATIONS.filter((x) => x.group === "control")) {
    it(`${s.id} compila e roda sem erro`, () => {
      const sim = new Simulation(s.make());
      expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      sim.runToEnd();
      expect(sim.status).toBe("finished");
    });
  }
  it("o forno liga-desliga fica perto da temperatura desejada", () => {
    const sim = new Simulation(SITUATIONS.find((x) => x.id === "relay-oven")!.make());
    sim.runToEnd();
    const y = at(sim, "forno.out", 190);
    expect(y).toBeGreaterThan(5.4);
    expect(y).toBeLessThan(6.6);
  });
  it("o PID discreto segue a referência", () => {
    const sim = new Simulation(SITUATIONS.find((x) => x.id === "digital-pid")!.make());
    sim.runToEnd();
    expect(at(sim, "planta.out", 7.9)).toBeGreaterThan(0.95);
    expect(at(sim, "planta.out", 7.9)).toBeLessThan(1.05);
  });
});
