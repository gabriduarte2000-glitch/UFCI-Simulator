// Situações novas: semáforos, contadores, registradores, aritmética, comando (ladder) e aplicações.

import { build } from "./examples";
import type { ProjectIR } from "./types";

type C = { id: string; type: string; label?: string; params?: Record<string, number | string | boolean>; pos: [number, number] };
type W = [string, string, string, string];

const sw = (id: string, label: string, on: boolean, x: number, y: number): C => ({ id, type: "dig.switch", label, params: { on }, pos: [x, y] });
const led = (id: string, label: string, color: string, x: number, y: number): C => ({ id, type: "dig.led", label, params: { color }, pos: [x, y] });
const clk = (id: string, label: string, f: number, x: number, y: number, extra: Record<string, number> = {}): C => ({ id, type: "dig.clock", label, params: { f, ...extra }, pos: [x, y] });
const bitsOf = (n: number, w: number) => Array.from({ length: w }, (_, i) => ((n >> i) & 1) === 1);

/** Semáforo de cruzamento (duas vias) em ladder: quatro TON em cadeia. */
export function crossroads(): ProjectIR {
  return build(
    "Semáforo de cruzamento (duas vias) com TON",
    [
      { id: "t1", type: "dig.ton", label: "T1: verde da via A (s)", params: { PT: 12 }, pos: [220, 0] },
      { id: "t2", type: "dig.ton", label: "T2: amarelo da via A (s)", params: { PT: 3 }, pos: [220, 140] },
      { id: "t3", type: "dig.ton", label: "T3: verde da via B (s)", params: { PT: 12 }, pos: [220, 280] },
      { id: "t4", type: "dig.ton", label: "T4: amarelo da via B (s)", params: { PT: 3 }, pos: [220, 420] },
      { id: "n4", type: "dig.not", label: "NÃO T4 (reinício)", pos: [0, 40] },
      { id: "n1", type: "dig.not", label: "NÃO T1", pos: [440, 0] },
      { id: "n2", type: "dig.not", label: "NÃO T2", pos: [440, 140] },
      { id: "n3", type: "dig.not", label: "NÃO T3", pos: [440, 280] },
      { id: "ay", type: "dig.and", label: "A amarelo = T1 e não T2", pos: [600, 60] },
      { id: "bg", type: "dig.and", label: "B verde = T2 e não T3", pos: [600, 220] },
      { id: "by", type: "dig.and", label: "B amarelo = T3 e não T4", pos: [600, 360] },
      led("lag", "Via A: verde", "green", 800, 0), led("lay", "Via A: amarelo", "yellow", 800, 60), led("lar", "Via A: vermelho", "red", 800, 120),
      led("lbg", "Via B: verde", "green", 800, 220), led("lby", "Via B: amarelo", "yellow", 800, 280), led("lbr", "Via B: vermelho", "red", 800, 340),
      { id: "scope", type: "sink.scope", label: "Via A verde e B verde", pos: [980, 160] },
    ],
    [
      ["t4", "q", "n4", "a"], ["n4", "y", "t1", "in"], ["t1", "q", "t2", "in"], ["t2", "q", "t3", "in"], ["t3", "q", "t4", "in"],
      ["t1", "q", "n1", "a"], ["t2", "q", "n2", "a"], ["t3", "q", "n3", "a"],
      ["t1", "q", "ay", "a"], ["n2", "y", "ay", "b"], ["t2", "q", "bg", "a"], ["n3", "y", "bg", "b"], ["t3", "q", "by", "a"], ["n4", "y", "by", "b"],
      ["n1", "y", "lag", "a"], ["ay", "y", "lay", "a"], ["t2", "q", "lar", "a"],
      ["bg", "y", "lbg", "a"], ["by", "y", "lby", "a"], ["n2", "y", "lbr", "a"],
      ["n1", "y", "scope", "in1"], ["bg", "y", "scope", "in2"],
    ],
    { tf: 65, solver: "rk4", h: 0.01 },
  );
}

