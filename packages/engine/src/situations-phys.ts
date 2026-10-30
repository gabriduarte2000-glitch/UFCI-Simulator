// Situações físicas: mecânica, circuitos e eletromecânica. Valores ilustrativos.

import { build } from "./examples";
import type { ProjectIR } from "./types";

/** Massa, mola e amortecedor com uma força em degrau. */
export function massSpringDamper(): ProjectIR {
  return build(
    "Massa, mola e amortecedor",
    [
      { id: "w1", type: "mech.ground", label: "Parede", pos: [0, 110] },
      { id: "k", type: "mech.spring", label: "Mola", params: { k: 100 }, pos: [130, 110] },
      { id: "m", type: "mech.mass", label: "Massa", params: { m: 1 }, pos: [310, 100] },
      { id: "c", type: "mech.damper", label: "Amortecedor", params: { c: 4 }, pos: [500, 110] },
      { id: "w2", type: "mech.ground", label: "Parede", pos: [690, 110] },
      { id: "f", type: "mech.force", label: "Força externa", pos: [150, 250] },
      { id: "u", type: "signal.step", label: "Força (N)", params: { t_step: 1, v0: 0, v1: 5 }, pos: [-60, 260] },
      { id: "scope", type: "sink.scope", label: "Posição e velocidade", pos: [560, -70] },
    ],
    [
      ["w1", "b", "k", "a"],
      ["k", "b", "m", "a"],
      ["m", "b", "c", "a"],
      ["c", "b", "w2", "a"],
      ["u", "out", "f", "u"],
      ["f", "a", "m", "a"],
      ["m", "x", "scope", "in1"],
      ["m", "v", "scope", "in2"],
    ],
    { tf: 8, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Um quarto de carro: pneu, roda, suspensão e chassi, passando por um degrau de pista. */
export function quarterCar(): ProjectIR {
  return build(
    "Suspensão de um quarto de carro",
    [
      { id: "pulse", type: "signal.pulse", label: "Velocidade da pista", params: { hi: 0.5, lo: 0, period: 20, duty: 1, delay: 1 }, pos: [0, -60] },
      { id: "road", type: "mech.velocity", label: "Pista", pos: [0, 100] },
      { id: "kt", type: "mech.spring", label: "Pneu", params: { k: 160000 }, pos: [150, 110] },
      { id: "mw", type: "mech.mass", label: "Roda", params: { m: 40 }, pos: [330, 100] },
      { id: "ks", type: "mech.spring", label: "Mola da suspensão", params: { k: 16000 }, pos: [520, 40] },
      { id: "cs", type: "mech.damper", label: "Amortecedor", params: { c: 1000 }, pos: [520, 170] },
      { id: "mc", type: "mech.mass", label: "Chassi", params: { m: 250 }, pos: [710, 100] },
      { id: "alt", type: "math.integrator", label: "Altura da pista", pos: [200, -60] },
      { id: "scope", type: "sink.scope", label: "Alturas (m)", pos: [900, -40] },
    ],
    [
      ["pulse", "out", "road", "u"],
      ["pulse", "out", "alt", "in"],
      ["road", "a", "kt", "a"],
      ["kt", "b", "mw", "a"],
      ["mw", "b", "ks", "a"],
      ["mw", "b", "cs", "a"],
      ["ks", "b", "mc", "a"],
      ["cs", "b", "mc", "a"],
      ["alt", "out", "scope", "in1"],
      ["mw", "x", "scope", "in2"],
      ["mc", "x", "scope", "in3"],
    ],
    { tf: 6, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Circuito RLC série com degrau de tensão. */
export function rlcSeries(): ProjectIR {
  return build(
    "Circuito RLC série",
    [
      { id: "u", type: "signal.step", label: "Tensão (V)", params: { t_step: 0.02, v0: 0, v1: 10 }, pos: [-170, 100] },
      { id: "v", type: "elec.vsource", label: "Fonte", pos: [0, 80] },
      { id: "r", type: "elec.resistor", label: "R", params: { R: 10 }, pos: [180, 0] },
      { id: "l", type: "elec.inductor", label: "L", params: { L: 0.1 }, pos: [340, 0] },
      { id: "c", type: "elec.capacitor", label: "C", params: { C: 0.001 }, pos: [500, 0] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [330, 240] },
      { id: "scope", type: "sink.scope", label: "Tensão no capacitor e corrente", pos: [560, 180] },
    ],
    [
      ["u", "out", "v", "u"],
      ["v", "p", "r", "a"],
      ["r", "b", "l", "a"],
      ["l", "b", "c", "a"],
      ["c", "b", "g", "a"],
      ["v", "n", "g", "a"],
      ["c", "v", "scope", "in1"],
      ["l", "i", "scope", "in2"],
    ],
    { tf: 0.4, rtol: 1e-7, atol: 1e-10 },
  );
}

/** O mesmo sinal passando por um filtro RC passa-baixa e um passa-alta. */
export function rcFilters(): ProjectIR {
  return build(
    "Filtros RC: passa-baixa e passa-alta",
    [
      { id: "u", type: "signal.sine", label: "Sinal (V)", params: { amp: 5, freq: 1.6 }, pos: [-170, 150] },
      { id: "v", type: "elec.vsource", label: "Fonte", pos: [0, 130] },
      { id: "r1", type: "elec.resistor", label: "R (passa-baixa)", params: { R: 1000 }, pos: [180, 0] },
      { id: "c1", type: "elec.capacitor", label: "C (passa-baixa)", params: { C: 0.0001 }, pos: [350, 0] },
      { id: "c2", type: "elec.capacitor", label: "C (passa-alta)", params: { C: 0.0001 }, pos: [180, 230] },
      { id: "r2", type: "elec.resistor", label: "R (passa-alta)", params: { R: 1000 }, pos: [350, 230] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [300, 400] },
      { id: "scope", type: "sink.scope", label: "Entrada e saídas", pos: [560, 120] },
    ],
    [
      ["u", "out", "v", "u"],
      ["v", "p", "r1", "a"],
      ["v", "p", "c2", "a"],
      ["r1", "b", "c1", "a"],
      ["c1", "b", "g", "a"],
      ["c2", "b", "r2", "a"],
      ["r2", "b", "g", "a"],
      ["v", "n", "g", "a"],
      ["u", "out", "scope", "in1"],
      ["c1", "v", "scope", "in2"],
      ["r2", "v", "scope", "in3"],
    ],
    { tf: 3, rtol: 1e-7, atol: 1e-10 },
  );
}

/** Motor CC com carga inercial e um torque de perturbação ajustável. */
export function dcMotorLoad(): ProjectIR {
  return build(
    "Motor CC com carga",
    [
      { id: "u", type: "signal.step", label: "Tensão (V)", params: { t_step: 0.5, v0: 0, v1: 12 }, pos: [-170, 90] },
      { id: "v", type: "elec.vsource", label: "Fonte", pos: [0, 70] },
      { id: "mo", type: "electromech.motor", label: "Motor CC", pos: [190, 60] },
      { id: "jl", type: "rot.inertia", label: "Carga", params: { J: 0.01 }, pos: [400, 70] },
      { id: "td", type: "rot.torque", label: "Torque de carga", pos: [260, 260] },
      { id: "man", type: "signal.manual", label: "Torque de carga (N·m)", params: { value: 0, min: -0.3, max: 0.3 }, pos: [60, 330] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [60, 230] },
      { id: "scope", type: "sink.scope", label: "Velocidade e corrente", pos: [640, -80] },
    ],
    [
      ["u", "out", "v", "u"],
      ["v", "p", "mo", "p"],
      ["mo", "n", "g", "a"],
      ["v", "n", "g", "a"],
      ["mo", "s", "jl", "a"],
      ["td", "a", "jl", "a"],
      ["man", "out", "td", "u"],
      ["mo", "w", "scope", "in1"],
      ["mo", "i", "scope", "in2"],
    ],
    { tf: 15, rtol: 1e-7, atol: 1e-9 },
  );
}

/** Servo de posição: PID sobre a tensão do motor, com realimentação do ângulo. */
export function positionServo(): ProjectIR {
  return build(
    "Servo de posição com PID",
    [
      { id: "ref", type: "signal.step", label: "Ângulo desejado (rad)", params: { t_step: 0.3, v0: 0, v1: 1 }, pos: [0, 80] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [230, 100] },
      { id: "pid", type: "control.pid", label: "Controlador de posição", params: { Kp: 10, Ki: 10, Kd: 2.5, N: 20, limit: true, umin: -24, umax: 24, Kaw: 5 }, pos: [400, 90] },
      { id: "u", type: "elec.vsource", label: "Fonte", pos: [630, 70] },
      { id: "mo", type: "electromech.motor", label: "Motor CC", params: { J: 0.01 }, pos: [800, 60] },
      { id: "jl", type: "rot.inertia", label: "Carga", params: { J: 0.01 }, pos: [1010, 70] },
      { id: "td", type: "rot.torque", label: "Torque de carga", pos: [880, 260] },
      { id: "man", type: "signal.manual", label: "Torque de carga (N·m)", params: { value: 0, min: -0.2, max: 0.2 }, pos: [690, 340] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [690, 250] },
      { id: "scope", type: "sink.scope", label: "Ângulo, referência e tensão", pos: [1240, -80] },
    ],
    [
      ["ref", "out", "soma", "in1"],
      ["mo", "th", "soma", "in2"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "u", "u"],
      ["u", "p", "mo", "p"],
      ["mo", "n", "g", "a"],
      ["u", "n", "g", "a"],
      ["mo", "s", "jl", "a"],
      ["td", "a", "jl", "a"],
      ["man", "out", "td", "u"],
      ["mo", "th", "scope", "in1"],
      ["ref", "out", "scope", "in2"],
      ["pid", "out", "scope", "in3"],
    ],
    { tf: 8, rtol: 1e-6, atol: 1e-9 },
  );
}

/** Motor com redutor de engrenagens e carga pesada com atrito. */
export function geared(): ProjectIR {
  return build(
    "Motor com redutor de engrenagens",
    [
      { id: "u", type: "signal.step", label: "Tensão (V)", params: { t_step: 0.2, v0: 0, v1: 12 }, pos: [-170, 90] },
      { id: "v", type: "elec.vsource", label: "Fonte", pos: [0, 70] },
      { id: "mo", type: "electromech.motor", label: "Motor CC", pos: [190, 60] },
      { id: "rd", type: "rot.gear", label: "Redutor 10:1", params: { N: 10 }, pos: [400, 70] },
      { id: "jl", type: "rot.inertia", label: "Carga", params: { J: 0.8 }, pos: [590, 70] },
      { id: "bl", type: "rot.damper", label: "Atrito da carga", params: { b: 0.5 }, pos: [590, 210] },
      { id: "wall", type: "rot.ground", label: "Carcaça", pos: [780, 220] },
      { id: "g", type: "elec.ground", label: "Terra", pos: [80, 250] },
      { id: "scope", type: "sink.scope", label: "Velocidades e corrente", pos: [800, -80] },
    ],
    [
      ["u", "out", "v", "u"],
      ["v", "p", "mo", "p"],
      ["mo", "n", "g", "a"],
      ["v", "n", "g", "a"],
      ["mo", "s", "rd", "a"],
      ["rd", "b", "jl", "a"],
      ["jl", "b", "bl", "a"],
      ["bl", "b", "wall", "a"],
      ["mo", "w", "scope", "in1"],
      ["jl", "w", "scope", "in2"],
      ["mo", "i", "scope", "in3"],
    ],
    { tf: 12, rtol: 1e-7, atol: 1e-9 },
  );
}

/** Dois volantes ligados por um eixo flexível: vibração de torção. */
export function flexibleShaft(): ProjectIR {
  return build(
    "Eixo flexível com dois volantes",
    [
      { id: "u", type: "signal.step", label: "Torque (N·m)", params: { t_step: 0.5, v0: 0, v1: 1 }, pos: [0, 280] },
      { id: "t", type: "rot.torque", label: "Torque de entrada", pos: [180, 290] },
      { id: "j1", type: "rot.inertia", label: "Volante 1", params: { J: 0.02 }, pos: [180, 100] },
      { id: "ts", type: "rot.spring", label: "Eixo (mola torcional)", params: { k: 20 }, pos: [380, 40] },
      { id: "td", type: "rot.damper", label: "Amortecimento do eixo", params: { b: 0.02 }, pos: [380, 170] },
      { id: "j2", type: "rot.inertia", label: "Volante 2", params: { J: 0.03 }, pos: [580, 100] },
      { id: "bl", type: "rot.damper", label: "Atrito da carga", params: { b: 0.2 }, pos: [580, 250] },
      { id: "wall", type: "rot.ground", label: "Carcaça", pos: [780, 260] },
      { id: "scope", type: "sink.scope", label: "Velocidades e torque do eixo", pos: [780, 80] },
    ],
    [
      ["u", "out", "t", "u"],
      ["t", "a", "j1", "a"],
      ["j1", "b", "ts", "a"],
      ["j1", "b", "td", "a"],
      ["ts", "b", "j2", "a"],
      ["td", "b", "j2", "a"],
      ["j2", "b", "bl", "a"],
      ["bl", "b", "wall", "a"],
      ["j1", "w", "scope", "in1"],
      ["j2", "w", "scope", "in2"],
      ["ts", "F", "scope", "in3"],
    ],
    { tf: 10, rtol: 1e-7, atol: 1e-9 },
  );
}
