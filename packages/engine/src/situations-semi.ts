// Situações de semicondutores, amplificadores, lógica digital e CIs. Valores ilustrativos.

import { build } from "./examples";
import type { ProjectIR } from "./types";

/** Retificador de meia onda com filtro capacitivo. */
export function halfWaveRectifier(): ProjectIR {
  return build(
    "Retificador de meia onda com filtro",
    [
      { id: "u", type: "signal.sine", label: "Rede (V)", params: { amp: 10, freq: 50 }, pos: [-220, 170] },
      { id: "v", type: "elec.vsource", label: "Fonte CA", pos: [-60, 150] },
      { id: "d", type: "elec.diode", label: "Diodo", pos: [120, 30] },
      { id: "r", type: "elec.resistor", label: "Carga", params: { R: 1000 }, pos: [330, 20] },
      { id: "c", type: "elec.capacitor", label: "Filtro", params: { C: 0.0005 }, pos: [330, 170] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [200, 320] },
      { id: "scope", type: "sink.scope", label: "Entrada, saída e corrente no diodo", pos: [560, 80] },
    ],
    [
      ["u", "out", "v", "u"],
      ["v", "p", "d", "a"],
      ["d", "b", "r", "a"],
      ["d", "b", "c", "a"],
      ["r", "b", "g", "a"],
      ["c", "b", "g", "a"],
      ["v", "n", "g", "a"],
      ["u", "out", "scope", "in1"],
      ["c", "v", "scope", "in2"],
      ["d", "i", "scope", "in3"],
    ],
    { tf: 0.2, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Regulador de tensão com diodo Zener. */
export function zenerRegulator(): ProjectIR {
  return build(
    "Regulador com diodo Zener",
    [
      { id: "vin", type: "signal.manual", label: "Tensão de entrada (V)", params: { value: 12, min: 0, max: 30 }, pos: [-220, 150] },
      { id: "v", type: "elec.vsource", label: "Fonte CC", pos: [-30, 140] },
      { id: "rs", type: "elec.resistor", label: "Rs", params: { R: 470 }, pos: [130, 20] },
      { id: "z", type: "elec.zener", label: "Zener 5,1 V", params: { Vz: 5.1 }, pos: [330, 130] },
      { id: "rl", type: "elec.resistor", label: "Carga", params: { R: 1000 }, pos: [330, 20] },
      { id: "vm", type: "elec.voltmeter", label: "Tensão na carga", pos: [520, 30] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [200, 320] },
      { id: "scope", type: "sink.scope", label: "Entrada e saída", pos: [700, 60] },
    ],
    [
      ["vin", "out", "v", "u"],
      ["v", "p", "rs", "a"],
      ["rs", "b", "rl", "a"],
      ["rs", "b", "z", "b"],
      ["rs", "b", "vm", "a"],
      ["rl", "b", "g", "a"],
      ["z", "a", "g", "a"],
      ["vm", "b", "g", "a"],
      ["v", "n", "g", "a"],
      ["vin", "out", "scope", "in1"],
      ["vm", "v", "scope", "in2"],
    ],
    { tf: 0.5, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Amplificador emissor comum com divisor de tensão na base. */
export function commonEmitter(): ProjectIR {
  return build(
    "Amplificador emissor comum (BJT)",
    [
      { id: "ucc", type: "signal.constant", label: "Vcc (V)", params: { value: 12 }, pos: [-250, -40] },
      { id: "vcc", type: "elec.vsource", label: "Alimentação 12 V", pos: [-80, -60] },
      { id: "uin", type: "signal.sine", label: "Sinal (V)", params: { amp: 0.005, freq: 1000 }, pos: [-250, 330] },
      { id: "vin", type: "elec.vsource", label: "Fonte de sinal", pos: [-80, 310] },
      { id: "cin", type: "elec.capacitor", label: "Cin", params: { C: 2.2e-6 }, pos: [60, 330] },
      { id: "r1", type: "elec.resistor", label: "R1", params: { R: 47000 }, pos: [210, 80] },
      { id: "r2", type: "elec.resistor", label: "R2", params: { R: 10000 }, pos: [210, 300] },
      { id: "rc", type: "elec.resistor", label: "Rc", params: { R: 4700 }, pos: [380, 30] },
      { id: "q", type: "elec.npn", label: "Q1 NPN", params: { bf: 150 }, pos: [400, 190] },
      { id: "re", type: "elec.resistor", label: "Re", params: { R: 1000 }, pos: [560, 330] },
      { id: "ce", type: "elec.capacitor", label: "Ce (desvio)", params: { C: 2.2e-5 }, pos: [560, 430] },
      { id: "cout", type: "elec.capacitor", label: "Cout", params: { C: 2.2e-6 }, pos: [600, 60] },
      { id: "rl", type: "elec.resistor", label: "Carga", params: { R: 10000 }, pos: [760, 130] },
      { id: "vm", type: "elec.voltmeter", label: "Saída", pos: [760, 240] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [330, 520] },
      { id: "s1", type: "sink.scope", label: "Entrada (V)", pos: [-80, 450] },
      { id: "s2", type: "sink.scope", label: "Saída (V) e correntes", pos: [940, 130] },
    ],
    [
      ["ucc", "out", "vcc", "u"],
      ["uin", "out", "vin", "u"],
      ["vcc", "p", "r1", "a"],
      ["vcc", "p", "rc", "a"],
      ["vin", "p", "cin", "a"],
      ["cin", "b", "r1", "b"],
      ["cin", "b", "r2", "a"],
      ["cin", "b", "q", "b"],
      ["rc", "b", "q", "c"],
      ["rc", "b", "cout", "a"],
      ["cout", "b", "rl", "a"],
      ["cout", "b", "vm", "a"],
      ["q", "e", "re", "a"],
      ["q", "e", "ce", "a"],
      ["re", "b", "g", "a"],
      ["ce", "b", "g", "a"],
      ["r2", "b", "g", "a"],
      ["rl", "b", "g", "a"],
      ["vm", "b", "g", "a"],
      ["vin", "n", "g", "a"],
      ["vcc", "n", "g", "a"],
      ["uin", "out", "s1", "in1"],
      ["vm", "v", "s2", "in1"],
    ],
    { tf: 0.2, rtol: 1e-6, atol: 1e-9 },
  );
}

/** MOSFET como chave acendendo um LED com PWM. */
export function mosfetSwitch(): ProjectIR {
  return build(
    "MOSFET como chave com LED",
    [
      { id: "u5", type: "signal.constant", label: "Alimentação (V)", params: { value: 5 }, pos: [-240, 30] },
      { id: "vdd", type: "elec.vsource", label: "Vdd 5 V", pos: [-60, 10] },
      { id: "pwm", type: "signal.pulse", label: "Comando da porta (V)", params: { hi: 5, lo: 0, period: 1, duty: 30 }, pos: [-240, 250] },
      { id: "vg", type: "elec.vsource", label: "Fonte da porta", pos: [-60, 230] },
      { id: "r", type: "elec.resistor", label: "Rs do LED", params: { R: 220 }, pos: [110, -20] },
      { id: "led", type: "elec.led", label: "LED", params: { color: "red" }, pos: [270, 0] },
      { id: "m", type: "elec.nmos", label: "M1 canal N", params: { K: 0.05, Vth: 2 }, pos: [360, 170] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [220, 380] },
      { id: "scope", type: "sink.scope", label: "Comando e corrente no LED", pos: [560, 100] },
    ],
    [
      ["u5", "out", "vdd", "u"],
      ["pwm", "out", "vg", "u"],
      ["vdd", "p", "r", "a"],
      ["r", "b", "led", "a"],
      ["led", "b", "m", "d"],
      ["vg", "p", "m", "g"],
      ["m", "s", "g", "a"],
      ["vg", "n", "g", "a"],
      ["vdd", "n", "g", "a"],
      ["pwm", "out", "scope", "in1"],
      ["led", "i", "scope", "in2"],
      ["m", "vds", "scope", "in3"],
    ],
    { tf: 4, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Amplificador inversor com amp-op e saturação. */
export function invertingAmp(): ProjectIR {
  return build(
    "Amplificador inversor com amp-op",
    [
      { id: "uin", type: "signal.sine", label: "Sinal (V)", params: { amp: 1, freq: 50 }, pos: [-240, 180] },
      { id: "vin", type: "elec.vsource", label: "Fonte de sinal", pos: [-60, 160] },
      { id: "rin", type: "elec.resistor", label: "Rin 10 kΩ", params: { R: 10000 }, pos: [100, 60] },
      { id: "rf", type: "elec.resistor", label: "Rf 47 kΩ", params: { R: 47000 }, pos: [280, -90] },
      { id: "ao", type: "elec.opamp", label: "Amp-op", params: { A0: 100000, vpos: 10, vneg: -10 }, pos: [320, 90] },
      { id: "rl", type: "elec.resistor", label: "Carga", params: { R: 10000 }, pos: [540, 180] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [220, 330] },
      { id: "scope", type: "sink.scope", label: "Entrada e saída", pos: [700, 80] },
    ],
    [
      ["uin", "out", "vin", "u"],
      ["vin", "p", "rin", "a"],
      ["rin", "b", "ao", "n"],
      ["rin", "b", "rf", "a"],
      ["rf", "b", "ao", "o"],
      ["ao", "o", "rl", "a"],
      ["ao", "p", "g", "a"],
      ["rl", "b", "g", "a"],
      ["vin", "n", "g", "a"],
      ["uin", "out", "scope", "in1"],
      ["ao", "vo", "scope", "in2"],
    ],
    { tf: 0.06, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Pisca-pisca com o CI 555 em modo astável. */
export function timer555Astable(): ProjectIR {
  return build(
    "555 astável (pisca-pisca)",
    [
      { id: "ucc", type: "signal.constant", label: "Vcc (V)", params: { value: 5 }, pos: [-240, 40] },
      { id: "vcc", type: "elec.vsource", label: "Alimentação 5 V", pos: [-60, 20] },
      { id: "r1", type: "elec.resistor", label: "R1", params: { R: 10000 }, pos: [110, -30] },
      { id: "r2", type: "elec.resistor", label: "R2", params: { R: 47000 }, pos: [110, 120] },
      { id: "c", type: "elec.capacitor", label: "C", params: { C: 1e-5 }, pos: [110, 270] },
      { id: "t", type: "elec.timer555", label: "NE555", params: { vcc: 5 }, pos: [340, 90] },
      { id: "led", type: "dig.led", label: "Saída", params: { color: "red" }, pos: [540, 110] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [260, 400] },
      { id: "scope", type: "sink.scope", label: "Tensão no capacitor e saída", pos: [540, 250] },
    ],
    [
      ["ucc", "out", "vcc", "u"],
      ["vcc", "p", "r1", "a"],
      ["r1", "b", "r2", "a"],
      ["r1", "b", "t", "dis"],
      ["r2", "b", "c", "a"],
      ["r2", "b", "t", "thr"],
      ["r2", "b", "t", "trig"],
      ["c", "b", "g", "a"],
      ["vcc", "n", "g", "a"],
      ["t", "out", "led", "a"],
      ["c", "v", "scope", "in1"],
      ["t", "out", "scope", "in2"],
    ],
    { tf: 4, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Contador binário de 4 bits com display de 7 segmentos. */
export function counterDisplay(): ProjectIR {
  return build(
    "Contador binário com display",
    [
      { id: "ck", type: "dig.clock", label: "Clock 2 Hz", params: { f: 2 }, pos: [0, 120] },
      { id: "cnt", type: "dig.counter", label: "Contador", params: { bits: 4, mod: 16 }, pos: [200, 90] },
      { id: "rst", type: "dig.switch", label: "Zerar (R)", params: { on: false }, pos: [0, 260] },
      { id: "l0", type: "dig.led", label: "Q0", params: { color: "green" }, pos: [420, 90] },
      { id: "l1", type: "dig.led", label: "Q1", params: { color: "green" }, pos: [420, 160] },
      { id: "l2", type: "dig.led", label: "Q2", params: { color: "green" }, pos: [420, 230] },
      { id: "l3", type: "dig.led", label: "Q3", params: { color: "green" }, pos: [420, 300] },
      { id: "disp", type: "dig.display7", label: "Valor", pos: [560, 130] },
      { id: "scope", type: "sink.scope", label: "Contagem", pos: [200, 340] },
    ],
    [
      ["ck", "y", "cnt", "clk"],
      ["rst", "y", "cnt", "rst"],
      ["cnt", "q0", "l0", "a"],
      ["cnt", "q1", "l1", "a"],
      ["cnt", "q2", "l2", "a"],
      ["cnt", "q3", "l3", "a"],
      ["cnt", "q0", "disp", "b0"],
      ["cnt", "q1", "disp", "b1"],
      ["cnt", "q2", "disp", "b2"],
      ["cnt", "q3", "disp", "b3"],
      ["cnt", "v", "scope", "in1"],
      ["ck", "y", "scope", "in2"],
    ],
    { tf: 12 },
  );
}

/** Somador completo de 1 bit feito com portas. */
export function fullAdderGates(): ProjectIR {
  return build(
    "Somador completo com portas",
    [
      { id: "a", type: "dig.switch", label: "A", params: { on: true }, pos: [0, 20] },
      { id: "b", type: "dig.switch", label: "B", params: { on: true }, pos: [0, 130] },
      { id: "ci", type: "dig.switch", label: "Cin", params: { on: false }, pos: [0, 260] },
      { id: "x1", type: "dig.xor", label: "A ⊕ B", pos: [180, 40] },
      { id: "x2", type: "dig.xor", label: "Soma", pos: [380, 80] },
      { id: "a1", type: "dig.and", label: "A · B", pos: [180, 200] },
      { id: "a2", type: "dig.and", label: "(A ⊕ B) · Cin", pos: [380, 240] },
      { id: "o1", type: "dig.or", label: "Cout", pos: [560, 220] },
      { id: "ls", type: "dig.led", label: "S", params: { color: "green" }, pos: [560, 60] },
      { id: "lc", type: "dig.led", label: "Cout", params: { color: "red" }, pos: [720, 240] },
      { id: "scope", type: "sink.scope", label: "S e Cout", pos: [720, 100] },
    ],
    [
      ["a", "y", "x1", "a"],
      ["b", "y", "x1", "b"],
      ["x1", "y", "x2", "a"],
      ["ci", "y", "x2", "b"],
      ["a", "y", "a1", "a"],
      ["b", "y", "a1", "b"],
      ["x1", "y", "a2", "a"],
      ["ci", "y", "a2", "b"],
      ["a1", "y", "o1", "a"],
      ["a2", "y", "o1", "b"],
      ["x2", "y", "ls", "a"],
      ["o1", "y", "lc", "a"],
      ["x2", "y", "scope", "in1"],
      ["o1", "y", "scope", "in2"],
    ],
    { tf: 5 },
  );
}

/** Latch SR com duas portas NOR. */
export function norLatch(): ProjectIR {
  return build(
    "Latch SR com portas NOR",
    [
      { id: "s", type: "signal.pulse", label: "Set (S)", params: { hi: 1, lo: 0, period: 8, duty: 12, delay: 3 }, pos: [0, 40] },
      { id: "r", type: "signal.pulse", label: "Reset (R)", params: { hi: 1, lo: 0, period: 8, duty: 12, delay: 0 }, pos: [0, 220] },
      { id: "n1", type: "dig.nor", label: "NOR 1 (Q)", pos: [240, 190] },
      { id: "n2", type: "dig.nor", label: "NOR 2 (Q̄)", pos: [240, 50] },
      { id: "lq", type: "dig.led", label: "Q", params: { color: "green" }, pos: [440, 190] },
      { id: "lqn", type: "dig.led", label: "Q̄", params: { color: "red" }, pos: [440, 50] },
      { id: "scope", type: "sink.scope", label: "S, R e Q", pos: [440, 300] },
    ],
    [
      ["r", "out", "n1", "a"],
      ["n2", "y", "n1", "b"],
      ["s", "out", "n2", "a"],
      ["n1", "y", "n2", "b"],
      ["n1", "y", "lq", "a"],
      ["n2", "y", "lqn", "a"],
      ["s", "out", "scope", "in1"],
      ["r", "out", "scope", "in2"],
      ["n1", "y", "scope", "in3"],
    ],
    { tf: 16 },
  );
}

/** Contador ligado a um conversor D/A: gera uma rampa em escada. */
export function dacStaircase(): ProjectIR {
  return build(
    "Conversor D/A em escada",
    [
      { id: "ck", type: "dig.clock", label: "Clock 16 Hz", params: { f: 16 }, pos: [0, 100] },
      { id: "cnt", type: "dig.counter", label: "Contador", params: { bits: 4 }, pos: [200, 70] },
      { id: "dac", type: "dig.dac", label: "DAC 4 bits", params: { bits: 4, vref: 5 }, pos: [420, 70] },
      { id: "scope", type: "sink.scope", label: "Saída analógica e código", pos: [640, 80] },
    ],
    [
      ["ck", "y", "cnt", "clk"],
      ["cnt", "q0", "dac", "d0"],
      ["cnt", "q1", "dac", "d1"],
      ["cnt", "q2", "dac", "d2"],
      ["cnt", "q3", "dac", "d3"],
      ["dac", "y", "scope", "in1"],
      ["cnt", "v", "scope", "in2"],
    ],
    { tf: 3 },
  );
}

/** Termostato liga-desliga com histerese num tanque aquecido. */
export function thermostat(): ProjectIR {
  return build(
    "Termostato liga-desliga com histerese",
    [
      { id: "cmp", type: "dig.comparator", label: "Termostato (60 °C ± 2)", params: { th: 60, hyst: 4, invert: true, y0: 0 }, pos: [220, 70] },
      { id: "pw", type: "math.gain", label: "Potência da resistência (kW)", params: { K: 5 }, pos: [440, 90] },
      { id: "tank", type: "process.heated_tank", label: "Tanque aquecido", params: { V: 0.05, UA: 20, Tamb: 20, T0: 25 }, pos: [660, 60] },
      { id: "flow", type: "signal.manual", label: "Vazão de água (L/min)", params: { value: 1, min: 0, max: 4 }, pos: [440, 280] },
      { id: "tin", type: "signal.constant", label: "Água de entrada (°C)", params: { value: 20 }, pos: [440, 400] },
      { id: "scope", type: "sink.scope", label: "Temperatura e resistência", pos: [900, 80] },
    ],
    [
      ["tank", "T", "cmp", "in"],
      ["cmp", "y", "pw", "in"],
      ["pw", "out", "tank", "P"],
      ["flow", "out", "tank", "F"],
      ["tin", "out", "tank", "Tin"],
      ["tank", "T", "scope", "in1"],
      ["pw", "out", "scope", "in2"],
    ],
    { tf: 7200, rtol: 1e-6, atol: 1e-8 },
  );
}