/** Travessia por botão: o monoestável 74123 libera o verde dos pedestres por um tempo fixo. */
export function pedestrianButton(): ProjectIR {
  return build(
    "Semáforo com botão de pedestre (74123)",
    [
      clk("auto", "Botão apertado (simulado: 15 s, 35 s, 55 s)", 0.05, 0, 40, { duty: 10, delay: 15 }),
      sw("btn", "Botão do pedestre (clique para apertar)", false, 0, 180),
      { id: "or", type: "dig.or", label: "Qualquer botão", pos: [200, 90] },
      sw("zero", "!A = 0", false, 200, 240),
      { id: "m", type: "ic.74123", label: "74123 (tempo de travessia ≈ 10 s)", params: { R1: 1000, C1: 36 }, pos: [400, 40] },
      led("lvg", "Veículos: verde", "green", 700, 20), led("lvr", "Veículos: vermelho", "red", 700, 100),
      led("lpg", "Pedestres: verde", "green", 700, 200), led("lpr", "Pedestres: vermelho", "red", 700, 280),
      { id: "scope", type: "sink.scope", label: "Botão e travessia", pos: [900, 120] },
    ],
    [
      ["auto", "y", "or", "a"], ["btn", "y", "or", "b"], ["or", "y", "m", "1B"], ["zero", "y", "m", "n1A"],
      ["m", "n1Q", "lvg", "a"], ["m", "1Q", "lvr", "a"], ["m", "1Q", "lpg", "a"], ["m", "n1Q", "lpr", "a"],
      ["or", "y", "scope", "in1"], ["m", "1Q", "scope", "in2"],
    ],
    { tf: 60, solver: "rk4", h: 0.01 },
  );
}

/** Semáforo com contador 74163 e decodificador 74138. */
export function trafficCounterDecoder(): ProjectIR {
  return build(
    "Semáforo com 74163 e 74138",
    [
      clk("ck", "Clock 1 Hz", 1, 0, 100), sw("one", "Nível 1", true, 0, 260), sw("zero", "Nível 0", false, 0, 340),
      { id: "c", type: "ic.74163", label: "74163 (contador)", pos: [220, 60] },
      { id: "d", type: "ic.74138", label: "74138 (decodificador)", pos: [460, 40] },
      { id: "vg", type: "dig.nand", label: "Veículo verde (estados 0 a 3)", params: { n: 4 }, pos: [740, 0] },
      { id: "vy", type: "dig.not", label: "Veículo amarelo (estado 4)", pos: [740, 120] },
      { id: "vr", type: "dig.nand", label: "Veículo vermelho (estados 5 a 7)", params: { n: 3 }, pos: [740, 200] },
      { id: "pg", type: "dig.nand", label: "Pedestre verde (estados 6 e 7)", params: { n: 2 }, pos: [740, 320] },
      { id: "pr", type: "dig.not", label: "Pedestre vermelho", pos: [920, 340] },
      led("lvg", "Veículos: verde", "green", 940, 0), led("lvy", "Veículos: amarelo", "yellow", 940, 100), led("lvr", "Veículos: vermelho", "red", 940, 200),
      led("lpg", "Pedestres: verde", "green", 1100, 300), led("lpr", "Pedestres: vermelho", "red", 1100, 400),
    ],
    [
      ["ck", "y", "c", "CLK"], ["one", "y", "c", "ENP"], ["one", "y", "c", "ENT"],
      ["c", "QA", "d", "A"], ["c", "QB", "d", "B"], ["c", "QC", "d", "C"], ["one", "y", "d", "G1"], ["zero", "y", "d", "nG2A"], ["zero", "y", "d", "nG2B"],
      ["d", "nY0", "vg", "a"], ["d", "nY1", "vg", "b"], ["d", "nY2", "vg", "c"], ["d", "nY3", "vg", "d"],
      ["d", "nY4", "vy", "a"],
      ["d", "nY5", "vr", "a"], ["d", "nY6", "vr", "b"], ["d", "nY7", "vr", "c"],
      ["d", "nY6", "pg", "a"], ["d", "nY7", "pg", "b"], ["pg", "y", "pr", "a"],
      ["vg", "y", "lvg", "a"], ["vy", "y", "lvy", "a"], ["vr", "y", "lvr", "a"], ["pg", "y", "lpg", "a"], ["pr", "y", "lpr", "a"],
    ],
    { tf: 20, solver: "rk4", h: 0.01 },
  );
}

