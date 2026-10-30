import { describe, expect, it } from "vitest";
import { Simulation } from "../src";
import { at, mk, sigIndex } from "./helpers";

const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(sim.status).toBe("finished");
  return sim;
};
const held = (sim: Simulation, id: string, t: number) => {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  let v = ys[0];
  for (let i = 0; i < ts.length && ts[i] <= t + 1e-12; i++) v = ys[i];
  return v;
};
const range = (sim: Simulation, id: string, t0: number, t1: number) => {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < ts.length; i++) if (ts[i] >= t0 && ts[i] <= t1) (lo = Math.min(lo, ys[i])), (hi = Math.max(hi, ys[i]));
  return { lo, hi };
};
const crossings = (sim: Simulation, id: string) => {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  const rise: number[] = [],
    fall: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    if (ys[i] > ys[i - 1]) rise.push(ts[i]);
    if (ys[i] < ys[i - 1]) fall.push(ts[i]);
  }
  return { rise, fall };
};

const VT = 0.025852;
/** Tensão no diodo em série com R de uma fonte V (bisseção na equação de Shockley). */
function diodeRef(V: number, R: number, Is = 1e-14, n = 1) {
  let lo = 0,
    hi = V;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    const f = Is * (Math.exp(m / (n * VT)) - 1) - (V - m) / R;
    if (f > 0) hi = m;
    else lo = m;
  }
  return lo;
}

const supply = (id: string, value: number) => [
  { id: `${id}u`, type: "signal.constant", params: { value } },
  { id, type: "elec.vsource" },
];

