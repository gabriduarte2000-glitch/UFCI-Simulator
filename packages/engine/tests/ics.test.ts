import { describe, expect, it } from "vitest";
import { allDatasheets, allDefs, searchComponents, Simulation } from "../src";
import { at, mk } from "./helpers";

const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  return sim;
};
const R = (x: number) => Math.round(x);
const clk = (f = 1) => ({ id: "ck", type: "dig.clock", params: { f } });

describe("CIs: registro e datasheets", () => {
  it("todo CI tem datasheet com pinos coerentes", () => {
    const ds = allDatasheets();
    expect(ds.length).toBeGreaterThan(20);
    for (const d of ds) {
      expect(d.pins.length, d.part).toBeGreaterThanOrEqual(8);
      expect(new Set(d.pins.map((p) => p.n)).size, d.part).toBe(d.pins.length);
      expect(d.diagram!.items.length, d.part).toBeGreaterThan(0);
      expect(allDefs().some((x) => x.datasheet === d.part), d.part).toBe(true);
    }
  });
  it("busca por número do CI acha o componente", () => {
    expect(searchComponents("74112").hits.some((r) => r.type === "ic.74112")).toBe(true);
    expect(searchComponents("4518").hits.some((r) => r.type === "ic.4518")).toBe(true);
  });
});

describe("CIs: lógica", () => {
  it("7400 NAND: entradas soltas valem 0 e saída 1; com A=B=1 vira 0", () => {
    const sim = run(mk([{ id: "u", type: "ic.7400" }, { id: "h", type: "dig.switch", params: { on: true } }], [["h", "y", "u", "1A"], ["h", "y", "u", "1B"]], { tf: 1, solver: "rk4", h: 0.01 }));
    expect(R(at(sim, "u.1Y", 0.5))).toBe(0);
    expect(R(at(sim, "u.2Y", 0.5))).toBe(1);
  });
  it("7490 conta 0..9 com QA em CKB", () => {
    const sim = run(mk([clk(), { id: "u", type: "ic.7490" }], [["ck", "y", "u", "CKA"], ["u", "QA", "u", "CKB"]], { tf: 12.5, solver: "rk4", h: 0.01 }));
    const v = (t: number) => R(at(sim, "u.QA", t)) + 2 * R(at(sim, "u.QB", t)) + 4 * R(at(sim, "u.QC", t)) + 8 * R(at(sim, "u.QD", t));
    // clock sobe em 0, desce em 0.5: contagem muda nas bordas de descida
    expect(v(0.2)).toBe(0);
    expect(v(0.7)).toBe(1);
    expect(v(9.7)).toBe(0); // 10 quedas de clock já ocorreram em 9.5: volta a 0
    expect(v(8.7)).toBe(9);
    expect(v(10.7)).toBe(1);
  });
  it("74163 conta binário e RCO sobe em 15", () => {
    const sim = run(mk([clk(), { id: "h", type: "dig.switch", params: { on: true } }, { id: "u", type: "ic.74163" }], [["ck", "y", "u", "CLK"], ["h", "y", "u", "ENP"], ["h", "y", "u", "ENT"]], { tf: 17, solver: "rk4", h: 0.01 }));
    const v = (t: number) => R(at(sim, "u.QA", t)) + 2 * R(at(sim, "u.QB", t)) + 4 * R(at(sim, "u.QC", t)) + 8 * R(at(sim, "u.QD", t));
    expect(v(1.5)).toBe(1);
    expect(v(15.5)).toBe(15);
    expect(R(at(sim, "u.RCO", 15.5))).toBe(1);
    expect(v(16.5)).toBe(0);
  });
  it("4017 avança uma saída por clock", () => {
    const sim = run(mk([clk(), { id: "u", type: "ic.4017" }], [["ck", "y", "u", "CLK"]], { tf: 4, solver: "rk4", h: 0.01 }));
    expect(R(at(sim, "u.Q0", 0.5))).toBe(1);
    expect(R(at(sim, "u.Q1", 1.5))).toBe(1);
    expect(R(at(sim, "u.Q3", 3.5))).toBe(1);
    expect(R(at(sim, "u.Q1", 3.5))).toBe(0);
  });
  it("7474: dado D é capturado na subida e PRE/CLR soltos não travam", () => {
    const sim = run(mk([clk(), { id: "h", type: "dig.switch", params: { on: true } }, { id: "u", type: "ic.7474" }], [["ck", "y", "u", "1CLK"], ["h", "y", "u", "1D"]], { tf: 3, solver: "rk4", h: 0.01 }));
    expect(R(at(sim, "u.1Q", 1.5))).toBe(1);
    expect(R(at(sim, "u.n1Q", 1.5))).toBe(0);
  });
});

