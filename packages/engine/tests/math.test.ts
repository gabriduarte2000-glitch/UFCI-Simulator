import { describe, expect, it } from "vitest";
import { analyzeMath, eigvals, polyRoots, SITUATIONS } from "../src";
import type { MathReport } from "../src";

const all = (r: MathReport) =>
  r.sections
    .flatMap((s) => [
      s.title,
      ...s.blocks.map((b) => (b.kind === "tex" ? `${b.caption ?? ""} ${b.tex}` : b.kind === "table" ? b.rows.flat().map((c) => (typeof c === "string" ? c : c.tex)).join(" ") : b.text)),
    ])
    .join("\n");
const sit = (id: string) => SITUATIONS.find((s) => s.id === id)!.make();

describe("álgebra", () => {
  it("autovalores de matrizes conhecidas", () => {
    const e = eigvals([[0, 1], [-2, -3]]).map((z) => z[0]).sort((a, b) => a - b);
    expect(e[0]).toBeCloseTo(-2, 9);
    expect(e[1]).toBeCloseTo(-1, 9);
    const c = eigvals([[0, 1], [-4, -0.4]]);
    expect(c[0][0]).toBeCloseTo(-0.2, 9);
    expect(Math.abs(c[0][1])).toBeCloseTo(Math.sqrt(4 - 0.04), 9);
    // raízes de (s+1)(s+2)(s+3)(s+4)(s+5) = s^5 + 15 s^4 + 85 s^3 + 225 s^2 + 274 s + 120
    const r = polyRoots([1, 15, 85, 225, 274, 120]).map((z) => z[0]).sort((a, b) => a - b);
    [-5, -4, -3, -2, -1].forEach((v, i) => expect(r[i]).toBeCloseTo(v, 6));
  });
});

describe("visão matemática", () => {
  it("RLC série: polos conferem com a teoria", () => {
    // R = 10, L = 0,5 H, C = 100 µF: ωn = 1/sqrt(LC) = 141,42; ζ = R/2·sqrt(C/L) = 0,0707
    const ir = sit("rlc");
    const rep = analyzeMath(ir);
    expect(rep.ok).toBe(true);
    expect(rep.order).toBe(2);
    expect(rep.stable).toBe(true);
    const txt = all(rep);
    expect(txt).toContain("Função de transferência");
    expect(txt).toContain("bmatrix");
    // G(s) = 10000 / (s² + 100 s + 10000): ωn = 100 rad/s e ζ = 0,5
    expect(txt).toContain("s^{2}+100\\,s+10000");
    expect(txt).toContain("\\omega_n=100");
    expect(txt).toContain("\\zeta=0{,}5");
  });
  it("RC de 1ª ordem: função de transferência 1/(RCs+1)", () => {
    const rep = analyzeMath(sit("rc-filters"));
    expect(rep.ok).toBe(true);
    expect(rep.order).toBe(2);
  });
  it("sistema de controle com PID tem equação característica", () => {
    const rep = analyzeMath(sit("pid-loop"));
    expect(rep.ok).toBe(true);
    expect(all(rep)).toContain("Equação característica");
  });
  it("amplificador emissor comum: pequenos sinais", () => {
    const rep = analyzeMath(sit("ce-amp"));
    expect(rep.ok).toBe(true);
    expect(all(rep)).toContain("g_m");
  });
  it("todas as situações geram relatório sem lançar erro", () => {
    for (const s of SITUATIONS) {
      const rep = analyzeMath(s.make());
      expect(rep.ok, s.id + ": " + rep.error).toBe(true);
    }
  });
});