describe("diodo", () => {
  it("diodo com resistor: tensão de Shockley e corrente de Kirchhoff", () => {
    const sim = run(
      mk(
        [...supply("v", 5), { id: "r", type: "elec.resistor", params: { R: 1000 } }, { id: "d", type: "elec.diode" }, { id: "g", type: "elec.ground" }],
        [["vu", "out", "v", "u"], ["v", "p", "r", "a"], ["r", "b", "d", "a"], ["d", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.1 },
      ),
    );
    const vd = diodeRef(5, 1000);
    expect(held(sim, "d.v", 0.1)).toBeCloseTo(vd, 6);
    expect(held(sim, "d.i", 0.1)).toBeCloseTo((5 - vd) / 1000, 8);
    expect(held(sim, "r.i", 0.1)).toBeCloseTo((5 - vd) / 1000, 8);
  });

  it("retificador de meia onda com filtro capacitivo: pico menos a queda do diodo", () => {
    const sim = run(
      mk(
        [
          { id: "s", type: "signal.sine", params: { amp: 10, freq: 50, offset: 0, phase: 0 } },
          { id: "v", type: "elec.vsource" },
          { id: "d", type: "elec.diode" },
          { id: "c", type: "elec.capacitor", params: { C: 1e-3 } },
          { id: "r", type: "elec.resistor", params: { R: 1000 } },
          { id: "g", type: "elec.ground" },
        ],
        [["s", "out", "v", "u"], ["v", "p", "d", "a"], ["d", "b", "c", "a"], ["d", "b", "r", "a"], ["c", "b", "g", "a"], ["r", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.2, rtol: 1e-6, atol: 1e-9 },
      ),
    );
    const { lo, hi } = range(sim, "c.v", 0.1, 0.2);
    expect(hi).toBeGreaterThan(9.1);
    expect(hi).toBeLessThan(9.6); // 10 V menos ~0,5 a 0,8 V
    expect(lo).toBeGreaterThan(8.0); // ondulação pequena: RC = 1 s ≫ 20 ms
    expect(range(sim, "d.v", 0.1, 0.2).lo).toBeLessThan(-8); // bloqueia no semiciclo negativo
  });

  it("Zener regula a tensão", () => {
    for (const vin of [10, 15]) {
      const sim = run(
        mk(
          [...supply("v", vin), { id: "r", type: "elec.resistor", params: { R: 470 } }, { id: "z", type: "elec.zener", params: { Vz: 5.1 } }, { id: "g", type: "elec.ground" }],
          [["vu", "out", "v", "u"], ["v", "p", "r", "a"], ["r", "b", "z", "b"], ["z", "a", "g", "a"], ["v", "n", "g", "a"]],
          { tf: 0.05 },
        ),
      );
      const vout = -held(sim, "z.v", 0.05);
      expect(vout).toBeGreaterThan(5.0);
      expect(vout).toBeLessThan(5.3);
    }
  });

  it("LED com resistor: queda de uns 1,9 V", () => {
    const sim = run(
      mk(
        [...supply("v", 5), { id: "r", type: "elec.resistor", params: { R: 330 } }, { id: "d", type: "elec.led" }, { id: "g", type: "elec.ground" }],
        [["vu", "out", "v", "u"], ["v", "p", "r", "a"], ["r", "b", "d", "a"], ["d", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.05 },
      ),
    );
    expect(held(sim, "d.v", 0.05)).toBeGreaterThan(1.7);
    expect(held(sim, "d.v", 0.05)).toBeLessThan(2.1);
    expect(held(sim, "d.i", 0.05)).toBeCloseTo((5 - held(sim, "d.v", 0.05)) / 330, 7);
  });
});

describe("transistor bipolar", () => {
  const bias = (type: string) =>
    mk(
      [
        ...supply("v", type === "elec.npn" ? 12 : -12),
        { id: "rb", type: "elec.resistor", params: { R: 1e6 } },
        { id: "rc", type: "elec.resistor", params: { R: 4700 } },
        { id: "q", type: type, params: { bf: 100 } },
        { id: "g", type: "elec.ground" },
      ],
      [["vu", "out", "v", "u"], ["v", "p", "rb", "a"], ["v", "p", "rc", "a"], ["rb", "b", "q", "b"], ["rc", "b", "q", "c"], ["q", "e", "g", "a"], ["v", "n", "g", "a"]],
      { tf: 0.05 },
    );

  it("polarização fixa: Ic = β·Ib na região ativa", () => {
    const sim = run(bias("elec.npn"));
    const ib = held(sim, "q.ib", 0.05),
      ic = held(sim, "q.ic", 0.05);
    expect(ic / ib).toBeGreaterThan(98);
    expect(ic / ib).toBeLessThan(101);
    expect(held(sim, "q.vbe", 0.05)).toBeGreaterThan(0.6);
    expect(held(sim, "q.vbe", 0.05)).toBeLessThan(0.75);
    // Lei das malhas: Vce = Vcc − Rc·Ic
    expect(held(sim, "q.vce", 0.05)).toBeCloseTo(12 - 4700 * ic, 4);
  });

  it("PNP espelho do NPN com fonte negativa", () => {
    const n = run(bias("elec.npn"));
    // No PNP a fonte negativa alimenta o emissor ligado ao terra: a polarização fixa usa as mesmas relações.
    const sim = run(
      mk(
        [
          ...supply("v", 12),
          { id: "rb", type: "elec.resistor", params: { R: 1e6 } },
          { id: "rc", type: "elec.resistor", params: { R: 4700 } },
          { id: "q", type: "elec.pnp", params: { bf: 100 } },
          { id: "g", type: "elec.ground" },
        ],
        [["vu", "out", "v", "u"], ["v", "p", "q", "e"], ["rb", "a", "g", "a"], ["rb", "b", "q", "b"], ["rc", "a", "q", "c"], ["rc", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.05 },
      ),
    );
    expect(held(sim, "q.ic", 0.05)).toBeCloseTo(held(n, "q.ic", 0.05), 6);
    expect(held(sim, "q.vbe", 0.05)).toBeCloseTo(held(n, "q.vbe", 0.05), 6);
  });

  it("amplificador emissor comum: ganho de tensão ≈ −gm·(Rc‖RL)", () => {
    const f = 1000;
    const sim = run(
      mk(
        [
          ...supply("vcc", 12),
          { id: "s", type: "signal.sine", params: { amp: 0.005, freq: f, offset: 0, phase: 0 } },
          { id: "vin", type: "elec.vsource" },
          { id: "cin", type: "elec.capacitor", params: { C: 4.7e-6 } },
          { id: "r1", type: "elec.resistor", params: { R: 47000 } },
          { id: "r2", type: "elec.resistor", params: { R: 10000 } },
          { id: "rc", type: "elec.resistor", params: { R: 4700 } },
          { id: "re", type: "elec.resistor", params: { R: 1000 } },
          { id: "ce", type: "elec.capacitor", params: { C: 47e-6 } },
          { id: "cout", type: "elec.capacitor", params: { C: 4.7e-6 } },
          { id: "rl", type: "elec.resistor", params: { R: 100000 } },
          { id: "vm", type: "elec.voltmeter" },
          { id: "q", type: "elec.npn", params: { bf: 150 } },
          { id: "g", type: "elec.ground" },
        ],
        [
          ["vccu", "out", "vcc", "u"],
          ["s", "out", "vin", "u"],
          ["vcc", "p", "r1", "a"], ["vcc", "p", "rc", "a"],
          ["r1", "b", "r2", "a"], ["r1", "b", "q", "b"], ["r1", "b", "cin", "b"],
          ["cin", "a", "vin", "p"],
          ["rc", "b", "q", "c"], ["rc", "b", "cout", "a"],
          ["cout", "b", "rl", "a"],
          ["q", "e", "re", "a"], ["q", "e", "ce", "a"],
          ["r2", "b", "g", "a"], ["re", "b", "g", "a"], ["ce", "b", "g", "a"], ["rl", "b", "g", "a"],
          ["vin", "n", "g", "a"], ["vcc", "n", "g", "a"],
          ["vm", "a", "rl", "a"], ["vm", "b", "g", "a"],
        ],
        { tf: 0.25, rtol: 1e-6, atol: 1e-9, solver: "rk45" },
      ),
    );
    const jc = sigIndex(sim, "q.ic");
    const ts = sim.series.timeView();
    const col = sim.series.colView(jc);
    let sum = 0,
      cnt = 0;
    for (let i = 0; i < ts.length; i++) if (ts[i] >= 0.245) (sum += col[i]), cnt++;
    const ic = sum / cnt; // corrente média de coletor (ponto de operação)
    expect(ic).toBeGreaterThan(0.5e-3);
    expect(ic).toBeLessThan(3e-3);
    const gm = ic / VT;
    const rcl = (4700 * 100000) / (4700 + 100000);
    // Amplitude de saída em RL (no nó entre cout e rl, via sinal da rede)
    const { lo, hi } = range(sim, "vm.v", 0.245, 0.25);
    const gain = (hi - lo) / 2 / 0.005;
    expect(gain / (gm * rcl)).toBeGreaterThan(0.93);
    expect(gain / (gm * rcl)).toBeLessThan(1.03);
  });
});

describe("MOSFET", () => {
  const circuit = (vgs: number) =>
    mk(
      [
        ...supply("vdd", 12),
        ...supply("vg", vgs),
        { id: "rd", type: "elec.resistor", params: { R: 1000 } },
        { id: "rg", type: "elec.resistor", params: { R: 1e6 } },
        { id: "m", type: "elec.nmos", params: { K: 0.05, Vth: 2, lam: 0.01 } },
        { id: "g", type: "elec.ground" },
      ],
      [
        ["vddu", "out", "vdd", "u"], ["vgu", "out", "vg", "u"],
        ["vdd", "p", "rd", "a"], ["rd", "b", "m", "d"], ["vg", "p", "rg", "a"], ["rg", "b", "m", "g"], ["m", "s", "g", "a"],
        ["vdd", "n", "g", "a"], ["vg", "n", "g", "a"],
      ],
      { tf: 0.05 },
    );

  it("saturação: Id = K/2·(Vgs−Vth)²·(1+λ·Vds)", () => {
    const sim = run(circuit(2.5));
    const vds = held(sim, "m.vds", 0.05);
    const id = held(sim, "m.id", 0.05);
    expect(vds).toBeGreaterThan(0.5); // saturação
    expect(id).toBeCloseTo(0.025 * 0.25 * (1 + 0.01 * vds), 8);
    expect(vds).toBeCloseTo(12 - 1000 * id, 6);
  });

  it("triodo (chave ligada): Vds pequeno", () => {
    const sim = run(circuit(8));
    expect(held(sim, "m.vds", 0.05)).toBeLessThan(0.1);
    expect(held(sim, "m.id", 0.05)).toBeGreaterThan(11e-3);
  });

  it("corte: porta abaixo de Vth, sem corrente", () => {
    const sim = run(circuit(1));
    expect(Math.abs(held(sim, "m.id", 0.05))).toBeLessThan(1e-9);
    expect(held(sim, "m.vds", 0.05)).toBeCloseTo(12, 4);
  });
});

describe("amplificador operacional", () => {
  const inv = (vin: number, rf: number) =>
    mk(
      [
        ...supply("v", vin),
        { id: "rin", type: "elec.resistor", params: { R: 10000 } },
        { id: "rf", type: "elec.resistor", params: { R: rf } },
        { id: "a", type: "elec.opamp" },
        { id: "g", type: "elec.ground" },
      ],
      [["vu", "out", "v", "u"], ["v", "p", "rin", "a"], ["rin", "b", "a", "n"], ["rin", "b", "rf", "a"], ["rf", "b", "a", "o"], ["a", "p", "g", "a"], ["v", "n", "g", "a"]],
      { tf: 0.05 },
    );

  it("inversor: Vo = −(Rf/Rin)·Vin", () => {
    const sim = run(inv(0.5, 100000));
    // Ganho finito A0 = 1e5: Vo = −(Rf/Rin)·Vin / (1 + (1 + Rf/Rin)/A0)
    expect(held(sim, "a.vo", 0.05)).toBeCloseTo(-5 / (1 + 11 / 1e5), 4);
    expect(Math.abs(held(sim, "a.vd", 0.05))).toBeLessThan(1e-3);
  });

  it("satura nos limites quando o ganho pede mais que a alimentação", () => {
    const sim = run(inv(2, 100000));
    expect(held(sim, "a.vo", 0.05)).toBeGreaterThan(-12.001);
    expect(held(sim, "a.vo", 0.05)).toBeLessThan(-11.9);
  });

  it("não inversor: Vo = (1 + Rf/Rg)·Vin", () => {
    const sim = run(
      mk(
        [
          ...supply("v", 0.4),
          { id: "rg", type: "elec.resistor", params: { R: 1000 } },
          { id: "rf", type: "elec.resistor", params: { R: 9000 } },
          { id: "a", type: "elec.opamp" },
          { id: "g", type: "elec.ground" },
        ],
        [["vu", "out", "v", "u"], ["v", "p", "a", "p"], ["a", "o", "rf", "a"], ["rf", "b", "a", "n"], ["rf", "b", "rg", "a"], ["rg", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.05 },
      ),
    );
    expect(held(sim, "a.vo", 0.05)).toBeCloseTo(4, 3);
  });

  it("integrador com capacitor na realimentação: rampa de −Vin/(R·C)", () => {
    const sim = run(
      mk(
        [
          ...supply("v", 1),
          { id: "r", type: "elec.resistor", params: { R: 10000 } },
          { id: "c", type: "elec.capacitor", params: { C: 1e-6 } },
          { id: "a", type: "elec.opamp" },
          { id: "g", type: "elec.ground" },
        ],
        [["vu", "out", "v", "u"], ["v", "p", "r", "a"], ["r", "b", "a", "n"], ["r", "b", "c", "a"], ["c", "b", "a", "o"], ["a", "p", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.08 },
      ),
    );
    expect(at(sim, "a.vo", 0.05)).toBeCloseTo(-5, 2);
    expect(at(sim, "a.vo", 0.08)).toBeCloseTo(-8, 2);
  });

  it("comparador em malha aberta vai para o trilho e troca no cruzamento", () => {
    const sim = run(
      mk(
        [
          { id: "s", type: "signal.sine", params: { amp: 1, freq: 10, offset: 0, phase: 0 } },
          { id: "v", type: "elec.vsource" },
          { id: "a", type: "elec.opamp", params: { vpos: 5, vneg: -5 } },
          { id: "rl", type: "elec.resistor", params: { R: 1000 } },
          { id: "g", type: "elec.ground" },
        ],
        [["s", "out", "v", "u"], ["v", "p", "a", "p"], ["a", "n", "g", "a"], ["v", "n", "g", "a"], ["a", "o", "rl", "a"], ["rl", "b", "g", "a"]],
        { tf: 0.3 },
      ),
    );
    expect(held(sim, "a.vo", 0.025)).toBeGreaterThan(4.99); // sin > 0
    expect(held(sim, "a.vo", 0.075)).toBeLessThan(-4.99); // sin < 0
    expect(held(sim, "a.vo", 0.125)).toBeGreaterThan(4.99);
  });
});

describe("chave comandada e 555", () => {
  it("chave carrega o capacitor e o solta no instante exato", () => {
    const sim = run(
      mk(
        [
          ...supply("v", 5),
          { id: "ck", type: "dig.clock", params: { f: 2, duty: 25 } }, // fecha em 0 … 0,125 s, 0,5 … 0,625 s
          { id: "sw", type: "elec.switch", params: { Ron: 100 } },
          { id: "c", type: "elec.capacitor", params: { C: 1e-3 } },
          { id: "r", type: "elec.resistor", params: { R: 1e6 } },
          { id: "g", type: "elec.ground" },
        ],
        [["vu", "out", "v", "u"], ["ck", "y", "sw", "u"], ["v", "p", "sw", "a"], ["sw", "b", "c", "a"], ["sw", "b", "r", "a"], ["c", "b", "g", "a"], ["r", "b", "g", "a"], ["v", "n", "g", "a"]],
        { tf: 0.4 },
      ),
    );
    // τ = 100 Ω · 1 mF = 0,1 s; fecha por 0,125 s: v = 5·(1 − e^(−1,25)) ≈ 3,57 V; depois descarrega por 1 MΩ (muito lento).
    expect(held(sim, "c.v", 0.125)).toBeCloseTo(5 * (1 - Math.exp(-1.25)), 1);
    expect(held(sim, "c.v", 0.3)).toBeCloseTo(held(sim, "c.v", 0.13), 2);
  });

  it("555 astável: período 0,693·(R1+2·R2)·C e ciclo de trabalho (R1+R2)/(R1+2·R2)", () => {
    const R1 = 10000,
      R2 = 10000,
      C = 10e-6;
    const sim = run(
      mk(
        [
          ...supply("v", 5),
          { id: "r1", type: "elec.resistor", params: { R: R1 } },
          { id: "r2", type: "elec.resistor", params: { R: R2 } },
          { id: "c", type: "elec.capacitor", params: { C } },
          { id: "t", type: "elec.timer555", params: { vcc: 5 } },
          { id: "g", type: "elec.ground" },
        ],
        [
          ["vu", "out", "v", "u"], ["v", "p", "r1", "a"], ["r1", "b", "r2", "a"], ["r1", "b", "t", "dis"],
          ["r2", "b", "c", "a"], ["r2", "b", "t", "thr"], ["r2", "b", "t", "trig"], ["c", "b", "g", "a"], ["v", "n", "g", "a"],
        ],
        { tf: 2 },
      ),
    );
    const { rise, fall } = crossings(sim, "t.out");
    expect(rise.length).toBeGreaterThan(5);
    const period = rise[rise.length - 1] - rise[rise.length - 2];
    expect(period / (0.693 * (R1 + 2 * R2) * C)).toBeGreaterThan(0.97);
    expect(period / (0.693 * (R1 + 2 * R2) * C)).toBeLessThan(1.03);
    const lastRise = rise[rise.length - 1];
    const lastFall = fall.filter((f) => f < lastRise).pop()!;
    const prevRise = rise[rise.length - 2];
    const highTime = lastFall - prevRise;
    expect(highTime / period).toBeGreaterThan(0.64);
    expect(highTime / period).toBeLessThan(0.7);
    // tensão do capacitor entre 1/3 e 2/3 de Vcc
    const { lo, hi } = range(sim, "c.v", 1, 2);
    expect(lo).toBeGreaterThan(5 / 3 - 0.05);
    expect(hi).toBeLessThan((10 / 3) + 0.05);
  });
});