/** Contador de década 7490 com display. */
export function decade7490(): ProjectIR {
  return build(
    "Contador de década 7490 com display",
    [
      clk("ck", "Clock 1 Hz", 1, 0, 60),
      { id: "u", type: "ic.7490", label: "7490", pos: [220, 20] },
      { id: "d", type: "dig.display7", label: "Display", pos: [480, 40] },
      { id: "scope", type: "sink.scope", label: "Valor", pos: [480, 220] },
    ],
    [["ck", "y", "u", "CKA"], ["u", "QA", "u", "CKB"], ["u", "QA", "d", "b0"], ["u", "QB", "d", "b1"], ["u", "QC", "d", "b2"], ["u", "QD", "d", "b3"], ["u", "QA", "scope", "in1"], ["u", "QD", "scope", "in2"]],
    { tf: 25, solver: "rk4", h: 0.01 },
  );
}

/** Dois dígitos (00 a 99) com o 4518 duplo. */
export function twoDigits4518(): ProjectIR {
  return build(
    "Contador de dois dígitos com 4518",
    [
      clk("ck", "Clock 4 Hz", 4, 0, 60), sw("one", "Habilita (1)", true, 0, 200),
      { id: "u", type: "ic.4518", label: "4518 (dois contadores BCD)", pos: [220, 20] },
      { id: "du", type: "dig.display7", label: "Unidades", pos: [520, 160] },
      { id: "dd", type: "dig.display7", label: "Dezenas", pos: [520, 20] },
    ],
    [
      ["ck", "y", "u", "1CLK"], ["one", "y", "u", "1EN"], ["u", "1Q4", "u", "2EN"],
      ["u", "1Q1", "du", "b0"], ["u", "1Q2", "du", "b1"], ["u", "1Q3", "du", "b2"], ["u", "1Q4", "du", "b3"],
      ["u", "2Q1", "dd", "b0"], ["u", "2Q2", "dd", "b1"], ["u", "2Q3", "dd", "b2"], ["u", "2Q4", "dd", "b3"],
    ],
    { tf: 30, solver: "rk4", h: 0.005 },
  );
}

/** Contagem de peças em lote: o 7485 compara a contagem com o tamanho do lote. */
export function batchCounter(): ProjectIR {
  const set = bitsOf(5, 4);
  return build(
    "Contagem de peças em lote (74163 e 7485)",
    [
      clk("ck", "Sensor de peças (1 Hz)", 1, 0, 80), sw("one", "Nível 1", true, 0, 220),
      { id: "c", type: "ic.74163", label: "74163 (contador)", pos: [220, 40] },
      ...set.map((v, i) => sw(`b${i}`, `Lote B${i} (peso ${2 ** i})`, v, 220, 360 + i * 70)),
      { id: "cmp", type: "ic.7485", label: "7485 (comparador): lote = 5", pos: [520, 40] },
      { id: "nc", type: "dig.not", label: "Limpar a contagem", pos: [800, 140] },
      led("lf", "Lote completo", "green", 800, 40), led("l0", "Q0", "yellow", 520, 380), led("l1", "Q1", "yellow", 620, 380), led("l2", "Q2", "yellow", 720, 380),
    ],
    [
      ["ck", "y", "c", "CLK"], ["one", "y", "c", "ENP"], ["one", "y", "c", "ENT"],
      ["c", "QA", "cmp", "A0"], ["c", "QB", "cmp", "A1"], ["c", "QC", "cmp", "A2"], ["c", "QD", "cmp", "A3"],
      ["b0", "y", "cmp", "B0"], ["b1", "y", "cmp", "B1"], ["b2", "y", "cmp", "B2"], ["b3", "y", "cmp", "B3"], ["one", "y", "cmp", "EQi"],
      ["cmp", "EQo", "lf", "a"], ["cmp", "EQo", "nc", "a"], ["nc", "y", "c", "nCLR"],
      ["c", "QA", "l0", "a"], ["c", "QB", "l1", "a"], ["c", "QC", "l2", "a"],
    ],
    { tf: 20, solver: "rk4", h: 0.01 },
  );
}