const sw = (id: string, on: boolean) => ({ id, type: "dig.switch", params: { on } });
const val = (sim: Simulation, u: string, names: string[], t: number) => names.reduce((s, n, i) => s + R(at(sim, `${u}.${n}`, t)) * 2 ** i, 0);

describe("CIs: registradores, MSI e monoestável", () => {
  it("74164 desloca o bit serial", () => {
    const sim = run(mk([clk(), sw("h", true), sw("hi", true), { id: "u", type: "ic.74164" }], [["ck", "y", "u", "CLK"], ["h", "y", "u", "A"], ["h", "y", "u", "B"]], { tf: 4, solver: "rk4", h: 0.01 }));
    expect(val(sim, "u", ["QA", "QB", "QC", "QD"], 3.5)).toBe(7);
  });
  it("74194 carrega e desloca à direita", () => {
    const sim = run(mk([clk(), sw("one", true), sw("s0", true), sw("s1", true), { id: "u", type: "ic.74194" }], [["ck", "y", "u", "CLK"], ["s0", "y", "u", "S0"], ["s1", "y", "u", "S1"], ["one", "y", "u", "A"]], { tf: 3, solver: "rk4", h: 0.01 }));
    expect(val(sim, "u", ["QA", "QB", "QC", "QD"], 1.5)).toBe(1);
  });
  it("74138 ativa só a saída endereçada (em 0)", () => {
    const sim = run(mk([sw("h", true), sw("l", false), { id: "u", type: "ic.74138" }], [["h", "y", "u", "A"], ["h", "y", "u", "G1"], ["l", "y", "u", "nG2A"], ["l", "y", "u", "nG2B"]], { tf: 1, solver: "rk4", h: 0.01 }));
    expect(R(at(sim, "u.nY1", 0.5))).toBe(0);
    expect(R(at(sim, "u.nY0", 0.5))).toBe(1);
    expect(R(at(sim, "u.nY2", 0.5))).toBe(1);
  });
  it("7447 mostra o 8 com todos os segmentos em 0", () => {
    const sim = run(mk([sw("h", true), { id: "u", type: "ic.7447" }], [["h", "y", "u", "D"]], { tf: 1, solver: "rk4", h: 0.01 }));
    expect(R(at(sim, "u.na", 0.5))).toBe(0); // entrada 1000 = 8: todos acesos
    expect(R(at(sim, "u.ng", 0.5))).toBe(0);
  });
  it("7483 soma 5 + 3", () => {
    const sim = run(mk([sw("h", true), { id: "u", type: "ic.7483" }], [["h", "y", "u", "A1"], ["h", "y", "u", "A3"], ["h", "y", "u", "B1"], ["h", "y", "u", "B2"]], { tf: 1, solver: "rk4", h: 0.01 }));
    expect(val(sim, "u", ["S1", "S2", "S3", "S4"], 0.5)).toBe(8);
  });
  it("74123 gera pulso com largura 0,28·R·C", () => {
    const sim = run(mk([clk(0.2), sw("one", true), { id: "u", type: "ic.74123", params: { R1: 100, C1: 10 } }], [["ck", "y", "u", "n1A"], ["one", "y", "u", "1B"]], { tf: 12, solver: "rk4", h: 0.01 }));
    // tw = 0,28 · 100e3 · 10e-6 = 0,28 s; clock cai em t = 2.5 (f = 0,2 Hz, duty 50%)
    expect(R(at(sim, "u.1Q", 2.6))).toBe(1);
    expect(R(at(sim, "u.1Q", 2.9))).toBe(0);
  });
});

