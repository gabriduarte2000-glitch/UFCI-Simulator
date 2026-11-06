import { describe, expect, it } from "vitest";
import { SITUATIONS, Simulation } from "../src";
import { at } from "./helpers";

const R = Math.round;
const go = (id: string) => {
  const s = SITUATIONS.find((x) => x.id === id)!;
  const sim = new Simulation(s.make());
  expect(sim.diagnostics.filter((d) => d.severity === "error"), id).toEqual([]);
  sim.runToEnd();
  expect(sim.status, id).toBe("finished");
  return sim;
};
const col = (sim: Simulation, id: string) => {
  const j = sim.signals.findIndex((s) => s.id === id);
  expect(j, id).toBeGreaterThanOrEqual(0);
  return { t: sim.series.timeView(), y: sim.series.colView(j) };
};

describe("situações: organização", () => {
  it("toda situação tem subpasta e há pelo menos 15 novas", () => {
    expect(SITUATIONS.every((s) => s.folder && s.folder !== "Outros")).toBe(true);
    expect(SITUATIONS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(SITUATIONS.map((s) => s.id)).size).toBe(SITUATIONS.length);
  });
  it("todas rodam sem erro", () => {
    for (const s of SITUATIONS) {
      const sim = new Simulation(s.make());
      expect(sim.diagnostics.filter((d) => d.severity === "error"), s.id).toEqual([]);
    }
  });
});

