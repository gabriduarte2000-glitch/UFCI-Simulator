// Situações montadas com CIs: semáforo (4017) e refrigerador com compressor protegido (74123).

import { build } from "./examples";
import type { ProjectIR } from "./types";

/** Semáforo de veículos (3 LEDs) e de pedestres (2 LEDs), sequenciado por um 4017 e portas OU. */
export function trafficLight(): ProjectIR {
  const q = (i: number) => `Q${i}`;
  return build(
    "Semáforo de veículos e pedestres com CI 4017",
    [
      { id: "ck", type: "dig.clock", label: "Clock 1 Hz", params: { f: 1 }, pos: [0, 160] },
      { id: "u", type: "ic.4017", label: "4017 (sequenciador)", pos: [200, 40] },
      { id: "vg", type: "dig.or", label: "Veículo verde (Q0 a Q3)", params: { n: 4 }, pos: [520, 0] },
      { id: "vr", type: "dig.or", label: "Veículo vermelho (Q5 a Q9)", params: { n: 5 }, pos: [520, 240] },
      { id: "pg", type: "dig.or", label: "Pedestre verde (Q6 a Q8)", params: { n: 3 }, pos: [520, 440] },
      { id: "pn", type: "dig.not", label: "Pedestre vermelho", pos: [700, 460] },
      { id: "lvg", type: "dig.led", label: "Veículos: verde", params: { color: "green" }, pos: [760, 0] },
      { id: "lvy", type: "dig.led", label: "Veículos: amarelo", params: { color: "yellow" }, pos: [760, 100] },
      { id: "lvr", type: "dig.led", label: "Veículos: vermelho", params: { color: "red" }, pos: [760, 240] },
      { id: "lpg", type: "dig.led", label: "Pedestres: verde", params: { color: "green" }, pos: [900, 400] },
      { id: "lpr", type: "dig.led", label: "Pedestres: vermelho", params: { color: "red" }, pos: [900, 500] },
      { id: "scope", type: "sink.scope", label: "Fases do semáforo", pos: [1000, 160] },
    ],
    [
      ["ck", "y", "u", "CLK"],
      ["u", q(0), "vg", "a"], ["u", q(1), "vg", "b"], ["u", q(2), "vg", "c"], ["u", q(3), "vg", "d"],
      ["u", q(5), "vr", "a"], ["u", q(6), "vr", "b"], ["u", q(7), "vr", "c"], ["u", q(8), "vr", "d"], ["u", q(9), "vr", "e"],
      ["u", q(6), "pg", "a"], ["u", q(7), "pg", "b"], ["u", q(8), "pg", "c"],
      ["pg", "y", "pn", "a"],
      ["vg", "y", "lvg", "a"], ["u", q(4), "lvy", "a"], ["vr", "y", "lvr", "a"],
      ["pg", "y", "lpg", "a"], ["pn", "y", "lpr", "a"],
      ["vg", "y", "scope", "in1"], ["u", q(4), "scope", "in2"], ["vr", "y", "scope", "in3"], ["pg", "y", "scope", "in4"],
    ],
    { tf: 25, solver: "rk4", h: 0.01 },
  );
}

