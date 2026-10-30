import { describe, expect, it } from "vitest";
import { SITUATIONS, Simulation } from "../src";
import { at, mk } from "./helpers";

const T = { rtol: 1e-9, atol: 1e-12 };
const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  expect(sim.status).toBe("finished");
  return sim;
};
const errors = (p: ReturnType<typeof mk>) => new Simulation(p).diagnostics.filter((d) => d.severity === "error");

describe("mecânico, translação", () => {
  const msd = (extra: Record<string, number> = {}) =>
    mk(
      [
        { id: "w", type: "mech.ground" },
        { id: "k", type: "mech.spring", params: { k: 100 } },
        { id: "m", type: "mech.mass", params: { m: 1, x0: 0.1, ...extra } },
        { id: "c", type: "mech.damper", params: { c: 2 } },
      ],
      [
        ["w", "a", "k", "a"],
        ["k", "b", "m", "a"],
        ["m", "b", "c", "a"],
        ["c", "b", "w", "a"],
      ],
      { tf: 3, ...T },
    );

  it("massa-mola-amortecedor livre segue a solução analítica subamortecida", () => {
    const sim = run(msd());
    const zeta = 2 / (2 * Math.sqrt(100 * 1)),
      wn = 10,
      wd = wn * Math.sqrt(1 - zeta * zeta);
    for (const t of [0.2, 0.5, 1, 2, 2.9]) {
      const x = 0.1 * Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t));
      expect(at(sim, "m.x", t)).toBeCloseTo(x, 6);
    }
  });

  it("a tração da mola vale k·x e o amortecedor mede c·v", () => {
    const sim = run(msd());
    expect(at(sim, "k.F", 0.7)).toBeCloseTo(100 * at(sim, "m.x", 0.7), 6);
    expect(at(sim, "c.F", 0.7)).toBeCloseTo(-2 * at(sim, "m.v", 0.7), 6);
  });

  it("força em degrau leva à deformação estática F/k", () => {
    const sim = run(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "k", type: "mech.spring", params: { k: 200 } },
          { id: "m", type: "mech.mass", params: { m: 2 } },
          { id: "c", type: "mech.damper", params: { c: 40 } },
          { id: "f", type: "mech.force" },
          { id: "u", type: "signal.constant", params: { value: 10 } },
        ],
        [
          ["w", "a", "k", "a"],
          ["k", "b", "m", "a"],
          ["m", "b", "c", "a"],
          ["c", "b", "w", "a"],
          ["f", "a", "m", "b"],
          ["u", "out", "f", "u"],
        ],
        { tf: 5, ...T },
      ),
    );
    expect(at(sim, "m.x", 5)).toBeCloseTo(10 / 200, 5);
    expect(at(sim, "m.v", 5)).toBeCloseTo(0, 5);
  });

  it("duas massas no mesmo ponto equivalem a uma massa somada", () => {
    const dois = run(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "k", type: "mech.spring", params: { k: 50 } },
          { id: "m1", type: "mech.mass", params: { m: 1, x0: 0.2 } },
          { id: "m2", type: "mech.mass", params: { m: 3, x0: 0.2 } },
        ],
        [
          ["w", "a", "k", "a"],
          ["k", "b", "m1", "a"],
          ["m1", "b", "m2", "a"],
        ],
        { tf: 2, ...T },
      ),
    );
    const um = run(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "k", type: "mech.spring", params: { k: 50 } },
          { id: "m1", type: "mech.mass", params: { m: 4, x0: 0.2 } },
        ],
        [
          ["w", "a", "k", "a"],
          ["k", "b", "m1", "a"],
        ],
        { tf: 2, ...T },
      ),
    );
    expect(at(dois, "m1.x", 1.3)).toBeCloseTo(at(um, "m1.x", 1.3), 8);
    expect(at(dois, "m2.x", 1.3)).toBeCloseTo(at(um, "m1.x", 1.3), 8);
  });

  it("amortecedor ligado a um movimento imposto mede c·v (caminho algébrico)", () => {
    const sim = run(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "mv", type: "mech.velocity" },
          { id: "d", type: "mech.damper", params: { c: 3 } },
          { id: "u", type: "signal.constant", params: { value: 2 } },
        ],
        [
          ["mv", "a", "d", "a"],
          ["d", "b", "w", "a"],
          ["u", "out", "mv", "u"],
        ],
        { tf: 1 },
      ),
    );
    expect(at(sim, "d.F", 0.5)).toBeCloseTo(-6, 9);
  });

  it("ponto só com mola sem massa nem amortecedor gera erro claro", () => {
    const e = errors(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "k1", type: "mech.spring" },
          { id: "k2", type: "mech.spring" },
          { id: "m", type: "mech.mass" },
        ],
        [
          ["w", "a", "k1", "a"],
          ["k1", "b", "k2", "a"],
          ["k2", "b", "m", "a"],
        ],
      ),
    );
    expect(e.some((d) => d.code === "phys-singular" && /Falta/.test(d.message))).toBe(true);
  });

  it("porta solta gera erro", () => {
    const e = errors(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "k", type: "mech.spring" },
        ],
        [["w", "a", "k", "a"]],
      ),
    );
    expect(e.some((d) => d.code === "phys-open")).toBe(true);
  });

  it("controle de posição por força não gera laço algébrico e rastreia a referência", () => {
    const sim = run(
      mk(
        [
          { id: "w", type: "mech.ground" },
          { id: "c", type: "mech.damper", params: { c: 1 } },
          { id: "m", type: "mech.mass", params: { m: 1 } },
          { id: "f", type: "mech.force" },
          { id: "ref", type: "signal.constant", params: { value: 0.5 } },
          { id: "s", type: "math.sum", params: { signs: "+-" } },
          { id: "pid", type: "control.pid", params: { Kp: 100, Ki: 20, Kd: 20, N: 100 } },
        ],
        [
          ["w", "a", "c", "a"],
          ["c", "b", "m", "a"],
          ["f", "a", "m", "b"],
          ["ref", "out", "s", "in1"],
          ["m", "x", "s", "in2"],
          ["s", "out", "pid", "in"],
          ["pid", "out", "f", "u"],
        ],
        { tf: 10 },
      ),
    );
    expect(at(sim, "m.x", 10)).toBeCloseTo(0.5, 3);
  });

  it("mudar um parâmetro ao vivo continua do estado atual", () => {
    const sim = new Simulation(msd());
    sim.advanceTo(1);
    const x = sim.currentSignals()[sim.signals.findIndex((s) => s.id === "m.x")];
    const r = sim.setParam("c", "c", 10);
    expect(r.ok).toBe(true);
    expect(r.reset).toBeFalsy();
    const x2 = sim.currentSignals()[sim.signals.findIndex((s) => s.id === "m.x")];
    expect(x2).toBeCloseTo(x, 12);
    sim.runToEnd();
    expect(sim.status).toBe("finished");
  });
});

