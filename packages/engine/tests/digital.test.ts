import { describe, expect, it } from "vitest";
import { Simulation } from "../src";
import { mk, sigIndex } from "./helpers";

const run = (p: ReturnType<typeof mk>) => {
  const sim = new Simulation(p);
  expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  sim.runToEnd();
  expect(sim.status).toBe("finished");
  return sim;
};

/** Valor mantido: último ponto registrado com tempo menor ou igual a t. */
const held = (sim: Simulation, id: string, t: number) => {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  let v = ys[0];
  for (let i = 0; i < ts.length && ts[i] <= t + 1e-12; i++) v = ys[i];
  return v;
};
/** Instantes em que o sinal muda. */
const changes = (sim: Simulation, id: string) => {
  const j = sigIndex(sim, id);
  const ts = sim.series.timeView();
  const ys = sim.series.colView(j);
  const out: number[] = [];
  for (let i = 1; i < ts.length; i++) if (ys[i] !== ys[i - 1]) out.push(ts[i]);
  return out;
};

describe("portas lógicas", () => {
  it("tabela verdade da NAND e da XOR com duas chaves", () => {
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const sim = run(
        mk(
          [
            { id: "a", type: "dig.switch", params: { on: !!a } },
            { id: "b", type: "dig.switch", params: { on: !!b } },
            { id: "n", type: "dig.nand" },
            { id: "x", type: "dig.xor" },
          ],
          [["a", "y", "n", "a"], ["b", "y", "n", "b"], ["a", "y", "x", "a"], ["b", "y", "x", "b"]],
          { tf: 1 },
        ),
      );
      expect(held(sim, "n.y", 1)).toBe(a && b ? 0 : 1);
      expect(held(sim, "x.y", 1)).toBe(a ^ b);
    }
  });

  it("porta com 3 entradas e inversor", () => {
    const sim = run(
      mk(
        [
          { id: "a", type: "dig.switch", params: { on: true } },
          { id: "b", type: "dig.switch", params: { on: true } },
          { id: "c", type: "dig.switch", params: { on: false } },
          { id: "g", type: "dig.and", params: { n: 3 } },
          { id: "i", type: "dig.not" },
        ],
        [["a", "y", "g", "a"], ["b", "y", "g", "b"], ["c", "y", "g", "c"], ["g", "y", "i", "a"]],
        { tf: 1 },
      ),
    );
    expect(held(sim, "g.y", 1)).toBe(0);
    expect(held(sim, "i.y", 1)).toBe(1);
  });

  it("latch SR com duas portas NOR em realimentação cruzada guarda o bit", () => {
    const sim = run(
      mk(
        [
          { id: "s", type: "signal.pulse", params: { hi: 1, lo: 0, period: 100, duty: 1, delay: 1 } },
          { id: "r", type: "signal.pulse", params: { hi: 1, lo: 0, period: 100, duty: 1, delay: 5 } },
          { id: "n1", type: "dig.nor" },
          { id: "n2", type: "dig.nor" },
        ],
        [
          ["r", "out", "n1", "a"],
          ["n2", "y", "n1", "b"],
          ["s", "out", "n2", "a"],
          ["n1", "y", "n2", "b"],
        ],
        { tf: 8 },
      ),
    );
    expect(held(sim, "n1.y", 0.5) + held(sim, "n2.y", 0.5)).toBe(1); // estado qualquer, mas estável
    expect(held(sim, "n1.y", 3)).toBe(1); // set
    expect(held(sim, "n1.y", 4.5)).toBe(1); // guardou
    expect(held(sim, "n1.y", 7)).toBe(0); // reset
    expect(held(sim, "n2.y", 7)).toBe(1);
  });

  it("anel de 3 inversores oscila em tempo zero e o motor avisa", () => {
    const sim = new Simulation(
      mk(
        [
          { id: "a", type: "dig.not" },
          { id: "b", type: "dig.not" },
          { id: "c", type: "dig.not" },
        ],
        [["a", "y", "b", "a"], ["b", "y", "c", "a"], ["c", "y", "a", "a"]],
        { tf: 1 },
      ),
    );
    expect(sim.status).toBe("error");
    expect(sim.diagnostics.some((d) => d.code === "solver-event-loop")).toBe(true);
  });
});