/** Refrigerador: termostato com histerese e compressor protegido contra partida repetida por um monoestável 74123. */
export function fridgeCompressor(): ProjectIR {
  return build(
    "Refrigerador com compressor protegido (74123)",
    [
      { id: "tamb", type: "signal.constant", label: "Ambiente (°C)", params: { value: 25 }, pos: [0, 280] },
      { id: "door", type: "signal.manual", label: "Porta aberta (0 ou 1)", params: { value: 0, min: 0, max: 1 }, pos: [0, 400] },
      { id: "dg", type: "math.gain", label: "Calor da porta (10 °C)", params: { K: 10 }, pos: [240, 410] },
      { id: "tm", type: "dig.comparator", label: "Termostato (4 °C ± 1)", params: { th: 4, hyst: 2, invert: false, y0: 0 }, pos: [0, 40] },
      { id: "hi", type: "dig.switch", label: "B = 1", params: { on: true }, pos: [200, 200] },
      { id: "mono", type: "ic.74123", label: "74123 (bloqueio 120 s)", params: { R1: 1000, C1: 430 }, pos: [420, 40] },
      { id: "and", type: "dig.and", label: "Compressor = pedido · não bloqueado", pos: [700, 60] },
      { id: "lc", type: "dig.led", label: "Compressor ligado", params: { color: "green" }, pos: [900, 40] },
      { id: "lb", type: "dig.led", label: "Bloqueio ativo", params: { color: "yellow" }, pos: [900, 140] },
      { id: "cg", type: "math.gain", label: "Efeito do compressor (−30 °C)", params: { K: -30 }, pos: [700, 250] },
      { id: "sum", type: "math.sum", label: "Temperatura de equilíbrio", params: { signs: "+++" }, pos: [900, 300] },
      { id: "cab", type: "control.lag", label: "Interior (τ = 600 s)", params: { K: 1, tau: 600, y0: 20 }, pos: [1100, 300] },
      { id: "scope", type: "sink.scope", label: "Temperatura, pedido e compressor", pos: [1340, 160] },
    ],
    [
      ["cab", "out", "tm", "in"],
      ["tm", "y", "mono", "n1A"],
      ["hi", "y", "mono", "1B"],
      ["tm", "y", "and", "a"],
      ["mono", "n1Q", "and", "b"],
      ["and", "y", "lc", "a"],
      ["mono", "1Q", "lb", "a"],
      ["and", "y", "cg", "in"],
      ["door", "out", "dg", "in"],
      ["tamb", "out", "sum", "in1"],
      ["dg", "out", "sum", "in2"],
      ["cg", "out", "sum", "in3"],
      ["sum", "out", "cab", "in"],
      ["cab", "out", "scope", "in1"],
      ["tm", "y", "scope", "in2"],
      ["and", "y", "scope", "in3"],
    ],
    { tf: 3600, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Semáforo no estilo ladder: quatro temporizadores TON em cadeia, com os tempos digitados à mão. */
export function trafficLadder(): ProjectIR {
  return build(
    "Semáforo com temporizadores TON (estilo ladder)",
    [
      { id: "t1", type: "dig.ton", label: "T1: verde dos veículos (s)", params: { PT: 10 }, pos: [220, 0] },
      { id: "t2", type: "dig.ton", label: "T2: amarelo (s)", params: { PT: 3 }, pos: [220, 140] },
      { id: "t3", type: "dig.ton", label: "T3: todos vermelhos (s)", params: { PT: 2 }, pos: [220, 280] },
      { id: "t4", type: "dig.ton", label: "T4: verde dos pedestres (s)", params: { PT: 8 }, pos: [220, 420] },
      { id: "n4", type: "dig.not", label: "Reinício: NÃO T4", pos: [0, 40] },
      { id: "n1", type: "dig.not", label: "NÃO T1", pos: [460, 0] },
      { id: "n2", type: "dig.not", label: "NÃO T2", pos: [460, 140] },
      { id: "n4b", type: "dig.not", label: "NÃO T4", pos: [460, 420] },
      { id: "ay", type: "dig.and", label: "Amarelo = T1 e não T2", pos: [620, 90] },
      { id: "ap", type: "dig.and", label: "Pedestre verde = T3 e não T4", pos: [620, 360] },
      { id: "np", type: "dig.not", label: "Pedestre vermelho", pos: [800, 400] },
      { id: "lvg", type: "dig.led", label: "Veículos: verde", params: { color: "green" }, pos: [800, 0] },
      { id: "lvy", type: "dig.led", label: "Veículos: amarelo", params: { color: "yellow" }, pos: [800, 90] },
      { id: "lvr", type: "dig.led", label: "Veículos: vermelho", params: { color: "red" }, pos: [800, 200] },
      { id: "lpg", type: "dig.led", label: "Pedestres: verde", params: { color: "green" }, pos: [960, 340] },
      { id: "lpr", type: "dig.led", label: "Pedestres: vermelho", params: { color: "red" }, pos: [960, 440] },
      { id: "scope", type: "sink.scope", label: "Fases", pos: [1100, 180] },
    ],
    [
      ["t4", "q", "n4", "a"],
      ["n4", "y", "t1", "in"],
      ["t1", "q", "t2", "in"],
      ["t2", "q", "t3", "in"],
      ["t3", "q", "t4", "in"],
      ["t1", "q", "n1", "a"],
      ["t2", "q", "n2", "a"],
      ["t4", "q", "n4b", "a"],
      ["t1", "q", "ay", "a"],
      ["n2", "y", "ay", "b"],
      ["t3", "q", "ap", "a"],
      ["n4b", "y", "ap", "b"],
      ["ap", "y", "np", "a"],
      ["n1", "y", "lvg", "a"],
      ["ay", "y", "lvy", "a"],
      ["t2", "q", "lvr", "a"],
      ["ap", "y", "lpg", "a"],
      ["np", "y", "lpr", "a"],
      ["n1", "y", "scope", "in1"],
      ["ay", "y", "scope", "in2"],
      ["t2", "q", "scope", "in3"],
      ["ap", "y", "scope", "in4"],
    ],
    { tf: 60, solver: "rk4", h: 0.01 },
  );
}