describe("mecânico, rotação", () => {
  it("engrenagem reflete a inércia da carga por 1/N²", () => {
    const N = 5;
    const com = run(
      mk(
        [
          { id: "g0", type: "rot.ground" },
          { id: "j1", type: "rot.inertia", params: { J: 0.01 } },
          { id: "g", type: "rot.gear", params: { N } },
          { id: "j2", type: "rot.inertia", params: { J: 0.25 } },
          { id: "t", type: "rot.torque" },
          { id: "u", type: "signal.constant", params: { value: 2 } },
        ],
        [
          ["t", "a", "j1", "a"],
          ["j1", "b", "g", "a"],
          ["g", "b", "j2", "a"],
          ["u", "out", "t", "u"],
        ],
        { tf: 2, ...T },
      ),
    );
    const Jeq = 0.01 + 0.25 / (N * N);
    expect(at(com, "j1.w", 1.5)).toBeCloseTo((2 * 1.5) / Jeq, 7);
    expect(at(com, "j2.w", 1.5)).toBeCloseTo((2 * 1.5) / Jeq / N, 7);
  });

  it("pinhão e cremalheira: inércia equivalente J + m·r²", () => {
    const r = 0.1;
    const sim = run(
      mk(
        [
          { id: "j", type: "rot.inertia", params: { J: 0.02 } },
          { id: "rk", type: "mech.rack", params: { r } },
          { id: "m", type: "mech.mass", params: { m: 4 } },
          { id: "t", type: "rot.torque" },
          { id: "u", type: "signal.constant", params: { value: 1 } },
        ],
        [
          ["t", "a", "j", "a"],
          ["j", "b", "rk", "a"],
          ["rk", "b", "m", "a"],
          ["u", "out", "t", "u"],
        ],
        { tf: 2, ...T },
      ),
    );
    const Jeq = 0.02 + 4 * r * r;
    expect(at(sim, "j.w", 2)).toBeCloseTo(2 / Jeq, 7);
    expect(at(sim, "m.v", 2)).toBeCloseTo((2 / Jeq) * r, 7);
  });

  it("engrenagens em laço incompatível geram erro", () => {
    const e = errors(
      mk(
        [
          { id: "g1", type: "rot.gear", params: { N: 2 } },
          { id: "g2", type: "rot.gear", params: { N: 3 } },
          { id: "j", type: "rot.inertia" },
        ],
        [
          ["g1", "b", "g2", "a"],
          ["g2", "b", "g1", "a"],
          ["g1", "a", "j", "a"],
        ],
      ),
    );
    expect(e.some((d) => d.code === "phys-gear-loop")).toBe(true);
  });
});