/** Contador Johnson com o registrador universal 74194. */
export function johnson74194(): ProjectIR {
  return build(
    "Contador Johnson com 74194",
    [
      clk("ck", "Clock 2 Hz", 2, 0, 60), sw("s0", "S0 = 1", true, 0, 200), sw("s1", "S1 = 0", false, 0, 280),
      { id: "u", type: "ic.74194", label: "74194", pos: [220, 20] },
      { id: "n", type: "dig.not", label: "Realimenta QD invertido", pos: [220, 420] },
      led("l0", "QA", "red", 520, 20), led("l1", "QB", "red", 520, 90), led("l2", "QC", "red", 520, 160), led("l3", "QD", "red", 520, 230),
    ],
    [
      ["ck", "y", "u", "CLK"], ["s0", "y", "u", "S0"], ["s1", "y", "u", "S1"], ["u", "QD", "n", "a"], ["n", "y", "u", "SR"],
      ["u", "QA", "l0", "a"], ["u", "QB", "l1", "a"], ["u", "QC", "l2", "a"], ["u", "QD", "l3", "a"],
    ],
    { tf: 12, solver: "rk4", h: 0.01 },
  );
}

/** Conversão serial para paralelo com o 74164. */
export function serialParallel74164(): ProjectIR {
  const qs = ["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"];
  return build(
    "Serial para paralelo com 74164",
    [
      clk("data", "Dado serial (0,3 Hz)", 0.3, 0, 40, { duty: 40 }), clk("ck", "Clock de deslocamento (2 Hz)", 2, 0, 180), sw("one", "B = 1", true, 0, 320),
      { id: "u", type: "ic.74164", label: "74164", pos: [220, 40] },
      ...qs.map((q, i) => led(`l${i}`, q, i % 2 ? "green" : "red", 500 + i * 70, 120)),
    ],
    [["data", "y", "u", "A"], ["one", "y", "u", "B"], ["ck", "y", "u", "CLK"], ...qs.map((q, i): W => ["u", q, `l${i}`, "a"])],
    { tf: 20, solver: "rk4", h: 0.01 },
  );
}

/** Somador de 4 bits com o 7483. */
export function adder7483(): ProjectIR {
  const a = bitsOf(5, 4),
    b = bitsOf(3, 4);
  return build(
    "Somador de 4 bits com 7483",
    [
      ...a.map((v, i) => sw(`a${i}`, `A${i + 1}`, v, 0, i * 70)), ...b.map((v, i) => sw(`b${i}`, `B${i + 1}`, v, 0, 320 + i * 70)), sw("c0", "Vem-um C0", false, 0, 620),
      { id: "u", type: "ic.7483", label: "7483 (A + B)", pos: [260, 120] },
      { id: "d", type: "dig.display7", label: "Soma (decimal)", pos: [560, 80] }, led("lc", "Vai-um C4", "red", 560, 240),
    ],
    [
      ...[0, 1, 2, 3].flatMap((i): W[] => [[`a${i}`, "y", "u", `A${i + 1}`], [`b${i}`, "y", "u", `B${i + 1}`]]),
      ["c0", "y", "u", "C0"],
      ["u", "S1", "d", "b0"], ["u", "S2", "d", "b1"], ["u", "S3", "d", "b2"], ["u", "S4", "d", "b3"], ["u", "C4", "lc", "a"],
    ],
    { tf: 2, solver: "rk4", h: 0.01 },
  );
}

