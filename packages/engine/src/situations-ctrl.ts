// Situações de controle, filtros e controle digital, feitas com os blocos da segunda leva.

import { build } from "./examples";
import type { ProjectIR } from "./types";

/** Planta de 2ª ordem controlada por um PID digital, com amostrador e retenção. */
export function digitalPid(): ProjectIR {
  return build(
    "Controle digital: PID discreto com ZOH",
    [
      { id: "ref", type: "signal.step", label: "Referência", params: { t_step: 0.5, v0: 0, v1: 1 }, pos: [0, 120] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [220, 120] },
      { id: "pid", type: "disc.pid", label: "PID [z]", params: { Kp: 6, Ki: 8, Kd: 0.3, Ts: 0.05, umax: 20, umin: -20 }, pos: [420, 120] },
      { id: "planta", type: "control.tf", label: "Planta", params: { num: "2", den: "1 3 2" }, pos: [680, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [920, 120] },
    ],
    [
      ["ref", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "planta", "in"],
      ["planta", "out", "soma", "in2"],
      ["planta", "out", "scope", "in1"],
      ["ref", "out", "scope", "in2"],
    ],
    { tf: 8 },
  );
}

/** Senoide lenta com ruído, filtrada por um Butterworth. */
export function noisyFilter(): ProjectIR {
  return build(
    "Filtro Butterworth contra ruído",
    [
      { id: "sinal", type: "signal.sine", label: "Sinal útil (0,5 Hz)", params: { amp: 1, freq: 0.5 }, pos: [0, 40] },
      { id: "ruido", type: "signal.noise", label: "Ruído", params: { sigma: 0.35, Ts: 0.01, seed: 4 }, pos: [0, 200] },
      { id: "soma", type: "math.sum", label: "Medida ruidosa", params: { signs: "++" }, pos: [240, 120] },
      { id: "filtro", type: "control.butter", label: "Butterworth 3ª ordem", params: { fc: 1.2, n: 3 }, pos: [460, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [760, 120] },
    ],
    [
      ["sinal", "out", "soma", "in1"],
      ["ruido", "out", "soma", "in2"],
      ["soma", "out", "filtro", "in"],
      ["soma", "out", "scope", "in1"],
      ["filtro", "out", "scope", "in2"],
    ],
    { tf: 10, solver: "rk4", h: 0.005 },
  );
}

/** Duas senoides somadas e um notch que tira a de 10 Hz. */
export function notchDemo(): ProjectIR {
  return build(
    "Filtro notch tirando uma interferência",
    [
      { id: "util", type: "signal.sine", label: "Sinal (0,7 Hz)", params: { amp: 1, freq: 0.7 }, pos: [0, 40] },
      { id: "zumbido", type: "signal.sine", label: "Interferência (10 Hz)", params: { amp: 0.4, freq: 10 }, pos: [0, 200] },
      { id: "soma", type: "math.sum", label: "Soma", params: { signs: "++" }, pos: [240, 120] },
      { id: "notch", type: "control.notch", label: "Notch 10 Hz", params: { f0: 10, zz: 0.01, zp: 0.7 }, pos: [460, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [760, 120] },
    ],
    [
      ["util", "out", "soma", "in1"],
      ["zumbido", "out", "soma", "in2"],
      ["soma", "out", "notch", "in"],
      ["soma", "out", "scope", "in1"],
      ["notch", "out", "scope", "in2"],
    ],
    { tf: 6, solver: "rk4", h: 0.002 },
  );
}

/** Forno controlado liga-desliga com relé de histerese. */
export function relayOven(): ProjectIR {
  return build(
    "Forno com controle liga-desliga (relé)",
    [
      { id: "ref", type: "signal.constant", label: "Temperatura desejada (°C)", params: { value: 6 }, pos: [0, 120] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 120] },
      { id: "rele", type: "nonlinear.relay", label: "Relé", params: { on: 0.4, off: -0.4, hi: 1, lo: 0 }, pos: [440, 120] },
      { id: "forno", type: "control.lag", label: "Forno", params: { K: 10, tau: 25 }, pos: [680, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [920, 120] },
    ],
    [
      ["ref", "out", "soma", "in1"],
      ["soma", "out", "rele", "in"],
      ["rele", "out", "forno", "in"],
      ["forno", "out", "soma", "in2"],
      ["forno", "out", "scope", "in1"],
      ["ref", "out", "scope", "in2"],
    ],
    { tf: 200 },
  );
}

/** Varredura de frequência numa planta subamortecida: a ressonância aparece na amplitude. */
export function chirpResonance(): ProjectIR {
  return build(
    "Varredura de frequência (chirp) numa ressonância",
    [
      { id: "chirp", type: "signal.chirp", label: "Chirp 0,2 a 3 Hz", params: { A: 1, f0: 0.2, f1: 3, T: 30 }, pos: [0, 120] },
      { id: "planta", type: "control.lp2", label: "2ª ordem (1 Hz, ζ = 0,15)", params: { K: 1, wn: 6.283, zeta: 0.15 }, pos: [300, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [620, 120] },
    ],
    [
      ["chirp", "out", "planta", "in"],
      ["planta", "out", "scope", "in1"],
      ["chirp", "out", "scope", "in2"],
    ],
    { tf: 30, solver: "rk4", h: 0.005 },
  );
}