describe("elétrico", () => {
  it("RLC série em degrau segue a solução analítica", () => {
    const sim = run(
      mk(
        [
          { id: "v", type: "elec.vsource" },
          { id: "u", type: "signal.constant", params: { value: 10 } },
          { id: "r", type: "elec.resistor", params: { R: 10 } },
          { id: "l", type: "elec.inductor", params: { L: 0.1 } },
          { id: "c", type: "elec.capacitor", params: { C: 1e-3 } },
          { id: "g", type: "elec.ground" },
        ],
        [
          ["u", "out", "v", "u"],
          ["v", "p", "r", "a"],
          ["r", "b", "l", "a"],
          ["l", "b", "c", "a"],
          ["c", "b", "g", "a"],
          ["v", "n", "g", "a"],
        ],
        { tf: 0.3, ...T },
      ),
    );
    const a = 50,
      wd = Math.sqrt(1e4 - 2500);
    for (const t of [0.01, 0.03, 0.08, 0.2]) {
      const vc = 10 * (1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t)));
      expect(at(sim, "c.v", t)).toBeCloseTo(vc, 5);
    }
    expect(at(sim, "l.i", 0.3)).toBeCloseTo(0, 3);
  });

  it("filtro RC passa-alta (capacitor flutuante) decai como V·e^(−t/RC)", () => {
    const sim = run(
      mk(
        [
          { id: "v", type: "elec.vsource" },
          { id: "u", type: "signal.constant", params: { value: 10 } },
          { id: "c", type: "elec.capacitor", params: { C: 1e-4 } },
          { id: "r", type: "elec.resistor", params: { R: 1000 } },
          { id: "g", type: "elec.ground" },
          { id: "vm", type: "elec.voltmeter" },
        ],
        [
          ["u", "out", "v", "u"],
          ["v", "p", "c", "a"],
          ["c", "b", "r", "a"],
          ["r", "b", "g", "a"],
          ["v", "n", "g", "a"],
          ["vm", "a", "r", "a"],
          ["vm", "b", "g", "a"],
        ],
        { tf: 0.5, ...T },
      ),
    );
    for (const t of [0.02, 0.1, 0.3]) expect(at(sim, "r.v", t)).toBeCloseTo(10 * Math.exp(-t / 0.1), 6);
    expect(at(sim, "vm.v", 0.1)).toBeCloseTo(at(sim, "r.v", 0.1), 9);
  });

  it("divisor resistivo com fonte de corrente", () => {
    const sim = run(
      mk(
        [
          { id: "i", type: "elec.isource" },
          { id: "u", type: "signal.constant", params: { value: 0.01 } },
          { id: "r1", type: "elec.resistor", params: { R: 300 } },
          { id: "r2", type: "elec.resistor", params: { R: 600 } },
          { id: "g", type: "elec.ground" },
        ],
        [
          ["u", "out", "i", "u"],
          ["i", "p", "r1", "a"],
          ["i", "p", "r2", "a"],
          ["r1", "b", "g", "a"],
          ["r2", "b", "g", "a"],
          ["i", "n", "g", "a"],
        ],
        { tf: 1 },
      ),
    );
    // 300 ∥ 600 = 200 Ω; v = 2 V
    expect(at(sim, "r1.v", 0.5)).toBeCloseTo(2, 9);
    expect(at(sim, "r1.i", 0.5)).toBeCloseTo(2 / 300, 9);
  });

  it("fonte de tensão em paralelo com capacitor gera erro claro", () => {
    const e = errors(
      mk(
        [
          { id: "v", type: "elec.vsource" },
          { id: "u", type: "signal.constant" },
          { id: "c", type: "elec.capacitor" },
          { id: "g", type: "elec.ground" },
        ],
        [
          ["u", "out", "v", "u"],
          ["v", "p", "c", "a"],
          ["c", "b", "g", "a"],
          ["v", "n", "g", "a"],
        ],
      ),
    );
    expect(e.some((d) => d.code === "phys-singular")).toBe(true);
  });

  it("acoplar domínios diferentes dá mensagem didática", () => {
    const e = errors(
      mk(
        [
          { id: "m", type: "mech.mass" },
          { id: "r", type: "elec.resistor" },
        ],
        [["m", "a", "r", "a"]],
      ),
    );
    expect(e.some((d) => d.code === "domain-mismatch")).toBe(true);
  });
});