/** Comparador de magnitude 7485. */
export function comparator7485(): ProjectIR {
  const a = bitsOf(6, 4),
    b = bitsOf(9, 4);
  return build(
    "Comparador de magnitude 7485",
    [
      ...a.map((v, i) => sw(`a${i}`, `A${i} (peso ${2 ** i})`, v, 0, i * 70)), ...b.map((v, i) => sw(`b${i}`, `B${i} (peso ${2 ** i})`, v, 0, 320 + i * 70)), sw("one", "EQi = 1", true, 0, 620),
      { id: "u", type: "ic.7485", label: "7485", pos: [260, 120] },
      led("lg", "A > B", "green", 560, 60), led("le", "A = B", "yellow", 560, 140), led("ll", "A < B", "red", 560, 220),
    ],
    [
      ...[0, 1, 2, 3].flatMap((i): W[] => [[`a${i}`, "y", "u", `A${i}`], [`b${i}`, "y", "u", `B${i}`]]),
      ["one", "y", "u", "EQi"], ["u", "GTo", "lg", "a"], ["u", "EQo", "le", "a"], ["u", "LTo", "ll", "a"],
    ],
    { tf: 2, solver: "rk4", h: 0.01 },
  );
}

/** Função de maioria de 3 entradas com um multiplexador 74151. */
export function majority74151(): ProjectIR {
  const d = [0, 0, 0, 1, 0, 1, 1, 1];
  return build(
    "Função maioria com multiplexador 74151",
    [
      sw("a", "A (peso 1)", true, 0, 0), sw("b", "B (peso 2)", true, 0, 80), sw("c", "C (peso 4)", false, 0, 160), sw("zero", "!G = 0", false, 0, 240),
      ...d.map((v, i) => sw(`d${i}`, `D${i} = ${v}`, v === 1, 220, i * 70 - 40)),
      { id: "u", type: "ic.74151", label: "74151", pos: [480, 80] },
      led("ly", "Y: maioria", "green", 760, 80),
    ],
    [
      ["a", "y", "u", "A"], ["b", "y", "u", "B"], ["c", "y", "u", "C"], ["zero", "y", "u", "nG"],
      ...d.map((_, i): W => [`d${i}`, "y", "u", `D${i}`]), ["u", "Y", "ly", "a"],
    ],
    { tf: 2, solver: "rk4", h: 0.01 },
  );
}

/** Partida e parada de motor com selo (latch SR) e retardo na partida (TON). */
export function motorLatch(): ProjectIR {
  return build(
    "Partida e parada de motor com selo e TON",
    [
      clk("start", "Botão Liga (a cada 50 s, em 5 s)", 0.02, 0, 40, { duty: 4, delay: 5 }), clk("stop", "Botão Desliga (a cada 50 s, em 30 s)", 0.02, 0, 200, { duty: 4, delay: 30 }),
      { id: "k1", type: "dig.srlatch", label: "K1 (selo)", pos: [260, 100] },
      { id: "t1", type: "dig.ton", label: "T1: retardo de partida (s)", params: { PT: 3 }, pos: [500, 100] },
      led("lk", "K1 energizado", "yellow", 760, 40), led("lm", "Motor ligado", "green", 760, 140),
      { id: "scope", type: "sink.scope", label: "Selo e motor", pos: [760, 260] },
    ],
    [["start", "y", "k1", "s"], ["stop", "y", "k1", "r"], ["k1", "q", "t1", "in"], ["k1", "q", "lk", "a"], ["t1", "q", "lm", "a"], ["k1", "q", "scope", "in1"], ["t1", "q", "scope", "in2"]],
    { tf: 60, solver: "rk4", h: 0.01 },
  );
}