describe("sequenciais", () => {
  it("contador de 4 bits: borda exata e contagem", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "c", type: "dig.counter", params: { bits: 4 } },
        ],
        [["ck", "y", "c", "clk"]],
        { tf: 20 },
      ),
    );
    expect(held(sim, "c.v", 0.9)).toBe(0);
    expect(held(sim, "c.v", 5.5)).toBe(5);
    expect(held(sim, "c.q0", 5.5)).toBe(1);
    expect(held(sim, "c.q1", 5.5)).toBe(0);
    expect(held(sim, "c.q2", 5.5)).toBe(1);
    expect(held(sim, "c.v", 16.5)).toBe(0); // volta a zero após 16 bordas
    expect(held(sim, "c.v", 17.5)).toBe(1);
    const ch = changes(sim, "c.v");
    expect(ch[0]).toBeCloseTo(1, 9);
    expect(ch[1]).toBeCloseTo(2, 9);
  });

  it("contador de década (módulo 10) e sentido para baixo", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "c", type: "dig.counter", params: { bits: 4, mod: 10 } },
          { id: "d", type: "dig.counter", params: { bits: 4, mod: 10, dir: "down" } },
        ],
        [["ck", "y", "c", "clk"], ["ck", "y", "d", "clk"]],
        { tf: 14 },
      ),
    );
    expect(held(sim, "c.v", 9.5)).toBe(9);
    expect(held(sim, "c.v", 10.5)).toBe(0);
    expect(held(sim, "d.v", 1.5)).toBe(9);
    expect(held(sim, "d.v", 3.5)).toBe(7);
  });

  it("reset assíncrono zera o contador", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "rs", type: "signal.pulse", params: { hi: 1, lo: 0, period: 100, duty: 1, delay: 3.2 } },
          { id: "c", type: "dig.counter", params: { bits: 4 } },
        ],
        [["ck", "y", "c", "clk"], ["rs", "out", "c", "rst"]],
        { tf: 6 },
      ),
    );
    expect(held(sim, "c.v", 3.1)).toBe(3);
    expect(held(sim, "c.v", 3.3)).toBe(0);
    expect(held(sim, "c.v", 3.9)).toBe(0); // reset ainda ativo até 4,2
    expect(held(sim, "c.v", 5.5)).toBe(1); // conta de novo depois da borda em t = 5
  });

  it("contador assíncrono (ripple) com flip-flops T em cascata", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "one", type: "dig.switch", params: { on: true } },
          { id: "f0", type: "dig.tff" },
          { id: "f1", type: "dig.tff" },
          { id: "f2", type: "dig.tff" },
        ],
        [
          ["one", "y", "f0", "t"], ["one", "y", "f1", "t"], ["one", "y", "f2", "t"],
          ["ck", "y", "f0", "clk"], ["f0", "qn", "f1", "clk"], ["f1", "qn", "f2", "clk"],
        ],
        { tf: 10 },
      ),
    );
    for (const [t, n] of [[1.5, 1], [2.5, 2], [5.5, 5], [7.5, 7], [8.5, 0]] as const) {
      const v = held(sim, "f0.q", t) + 2 * held(sim, "f1.q", t) + 4 * held(sim, "f2.q", t);
      expect(v).toBe(n);
    }
  });

  it("flip-flop D: amostra D só na borda de subida e divide a frequência por dois", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "d", type: "dig.dff" },
        ],
        [["ck", "y", "d", "clk"], ["d", "qn", "d", "d"]],
        { tf: 10 },
      ),
    );
    expect(held(sim, "d.q", 0.5)).toBe(0);
    expect(held(sim, "d.q", 1.5)).toBe(1);
    expect(held(sim, "d.q", 2.5)).toBe(0);
    expect(held(sim, "d.q", 3.5)).toBe(1);
  });

  it("registrador de deslocamento desloca o bit de entrada", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "din", type: "signal.pulse", params: { hi: 1, lo: 0, period: 100, duty: 1.5, delay: 0.5 } }, // alto de 0,5 a 2,0
          { id: "sr", type: "dig.shiftreg", params: { bits: 4 } },
        ],
        [["ck", "y", "sr", "clk"], ["din", "out", "sr", "d"]],
        { tf: 8 },
      ),
    );
    // D = 1 nas bordas de t = 1 (e não em 2: cai em 2,0, a borda de t = 2 já vê 0).
    expect(held(sim, "sr.q0", 1.5)).toBe(1);
    expect(held(sim, "sr.q1", 2.5)).toBe(1);
    expect(held(sim, "sr.q0", 2.5)).toBe(0);
    expect(held(sim, "sr.q2", 3.5)).toBe(1);
    expect(held(sim, "sr.q3", 4.5)).toBe(1);
    expect(held(sim, "sr.q3", 5.5)).toBe(0);
  });

  it("somador completo, decodificador, multiplexador", () => {
    for (const [a, b, c] of [[1, 1, 0], [1, 1, 1], [1, 0, 0], [0, 0, 0]]) {
      const sim = run(
        mk(
          [
            { id: "a", type: "dig.switch", params: { on: !!a } },
            { id: "b", type: "dig.switch", params: { on: !!b } },
            { id: "c", type: "dig.switch", params: { on: !!c } },
            { id: "add", type: "dig.adder" },
          ],
          [["a", "y", "add", "a"], ["b", "y", "add", "b"], ["c", "y", "add", "cin"]],
          { tf: 1 },
        ),
      );
      const total = a + b + c;
      expect(held(sim, "add.s", 1)).toBe(total & 1);
      expect(held(sim, "add.cout", 1)).toBe(total >> 1);
    }
    const sim = run(
      mk(
        [
          { id: "a0", type: "dig.switch", params: { on: true } },
          { id: "a1", type: "dig.switch", params: { on: true } },
          { id: "z", type: "dig.switch", params: { on: false } },
          { id: "o", type: "dig.switch", params: { on: true } },
          { id: "dec", type: "dig.decoder" },
          { id: "m", type: "dig.mux2" },
        ],
        [["a0", "y", "dec", "a0"], ["a1", "y", "dec", "a1"], ["z", "y", "m", "a"], ["o", "y", "m", "b"], ["a0", "y", "m", "sel"]],
        { tf: 1 },
      ),
    );
    expect(held(sim, "dec.y3", 1)).toBe(1);
    expect(held(sim, "dec.y0", 1) + held(sim, "dec.y1", 1) + held(sim, "dec.y2", 1)).toBe(0);
    expect(held(sim, "m.y", 1)).toBe(1);
  });
});

