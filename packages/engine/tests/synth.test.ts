import { describe, expect, it } from "vitest";
import { parseEquation, parseStateSpace, realizations, synthesize, verifySynthesis, Simulation } from "../src";

function model(t: string) {
  const r = parseEquation(t);
  if (!r.ok) throw new Error(r.error);
  return r.model;
}

describe("leitura de equações", () => {
  it("função de transferência", () => {
    const m = model("H(s) = (s+2)/(s^2+3s+2)");
    expect(m.num).toEqual([1, 2]);
    expect(m.den).toEqual([1, 3, 2]);
  });
  it("EDO com apóstrofos", () => {
    const m = model("y'' + 3y' + 2y = u");
    expect(m.den).toEqual([1, 3, 2]);
    expect(m.num).toEqual([0, 0, 1].slice(2));
    expect(m.inName).toBe("u");
  });
  it("EDO com derivadas na entrada e coeficientes", () => {
    const m = model("2*y'' + 4y' + 10y = 6u' + 3u");
    expect(m.den[0]).toBe(1);
    expect(m.den[1]).toBeCloseTo(2);
    expect(m.den[2]).toBeCloseTo(5);
    expect(m.num[0]).toBeCloseTo(3);
    expect(m.num[1]).toBeCloseTo(1.5);
  });
  it("notação dy/dt, vírgula decimal e (t)", () => {
    const m = model("d2x(t)/dt2 + 0,5 dx/dt + 4 x = F");
    expect(m.den).toEqual([1, 0.5, 4]);
    expect(m.inName).toBe("F");
    expect(m.outName).toBe("x");
  });
  it("Y/U = ...", () => {
    const m = model("Y(s)/U(s) = 10/(s^2+2s+10)");
    expect(m.num).toEqual([10]);
    expect(m.outName).toBe("Y");
  });
  it("erros claros", () => {
    expect(parseEquation("y'' + y = ").ok).toBe(false);
    expect(parseEquation("y*u = 1").ok).toBe(false);
    const r = parseEquation("s^3/(s+1)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/imprópria/);
    expect(parseEquation("a + b").ok).toBe(false);
  });
  it("espaço de estados vira função de transferência", () => {
    const r = parseStateSpace("0 1; -2 -3", "0; 1", "1 0", "0");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model.den[1]).toBeCloseTo(3);
      expect(r.model.den[2]).toBeCloseTo(2);
      expect(r.model.num).toEqual([1]);
    }
  });
});

const CASES: [string, string[]][] = [
  ["y'' + 3y' + 2y = 2u", ["tf", "ss", "integrators", "mech2", "rlc-c"]],
  ["x'' + 2x' + 100x = 5F", ["integrators", "mech2", "rlc-c"]],
  ["y' + 4y = 8u", ["integrators", "mech1", "rc-lp"]],
  ["H(s) = 5s/(2s+10)", ["integrators", "rc-hp"]],
  ["H(s) = 3s/(s^2+2s+25)", ["integrators", "rlc-r"]],
  ["H(s) = (s+2)/(s^3+4s^2+6s+4)", ["tf", "ss", "integrators"]],
  ["H(s) = (s^2+1)/(s^2+3s+2)", ["integrators", "ss"]],
];

describe("realizações conferem com a equação", () => {
  for (const [text, ids] of CASES) {
    for (const id of ids) {
      it(`${text} → ${id}`, () => {
        const m = model(text);
        const list = realizations(m);
        expect(list.find((r) => r.id === id)?.available, list.find((r) => r.id === id)?.why).toBe(true);
        const s = synthesize(m, id as never);
        const sim = new Simulation(s.ir, { keepSeries: false });
        expect(sim.compiled, JSON.stringify(sim.diagnostics)).toBeTruthy();
        const v = verifySynthesis(m, s);
        expect(v.ok, v.message).toBe(true);
      });
    }
  }
  it("indisponível quando não serve", () => {
    const list = realizations(model("y'' + 3y' + 2y = u + u'"));
    expect(list.find((r) => r.id === "mech2")?.available).toBe(false);
    expect(list.find((r) => r.id === "rlc-c")?.available).toBe(false);
  });
  it("espaço de estados digitado usa as matrizes originais", () => {
    const r = parseStateSpace("0 1; -2 -3", "0; 1", "1 0", "0");
    if (!r.ok) throw new Error(r.error);
    const s = synthesize(r.model, "ss");
    expect(s.ir.components.find((c) => c.type === "control.ss")?.params.A.value).toBe("0 1; -2 -3");
    expect(verifySynthesis(r.model, s).ok).toBe(true);
  });
});
