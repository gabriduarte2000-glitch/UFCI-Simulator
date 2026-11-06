import { describe, it, expect } from "vitest";
import { type Cell, parseLogic, minimize, verifyMin, canonical, kmapLayout, sopScene, buildLogicCircuit, logicIO, circuitTable, Simulation } from "../src/index";

describe("lógica digital", () => {
  it("lê equação e monta tabela", () => {
    const p = parseLogic("S = A'B + AC");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.vars).toEqual(["A", "B", "C"]);
    expect(p.vals).toEqual([0, 0, 1, 1, 0, 1, 0, 1]);
  });
  it("aceita ! ~ * + ^ e juxtaposição", () => {
    const a = parseLogic("!A*B + A^B");
    const b = parseLogic("A'B + A⊕B");
    expect(a.ok && b.ok && JSON.stringify(a.vals) === JSON.stringify(b.vals)).toBe(true);
  });
  it("erro em variável fora da lista", () => {
    expect(parseLogic("A+Z", ["A", "B"]).ok).toBe(false);
    expect(parseLogic("A+(B").ok).toBe(false);
  });
  it("minimiza e confere (todas as funções de 3 variáveis)", () => {
    for (let f = 0; f < 256; f++) {
      const vals = Array.from({ length: 8 }, (_, i) => ((f >> i) & 1) as 0 | 1);
      for (const kind of ["sop", "pos"] as const) {
        const m = minimize(["A", "B", "C"], vals, kind);
        expect(verifyMin(["A", "B", "C"], vals, m).ok).toBe(true);
      }
    }
  });
  it("4 variáveis aleatórias com indiferentes", () => {
    let s = 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 200; k++) {
      const vals = Array.from({ length: 16 }, () => Math.floor(rnd() * 3) as 0 | 1 | 2);
      for (const kind of ["sop", "pos"] as const) expect(verifyMin(["A", "B", "C", "D"], vals, minimize(["A", "B", "C", "D"], vals, kind)).ok).toBe(true);
    }
  });
  it("exemplo clássico", () => {
    const m = minimize(["A", "B", "C"], [0, 0, 1, 1, 0, 1, 0, 1]);
    expect(m.text).toBe("A'B + AC");
  });
  it("constantes", () => {
    expect(minimize(["A", "B"], [0, 0, 0, 0]).text).toBe("0");
    expect(minimize(["A", "B"], [1, 1, 1, 1]).text).toBe("1");
  });
  it("forma canônica e mapa", () => {
    const c = canonical(["A", "B"], [0, 1, 1, 0]);
    expect(c.sumText).toBe("A'B + AB'");
    const k = kmapLayout(["A", "B", "C", "D"]);
    expect(k.cells[0][1][3]).toBe(0b0110);
    expect(kmapLayout(["A", "B", "C", "D", "E"]).cells.length).toBe(2);
  });
  it("circuito montado dá a mesma tabela, e a leitura volta", () => {
    const p = parseLogic("A'B + AC");
    if (!p.ok) throw new Error();
    const m = minimize(p.vars, p.vals);
    expect(sopScene(p.vars, m).items.length).toBeGreaterThan(5);
    const ir = buildLogicCircuit("t", p.vars, [{ name: "S", min: m }]);
    expect(new Simulation(ir).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const io = logicIO(ir, (t) => t);
    expect(io.inputs.length).toBe(3);
    const led = io.outputs.find((o) => o.led)!;
    expect(circuitTable(ir, io.inputs.map((i) => i.id), led.signal)).toEqual(p.vals);
  });
});

import { readCircuit, SITUATIONS } from "../src/index";
describe("leitura do circuito com temporizadores", () => {
  it("semáforo ladder: equações e fases", () => {
    const r = readCircuit(SITUATIONS.find((x) => x.id.includes("ladder"))!.make());
    const g = r.outputs.find((o) => o.label === "Veículos: verde")!;
    expect(g.vars.length).toBe(1);
    expect(minimize(g.vars, g.vals).text).toBe(g.vars[0] + "'");
    const y = r.outputs.find((o) => o.label === "Veículos: amarelo")!;
    expect(minimize(y.vars, y.vals).text).toMatch(/^[A-Z][A-Z]'$/);
    expect(r.phases.length).toBeGreaterThanOrEqual(5);
    expect(r.phases.length).toBeLessThan(15);
    expect(r.phases[0].t0).toBe(0);
  });
});

describe("combinações que não ocorrem", () => {
  it("usar X simplifica e continua conferindo", () => {
    const r = readCircuit(SITUATIONS.find((x) => x.id.includes("ladder"))!.make());
    const o = r.outputs.find((x) => x.label.startsWith("Pedestres: vermelho"))!;
    expect(o.observed).not.toBeNull();
    const withX = o.vals.map((v, m) => (o.observed![m] ? v : 2)) as Cell[];
    const a = minimize(o.vars, o.vals), b = minimize(o.vars, withX);
    expect(verifyMin(o.vars, withX, b).ok).toBe(true);
    expect(b.literalCount).toBeLessThanOrEqual(a.literalCount);
    expect(b.literalCount).toBeLessThan(a.literalCount);
  });
});