describe("interface analógico/digital", () => {
  it("comparador com histerese: liga e desliga em limiares diferentes, no instante exato", () => {
    const sim = run(
      mk(
        [
          { id: "s", type: "signal.sine", params: { amp: 2, freq: 0.5, offset: 0, phase: 0 } },
          { id: "c", type: "dig.comparator", params: { th: 0, hyst: 1 } },
        ],
        [["s", "out", "c", "in"]],
        { tf: 4, h: 0.01 },
      ),
    );
    // sin(2π·0,5·t)·2 = 0,5 em t = asin(0,25)/π ≈ 0,0804; sobe: liga em 0,5. Desce: desliga em -0,5.
    const ch = changes(sim, "c.y");
    expect(ch[0]).toBeCloseTo(Math.asin(0.25) / Math.PI, 5);
    expect(ch[1]).toBeCloseTo(1 + Math.asin(0.25) / Math.PI, 5);
    expect(held(sim, "c.y", 0.5)).toBe(1);
    expect(held(sim, "c.y", 1.5)).toBe(0);
  });

  it("conversor A/D e D/A: código e degrau", () => {
    const sim = run(
      mk(
        [
          { id: "ck", type: "dig.clock", params: { f: 1 } },
          { id: "v", type: "signal.constant", params: { value: 3.2 } },
          { id: "adc", type: "dig.adc", params: { bits: 4, vref: 5 } },
          { id: "dac", type: "dig.dac", params: { bits: 4, vref: 5 } },
        ],
        [
          ["ck", "y", "adc", "clk"], ["v", "out", "adc", "in"],
          ["adc", "q0", "dac", "d0"], ["adc", "q1", "dac", "d1"], ["adc", "q2", "dac", "d2"], ["adc", "q3", "dac", "d3"],
        ],
        { tf: 4 },
      ),
    );
    expect(held(sim, "adc.v", 2.5)).toBe(Math.floor((3.2 / 5) * 16)); // 10
    expect(held(sim, "dac.y", 2.5)).toBeCloseTo((5 * 10) / 16, 9);
  });
});