/** Luz de rua automática com comparador de histerese. */
export function streetLight(): ProjectIR {
  return build(
    "Luz de rua automática",
    [
      { id: "sol", type: "signal.sine", label: "Luz do ambiente (%)", params: { amp: 50, freq: 0.02, offset: 50 }, pos: [0, 60] },
      { id: "cmp", type: "dig.comparator", label: "Escuro abaixo de 30 % (histerese 10)", params: { th: 30, hyst: 10, invert: true, y0: 0 }, pos: [260, 60] },
      led("lamp", "Lâmpada", "yellow", 520, 60),
      { id: "scope", type: "sink.scope", label: "Luz e lâmpada", pos: [520, 200] },
    ],
    [["sol", "out", "cmp", "in"], ["cmp", "y", "lamp", "a"], ["sol", "out", "scope", "in1"], ["cmp", "y", "scope", "in2"]],
    { tf: 100, solver: "rk4", h: 0.02 },
  );
}

/** PWM por comparação com onda triangular e filtragem. */
export function pwmFilter(): ProjectIR {
  return build(
    "PWM e filtro passa-baixa",
    [
      { id: "ref", type: "signal.manual", label: "Razão cíclica desejada", params: { value: 0.3, min: 0, max: 1 }, pos: [0, 40] },
      { id: "tri", type: "signal.triangle", label: "Portadora (50 Hz)", params: { hi: 1, lo: 0, period: 0.02 }, pos: [0, 200] },
      { id: "cmp", type: "route.compare", label: "Ref > portadora", params: { op: ">" }, pos: [260, 100] },
      { id: "g", type: "math.gain", label: "Tensão de 12 V", params: { K: 12 }, pos: [480, 100] },
      { id: "rc", type: "control.lag", label: "Filtro RC (τ = 30 ms)", params: { K: 1, tau: 0.03, y0: 0 }, pos: [700, 100] },
      { id: "scope", type: "sink.scope", label: "PWM e média", pos: [940, 100] },
    ],
    [["ref", "out", "cmp", "in1"], ["tri", "out", "cmp", "in2"], ["cmp", "out", "g", "in"], ["g", "out", "rc", "in"], ["g", "out", "scope", "in1"], ["rc", "out", "scope", "in2"]],
    { tf: 0.4, solver: "rk4", h: 0.0002 },
  );
}

/** Posicionamento com controlador PD. */
export function pdPosition(): ProjectIR {
  return build(
    "Posicionamento com controlador PD",
    [
      { id: "ref", type: "signal.step", label: "Posição desejada", params: { t_step: 1, v0: 0, v1: 1 }, pos: [0, 80] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [220, 100] },
      { id: "pd", type: "control.pd", label: "PD", params: { Kp: 8, Kd: 4, N: 20 }, pos: [420, 90] },
      { id: "pl", type: "control.tf", label: "Carga: 1 / (s² + 0,5 s)", params: { num: "1", den: "1 0.5 0" }, pos: [660, 90] },
      { id: "scope", type: "sink.scope", label: "Posição e comando", pos: [900, 90] },
    ],
    [["ref", "out", "soma", "in1"], ["soma", "out", "pd", "in"], ["pd", "out", "pl", "in"], ["pl", "out", "soma", "in2"], ["pl", "out", "scope", "in1"], ["ref", "out", "scope", "in2"], ["pd", "out", "scope", "in3"]],
    { tf: 20, solver: "rk4", h: 0.01 },
  );
}

