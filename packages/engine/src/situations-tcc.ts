// Sistema de tratamento de água pluvial (TCC, CEFET/RJ). Valores ilustrativos: as medidas
// reais dos tanques, das bombas e das válvulas devem ser colocadas pelo painel de propriedades.

import { build } from "./examples";
import type { ProjectIR } from "./types";

/** Uma válvula de gravidade: vazão = abertura × √nível do tanque de origem. */
type Comp = { id: string; type: string; label?: string; params?: Record<string, number | string | boolean>; pos: [number, number] };

function gravityValve(id: string, label: string, tank: string, pos: [number, number], k: number, kmax: number, drain: boolean) {
  const comps: Comp[] = [
    { id: `${id}_k`, type: "signal.manual", label: `${label} (L/min por √m)`, params: { value: k, min: 0, max: kmax }, pos: [pos[0], pos[1] + 150] as [number, number] },
    { id: `${id}_r`, type: "math.sqrt", label: "√nível", pos: [pos[0], pos[1]] as [number, number] },
    { id: id, type: "math.product", label: `Vazão da ${label}`, params: { ops: "**" }, pos: [pos[0] + 150, pos[1] + 40] as [number, number] },
  ];
  const conns: [string, string, string, string][] = [
    [tank, "h", `${id}_r`, "in"],
    [`${id}_r`, "out", id, "in1"],
    [`${id}_k`, "out", id, "in2"],
  ];
  if (drain) conns.push([id, "out", tank, "qext"]);
  return { comps, conns };
}

/** Reservatório, bomba, pré-tratamento, decantador, caixa de água decantada, cloração e saída. */
export function rainTreatment(): ProjectIR {
  const v1 = gravityValve("v1", "Válvula 1", "t1", [570, 0], 6, 20, true);
  const v3 = gravityValve("v3", "Válvula 3", "t3", [570, 440], 6, 20, true);
  const v5 = gravityValve("v5", "Válvula 5", "t4", [1110, 440], 5, 20, true);
  return build(
    "Tratamento de água pluvial (TCC)",
    [
      { id: "sb1", type: "signal.manual", label: "Bomba 1 (%)", params: { value: 50, min: 0, max: 100 }, pos: [0, 0] },
      { id: "b1", type: "process.pump", label: "Bomba 1", params: { max: 5, tau: 2, p0: 50 }, pos: [170, 10] },
      { id: "rain", type: "signal.manual", label: "Entrada de água da chuva (L/min)", params: { value: 2, min: 0, max: 6 }, pos: [0, 200] },
      { id: "t0", type: "process.tank", label: "Reservatório", params: { A: 0.15, hmax: 0.4, kout: 0, h0: 0.35 }, pos: [170, 170] },
      { id: "t1", type: "process.tank", label: "Pré-tratamento", params: { A: 0.06, hmax: 0.4, kout: 0, h0: 0.15 }, pos: [370, -10] },
      ...v1.comps,
      { id: "dec", type: "process.tank", label: "Decantador", params: { A: 0.05, hmax: 0.4, kout: 0, h0: 0.1 }, pos: [860, -10] },

      { id: "sb2", type: "signal.manual", label: "Bomba 2 (%)", params: { value: 45, min: 0, max: 100 }, pos: [0, 440] },
      { id: "b2", type: "process.pump", label: "Bomba 2 (decantador para caixa)", params: { max: 4, tau: 2, p0: 45 }, pos: [170, 450] },
      { id: "t3", type: "process.tank", label: "Água decantada", params: { A: 0.06, hmax: 0.4, kout: 0, h0: 0.1 }, pos: [370, 430] },
      ...v3.comps,
      { id: "sc", type: "signal.manual", label: "Dosagem de cloro (%)", params: { value: 50, min: 0, max: 100 }, pos: [860, 640] },
      { id: "vc", type: "process.valve", label: "Válvula 4 (cloro)", params: { max: 0.2, tau: 1, p0: 50 }, pos: [1020, 640] },
      { id: "qsum", type: "math.sum", label: "Entrada da cloração", params: { signs: "++" }, pos: [1020, 500] },
      { id: "t4", type: "process.tank", label: "Cloração e filtro", params: { A: 0.08, hmax: 0.4, kout: 0, h0: 0.05 }, pos: [860, 430] },
      ...v5.comps,

      { id: "temp", type: "signal.manual", label: "Temperatura da água (°C, só a cor)", params: { value: 20, min: 10, max: 95 }, pos: [0, 330] },

      { id: "scope1", type: "sink.scope", label: "Níveis: reservatório, pré-tratamento e decantador (m)", pos: [1260, 0] },
      { id: "scope2", type: "sink.scope", label: "Níveis: água decantada e cloração (m) e saída (L/min)", pos: [1500, 440] },
    ],
    [
      ["sb1", "out", "b1", "cmd"],
      ["rain", "out", "t0", "qin"],
      ["b1", "out", "t0", "qext"],
      ["b1", "out", "t1", "qin"],
      ...v1.conns,
      ["v1", "out", "dec", "qin"],

      ["sb2", "out", "b2", "cmd"],
      ["b2", "out", "dec", "qext"],
      ["b2", "out", "t3", "qin"],
      ...v3.conns,
      ["v3", "out", "qsum", "in1"],
      ["sc", "out", "vc", "cmd"],
      ["vc", "out", "qsum", "in2"],
      ["qsum", "out", "t4", "qin"],
      ...v5.conns,

      ["temp", "out", "t0", "Tw"],
      ["temp", "out", "t1", "Tw"],
      ["temp", "out", "dec", "Tw"],
      ["temp", "out", "t3", "Tw"],
      ["temp", "out", "t4", "Tw"],
      ["t0", "h", "scope1", "in1"],
      ["t1", "h", "scope1", "in2"],
      ["dec", "h", "scope1", "in3"],
      ["t3", "h", "scope2", "in1"],
      ["t4", "h", "scope2", "in2"],
      ["v5", "out", "scope2", "in3"],
    ],
    { tf: 1200, rtol: 1e-6, atol: 1e-8 },
  );
}