describe("eletromecânico", () => {
  const motor = (extra: Record<string, number> = {}) =>
    mk(
      [
        { id: "v", type: "elec.vsource" },
        { id: "u", type: "signal.constant", params: { value: 12 } },
        { id: "g", type: "elec.ground" },
        { id: "mo", type: "electromech.motor", params: { Ra: 2, La: 0.005, K: 0.1, J: 0.005, b: 0.001, ...extra } },
      ],
      [
        ["u", "out", "v", "u"],
        ["v", "p", "mo", "p"],
        ["v", "n", "g", "a"],
        ["mo", "n", "g", "a"],
      ],
      { tf: 8, ...T },
    );

  it("motor CC em vazio coincide com a função de transferência de 2ª ordem", () => {
    const sim = run(motor());
    const tf = run(
      mk(
        [
          { id: "u", type: "signal.constant", params: { value: 12 } },
          { id: "g", type: "control.tf", params: { num: "0.1", den: "2.5e-5 0.010005 0.012" } },
        ],
        [["u", "out", "g", "in"]],
        { tf: 8, ...T },
      ),
    );
    for (const t of [0.1, 0.5, 1, 2, 3.5]) expect(at(sim, "mo.w", t)).toBeCloseTo(at(tf, "g.out", t), 5);
    expect(at(sim, "mo.w", 8)).toBeCloseTo(100, 1);
    expect(at(sim, "mo.i", 8)).toBeCloseTo(1, 2);
    expect(at(sim, "mo.tau", 8)).toBeCloseTo(0.1, 3);
  });

  it("motor com redutor equivale ao motor com a inércia refletida", () => {
    const N = 10;
    const redutor = mk(
      [
        { id: "v", type: "elec.vsource" },
        { id: "u", type: "signal.constant", params: { value: 12 } },
        { id: "g", type: "elec.ground" },
        { id: "mo", type: "electromech.motor", params: { J: 0.005 } },
        { id: "rd", type: "rot.gear", params: { N } },
        { id: "load", type: "rot.inertia", params: { J: 0.5 } },
      ],
      [
        ["u", "out", "v", "u"],
        ["v", "p", "mo", "p"],
        ["v", "n", "g", "a"],
        ["mo", "n", "g", "a"],
        ["mo", "s", "rd", "a"],
        ["rd", "b", "load", "a"],
      ],
      { tf: 3, ...T },
    );
    const a = run(redutor);
    const b = run(motor({ J: 0.005 + 0.5 / (N * N) }));
    expect(at(a, "mo.w", 1.2)).toBeCloseTo(at(b, "mo.w", 1.2), 6);
    expect(at(a, "load.w", 1.2)).toBeCloseTo(at(b, "mo.w", 1.2) / N, 6);
  });

  it("servo de posição com PID leva o eixo à referência", () => {
    const sim = run(
      mk(
        [
          { id: "ref", type: "signal.step", params: { t_step: 0.2, v0: 0, v1: 1 } },
          { id: "s", type: "math.sum", params: { signs: "+-" } },
          { id: "pid", type: "control.pid", params: { Kp: 30, Ki: 0, Kd: 2, N: 200 } },
          { id: "v", type: "elec.vsource" },
          { id: "g", type: "elec.ground" },
          { id: "mo", type: "electromech.motor", params: { J: 0.01 } },
        ],
        [
          ["ref", "out", "s", "in1"],
          ["mo", "th", "s", "in2"],
          ["s", "out", "pid", "in"],
          ["pid", "out", "v", "u"],
          ["v", "p", "mo", "p"],
          ["v", "n", "g", "a"],
          ["mo", "n", "g", "a"],
        ],
        { tf: 4 },
      ),
    );
    expect(at(sim, "mo.th", 4)).toBeCloseTo(1, 2);
  });
});