import { fridgeCompressor, trafficLight } from "../src/situations-ics";

describe("situações com CIs", () => {
  it("semáforo 4017: pedestre pisca o vermelho antes do verde dos veículos", () => {
    const sim = run(trafficLight());
    const g = (id: string, t: number) => R(at(sim, id, t));
    for (let t = 0.1; t < 20; t += 0.1) {
      const vg = g("vg.y", t), vr = g("vr.y", t), vy = g("u.Q4", t), pg = g("pg.y", t);
      expect(vg + vy + vr, `veículos t=${t}`).toBe(1);
      expect(pg && !vr ? 1 : 0, `ped verde sem veículo vermelho t=${t}`).toBe(0);
      if (vg) expect(g("pr.y", t), `vermelho fixo com veículo verde t=${t}`).toBe(1);
      if (pg) expect(g("pr.y", t), `verde e vermelho juntos t=${t}`).toBe(0);
    }
    expect(g("vg.y", 1.5)).toBe(1);
    expect(g("u.Q4", 4.5)).toBe(1);
    expect(g("pg.y", 6.5)).toBe(1);
    expect(g("pg.y", 7.5)).toBe(1);
    expect(g("pg.y", 8.5)).toBe(0);
    const reds = [8.1, 8.3, 8.6, 8.8, 9.1, 9.3, 9.6, 9.8].map((t) => g("pr.y", t));
    expect(reds.includes(0) && reds.includes(1)).toBe(true); // pisca
    expect(g("vg.y", 10.5)).toBe(1);
  });
  it("refrigerador: esfria, respeita o bloqueio de 120 s e a porta aberta esquenta", () => {
    const sim = run(fridgeCompressor());
    const ts = sim.series.timeView();
    const comp = sim.series.colView(sim.signals.findIndex((s) => s.id.startsWith("and.y") || s.id === "scope.in3"));
    void comp;
    expect(at(sim, "cab.out", 3500)).toBeLessThan(8);
    expect(at(sim, "cab.out", 3500)).toBeGreaterThan(0);
    // compressor nunca religa antes de 120 s após desligar
    let off = -1e9;
    let prev = 0;
    for (let i = 0; i < ts.length; i++) {
      const c = Math.round(at(sim, "and.y", ts[i]));
      if (prev === 1 && c === 0) off = ts[i];
      if (prev === 0 && c === 1 && off > -1e8) expect(ts[i] - off).toBeGreaterThan(118);
      prev = c;
    }
  });
});

import { trafficLadder } from "../src/situations-ics";
describe("TON e semáforo ladder", () => {
  it("ciclo de 27 s com pedestre piscando antes do verde dos veículos", () => {
    const sim = run(trafficLadder());
    const g = (id: string, t: number) => R(at(sim, id, t));
    expect(g("n1.y", 5)).toBe(1);
    expect(g("ay.y", 11)).toBe(1);
    expect(g("t2.q", 14)).toBe(1);
    expect(g("pg.y", 16)).toBe(1);
    expect(g("pg.y", 22)).toBe(1);
    expect(g("pg.y", 24)).toBe(0);
    const seq = [] as number[];
    for (let t = 23.2; t < 26.9; t += 0.25) seq.push(g("pr.y", t));
    let changes = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) changes++;
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(g("n1.y", 28)).toBe(1);
    expect(g("pr.y", 28)).toBe(1);
    for (let t = 0.25; t < 58; t += 0.25) {
      const veh = g("n1.y", t) + g("ay.y", t) + g("t2.q", t);
      expect(veh, `t=${t}`).toBe(1);
      expect(g("pg.y", t) && !g("t2.q", t) ? 1 : 0, `ped verde com veículo livre t=${t}`).toBe(0);
      if (g("pg.y", t)) expect(g("pr.y", t), `t=${t}`).toBe(0);
    }
  });
});