describe("situações novas", () => {
  it("cruzamento: nunca dois verdes e ciclo de 30 s", () => {
    const sim = go("crossroads");
    for (let t = 0.5; t < 62; t += 0.5) {
      const ag = R(at(sim, "n1.y", t)), bg = R(at(sim, "bg.y", t));
      expect(ag + bg, `t=${t}`).toBeLessThanOrEqual(1);
      const a = ag + R(at(sim, "ay.y", t)) + R(at(sim, "t2.q", t));
      expect(a, `via A t=${t}`).toBe(1);
    }
    expect(R(at(sim, "n1.y", 5))).toBe(1);
    expect(R(at(sim, "bg.y", 20))).toBe(1);
    expect(R(at(sim, "n1.y", 35))).toBe(1);
  });
  it("botão de pedestre: verde, depois vermelho piscando, depois veículos", () => {
    const sim = go("ped-button");
    expect(R(at(sim, "m.n1Q", 10))).toBe(1);
    expect(R(at(sim, "pg.y", 18))).toBe(1);
    expect(R(at(sim, "pg.y", 23))).toBe(0);
    const seq = [] as number[];
    for (let t = 21.3; t < 24.8; t += 0.25) seq.push(R(at(sim, "pr.y", t)));
    expect(seq.includes(0) && seq.includes(1)).toBe(true);
    expect(R(at(sim, "m.n1Q", 30))).toBe(1);
    expect(R(at(sim, "pr.y", 30))).toBe(1);
  });
  it("74163 + 74138: estados do semáforo e vermelho piscando no estado 7", () => {
    const sim = go("traffic-138");
    expect(R(at(sim, "vg.y", 1.5))).toBe(1);
    expect(R(at(sim, "vy.y", 3.5))).toBe(1);
    expect(R(at(sim, "vr.y", 4.5))).toBe(1);
    expect(R(at(sim, "pg.y", 5.5))).toBe(1);
    expect(R(at(sim, "pg.y", 6.5))).toBe(1);
    expect(R(at(sim, "pg.y", 7.5))).toBe(0);
    const seq = [7.05, 7.2, 7.3, 7.45, 7.55, 7.7, 7.8, 7.95].map((t) => R(at(sim, "pr.y", t)));
    expect(seq.includes(0) && seq.includes(1)).toBe(true);
    expect(R(at(sim, "pr.y", 2.5))).toBe(1);
    expect(R(at(sim, "vg.y", 8.5))).toBe(1);
  });
  it("7490 chega a 9 e volta a 0", () => {
    const sim = go("decade-7490");
    const v = (t: number) => ["QA", "QB", "QC", "QD"].reduce((s, q, i) => s + R(at(sim, `u.${q}`, t)) * 2 ** i, 0);
    expect(v(8.7)).toBe(9);
    expect(v(9.7)).toBe(0);
  });
  it("4518: dezena sobe depois de 10 pulsos", () => {
    const sim = go("two-digits");
    const v = (u: string, t: number) => [1, 2, 3, 4].reduce((s, k, i) => s + R(at(sim, `u.${u}Q${k}`, t)) * 2 ** i, 0);
    expect(v("2", 2.6)).toBe(1);
    expect(v("1", 2.6)).toBe(0);
    expect(v("1", 2.8)).toBe(1);
  });
  it("lote: LED acende na 5ª peça e a contagem zera", () => {
    const sim = go("batch-count");
    expect(R(at(sim, "cmp.EQo", 5.5))).toBe(1);
    expect(R(at(sim, "c.QA", 6.5)) + R(at(sim, "c.QB", 6.5)) + R(at(sim, "c.QC", 6.5))).toBe(0);
  });
  it("Johnson: sequência 1000, 1100, 1110, 1111, 0111", () => {
    const sim = go("johnson");
    const w = (t: number) => ["QA", "QB", "QC", "QD"].map((q) => R(at(sim, `u.${q}`, t))).join("");
    expect([w(0.75), w(1.25), w(1.75), w(2.25), w(2.75)]).toEqual(["1000", "1100", "1110", "1111", "0111"]);
  });
  it("74164 desloca e produz algum nível alto", () => {
    const { y } = col(go("sipo-74164"), "u.QH");
    expect(Math.max(...y)).toBe(1);
  });
  it("7483 soma 5 + 3 = 8 e 7485 acha 6 < 9", () => {
    const s = go("adder-7483");
    expect(R(at(s, "u.S4", 1))).toBe(1);
    expect(R(at(s, "u.S1", 1)) + R(at(s, "u.S2", 1)) + R(at(s, "u.S3", 1))).toBe(0);
    const c = go("cmp-7485");
    expect(R(at(c, "u.LTo", 1))).toBe(1);
    expect(R(at(c, "u.GTo", 1))).toBe(0);
  });
  it("maioria 74151: 1 1 0 dá 1", () => {
    expect(R(at(go("majority"), "u.Y", 1))).toBe(1);
  });
  it("selo: liga, o motor parte 3 s depois e o Desliga zera", () => {
    const sim = go("motor-latch");
    expect(R(at(sim, "k1.q", 7))).toBe(1);
    expect(R(at(sim, "t1.q", 7))).toBe(0);
    expect(R(at(sim, "t1.q", 10))).toBe(1);
    expect(R(at(sim, "k1.q", 20))).toBe(1);
    expect(R(at(sim, "t1.q", 40))).toBe(0);
  });
  it("luz de rua acende no escuro e apaga no claro", () => {
    const sim = go("street-light");
    expect(R(at(sim, "cmp.y", 37.5))).toBe(1);
    expect(R(at(sim, "cmp.y", 12.5))).toBe(0);
  });
  it("PWM: média perto de 12 · 0,3", () => {
    expect(at(go("pwm"), "rc.out", 0.39)).toBeGreaterThan(3);
    expect(at(go("pwm"), "rc.out", 0.39)).toBeLessThan(4.2);
  });
  it("PD segue a referência e ζ = 0,2 ultrapassa", () => {
    expect(at(go("pd-position"), "pl.out", 19)).toBeCloseTo(1, 1);
    expect(at(go("damping"), "a.out", 1.14)).toBeGreaterThan(1.4);
    expect(at(go("damping"), "c.out", 5.9)).toBeLessThan(1.01);
  });
  it("bomba liga-desliga mantém o nível na faixa", () => {
    const { t, y } = col(go("tank-onoff"), "tank.h");
    const k = t.findIndex((x) => x > 250);
    const part = Array.from(y).slice(k);
    expect(Math.min(...part)).toBeGreaterThan(0.6);
    expect(Math.max(...part)).toBeLessThan(1.5);
  });
  it("estoque fica entre os pontos de reposição", () => {
    const { t, y } = col(go("stock-minmax"), "stock.level");
    const k = t.findIndex((x) => x > 60);
    const part = Array.from(y).slice(k);
    expect(Math.min(...part)).toBeGreaterThan(200);
    expect(Math.max(...part)).toBeLessThan(420);
  });
});