describe("situações físicas", () => {
  const sit = (id: string) => {
    const s = SITUATIONS.find((x) => x.id === id)!;
    return run(s.make());
  };
  const finalOf = (sim: Simulation, id: string) => at(sim, id, sim.project.simulation.tf);

  it("massa, mola e amortecedor: deslocamento final F/k", () => {
    const sim = sit("msd");
    expect(finalOf(sim, "m.x")).toBeCloseTo(5 / 100, 3);
  });
  it("suspensão: o chassi acompanha o degrau de 10 cm da pista", () => {
    const sim = sit("quarter-car");
    expect(finalOf(sim, "mc.x")).toBeCloseTo(0.1, 3);
    expect(finalOf(sim, "alt.out")).toBeCloseTo(0.1, 6);
  });
  it("eixo flexível: velocidade final τ/b nos dois volantes", () => {
    const sim = sit("flex-shaft");
    expect(finalOf(sim, "j1.w")).toBeCloseTo(1 / 0.2, 2);
    expect(finalOf(sim, "j2.w")).toBeCloseTo(1 / 0.2, 2);
  });
  it("RLC: tensão final igual à da fonte", () => {
    const sim = sit("rlc");
    expect(finalOf(sim, "c.v")).toBeCloseTo(10, 4);
  });
  it("filtros RC: ganho de cada filtro na frequência de 1,6 Hz", () => {
    const sim = sit("rc-filters");
    const g = 1 / Math.sqrt(1 + (2 * Math.PI * 1.6 * 0.1) ** 2);
    let lo = 0,
      hi = 0;
    for (let t = 2; t <= 3; t += 0.001) {
      lo = Math.max(lo, Math.abs(at(sim, "c1.v", t)));
      hi = Math.max(hi, Math.abs(at(sim, "r2.v", t)));
    }
    expect(lo / 5).toBeCloseTo(g, 2);
    expect(hi / 5).toBeCloseTo(Math.sqrt(1 - g * g), 2);
  });
  it("motor com carga: velocidade em regime K·V/(K² + Ra·b)", () => {
    const sim = sit("dc-motor");
    expect(finalOf(sim, "mo.w")).toBeCloseTo((0.1 * 12) / (0.01 + 2 * 0.001), 0);
  });
  it("servo: o ângulo chega à referência", () => {
    const sim = sit("servo");
    expect(finalOf(sim, "mo.th")).toBeCloseTo(1, 2);
  });
  it("servo: torque de carga ao vivo é rejeitado pela ação integral", () => {
    const s = SITUATIONS.find((x) => x.id === "servo")!.make();
    const sim = new Simulation(s);
    sim.advanceTo(3);
    expect(sim.setParam("man", "value", 0.1).ok).toBe(true);
    sim.runToEnd();
    expect(sim.status).toBe("finished");
    expect(at(sim, "mo.th", 3.5)).toBeGreaterThan(1.05);
    expect(at(sim, "mo.th", 8)).toBeCloseTo(1, 1);
  });
  it("redutor: velocidade da carga é 1/N da do motor e regime bate com o cálculo", () => {
    const sim = sit("geared-motor");
    const wm = finalOf(sim, "mo.w");
    expect(wm).toBeCloseTo((0.1 * 12) / (0.01 + 2 * (0.001 + 0.5 / 100)), 1);
    expect(finalOf(sim, "jl.w")).toBeCloseTo(wm / 10, 4);
  });
});