/** Mesmo degrau em três sistemas de 2ª ordem com amortecimentos diferentes. */
export function dampingCompare(): ProjectIR {
  return build(
    "Efeito do amortecimento (ζ) na 2ª ordem",
    [
      { id: "u", type: "signal.step", label: "Degrau", params: { t_step: 0.5, v0: 0, v1: 1 }, pos: [0, 160] },
      { id: "a", type: "control.lp2", label: "ζ = 0,2", params: { K: 1, wn: 5, zeta: 0.2 }, pos: [260, 0] },
      { id: "b", type: "control.lp2", label: "ζ = 0,7", params: { K: 1, wn: 5, zeta: 0.7 }, pos: [260, 160] },
      { id: "c", type: "control.lp2", label: "ζ = 1,5", params: { K: 1, wn: 5, zeta: 1.5 }, pos: [260, 320] },
      { id: "scope", type: "sink.scope", label: "Respostas", pos: [560, 130] },
    ],
    [["u", "out", "a", "in"], ["u", "out", "b", "in"], ["u", "out", "c", "in"], ["a", "out", "scope", "in1"], ["b", "out", "scope", "in2"], ["c", "out", "scope", "in3"], ["u", "out", "scope", "in4"]],
    { tf: 6, solver: "rk4", h: 0.005 },
  );
}

/** Nível de tanque com bomba liga-desliga e histerese. */
export function tankOnOff(): ProjectIR {
  return build(
    "Nível de tanque com bomba liga-desliga",
    [
      { id: "cmp", type: "dig.comparator", label: "Chave de nível (liga abaixo de 0,8 m, desliga acima de 1,2 m)", params: { th: 1, hyst: 0.4, invert: true, y0: 1 }, pos: [220, 40] },
      { id: "g", type: "math.gain", label: "Comando da bomba (%)", params: { K: 100 }, pos: [460, 60] },
      { id: "pump", type: "process.pump", label: "Bomba", params: { max: 150, tau: 3, p0: 0 }, pos: [680, 60] },
      { id: "dem", type: "signal.manual", label: "Consumo (L/min)", params: { value: 20, min: 0, max: 50 }, pos: [680, 240] },
      { id: "tank", type: "process.tank", label: "Tanque", params: { A: 0.1, hmax: 2, kout: 60, h0: 0.5 }, pos: [920, 40] },
      { id: "scope", type: "sink.scope", label: "Nível e bomba", pos: [1180, 60] },
    ],
    [["tank", "h", "cmp", "in"], ["cmp", "y", "g", "in"], ["g", "out", "pump", "cmd"], ["pump", "out", "tank", "qin"], ["dem", "out", "tank", "qext"], ["tank", "h", "scope", "in1"], ["g", "out", "scope", "in2"]],
    { tf: 600, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Estoque com ponto de reposição (mínimo e máximo). */
export function stockMinMax(): ProjectIR {
  const p = build(
    "Estoque com ponto de reposição",
    [
      { id: "cmp", type: "dig.comparator", label: "Repõe abaixo de 250, para acima de 350", params: { th: 300, hyst: 100, invert: true, y0: 0 }, pos: [220, 40] },
      { id: "g", type: "math.gain", label: "Reposição (un/dia)", params: { K: 80 }, pos: [460, 60] },
      { id: "stock", type: "business.stock", label: "Estoque", params: { max: 1000, x0: 500 }, pos: [700, 40] },
      { id: "dem", type: "signal.constant", label: "Demanda (un/dia)", params: { value: 40 }, pos: [460, 240] },
      { id: "scope", type: "sink.scope", label: "Estoque e reposição", pos: [960, 60] },
    ],
    [["stock", "level", "cmp", "in"], ["cmp", "y", "g", "in"], ["g", "out", "stock", "in"], ["dem", "out", "stock", "out"], ["stock", "level", "scope", "in1"], ["g", "out", "scope", "in2"]],
    { tf: 200, rtol: 1e-6, atol: 1e-8 },
  );
  p.simulation.timeUnit = "dia";
  return p;
}
