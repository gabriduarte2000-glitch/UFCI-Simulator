// Situações de petroquímica e refino. Valores de exemplo de livros-texto, ilustrativos.

import { build } from "./examples";
import type { ProjectIR } from "./types";

type C = { id: string; type: string; label?: string; params?: Record<string, number | string | boolean>; pos: [number, number] };
type W = [string, string, string, string];
const manual = (id: string, label: string, value: number, min: number, max: number, x: number, y: number): C => ({ id, type: "signal.manual", label, params: { value, min, max }, pos: [x, y] });
const konst = (id: string, label: string, value: number, x: number, y: number): C => ({ id, type: "signal.constant", label, params: { value }, pos: [x, y] });
const scope = (id: string, label: string, x: number, y: number): C => ({ id, type: "sink.scope", label, pos: [x, y] });

/** Reator CSTR: degrau na temperatura da camisa, em malha aberta. */
export function cstrOpen(): ProjectIR {
  return build(
    "Reator CSTR sem controle: ponto instável",
    [
      manual("F", "Vazão de alimentação (L/min)", 100, 20, 200, 0, 0),
      konst("CAf", "Concentração de A na alimentação (mol/L)", 1, 0, 120),
      konst("Tf", "Temperatura da alimentação (°C)", 76.85, 0, 240),
      manual("tc", "Temperatura da camisa (°C)", 24.39, 15, 45, 0, 360),
      { id: "r", type: "petro.cstr", label: "Reator CSTR", pos: [340, 120] },
      scope("sc1", "Temperatura do reator e da camisa (°C)", 700, 60),
      scope("sc2", "Concentração de A (mol/L) e conversão (%)", 700, 240),
    ],
    [["F", "out", "r", "F"], ["CAf", "out", "r", "CAf"], ["Tf", "out", "r", "Tf"], ["tc", "out", "r", "Tc"], ["r", "T", "sc1", "in1"], ["tc", "out", "sc1", "in2"], ["r", "CA", "sc2", "in1"], ["r", "X", "sc2", "in2"]],
    { tf: 1200, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Reator CSTR: fuga térmica ao perder resfriamento. */
export function cstrRunaway(): ProjectIR {
  return build(
    "Reator CSTR: disparo da temperatura (ignição)",
    [
      manual("F", "Vazão de alimentação (L/min)", 100, 20, 200, 0, 0),
      konst("CAf", "Concentração de A na alimentação (mol/L)", 1, 0, 120),
      konst("Tf", "Temperatura da alimentação (°C)", 76.85, 0, 240),
      { id: "tc", type: "signal.step", label: "Temperatura da camisa (°C)", params: { t_step: 100, v0: 26.85, v1: 31.85 }, pos: [0, 360] },
      { id: "r", type: "petro.cstr", label: "Reator CSTR", pos: [340, 120] },
      scope("sc1", "Temperatura do reator (°C) e calor da reação (kW)", 700, 60),
      scope("sc2", "Concentração de A (mol/L)", 700, 240),
    ],
    [["F", "out", "r", "F"], ["CAf", "out", "r", "CAf"], ["Tf", "out", "r", "Tf"], ["tc", "out", "r", "Tc"], ["r", "T", "sc1", "in1"], ["r", "Qr", "sc1", "in2"], ["r", "CA", "sc2", "in1"], ["tc", "out", "sc2", "in2"]],
    { tf: 1200, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Reator CSTR com PID de temperatura agindo na camisa. */
export function cstrPid(): ProjectIR {
  return build(
    "Reator CSTR com controle de temperatura",
    [
      manual("sp", "Temperatura desejada (°C)", 76.85, 60, 95, 0, 60),
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [220, 80] },
      { id: "pid", type: "control.pid", label: "TIC: controlador de temperatura", params: { Kp: 5, Ki: 0.02, Kd: 0, N: 10, limit: true, umin: 5, umax: 60, Kaw: 0.5, I0: 26.85 }, pos: [420, 70] },
      { id: "lag", type: "control.lag", label: "Camisa (resposta do fluido de resfriamento)", params: { K: 1, tau: 5, y0: 26.85 }, pos: [650, 80] },
      manual("F", "Vazão de alimentação (L/min)", 100, 20, 200, 650, 260),
      konst("CAf", "Concentração de A na alimentação (mol/L)", 1, 650, 360),
      { id: "Tf", type: "signal.step", label: "Temperatura da alimentação (°C)", params: { t_step: 400, v0: 76.85, v1: 82 }, pos: [650, 460] },
      { id: "r", type: "petro.cstr", label: "Reator CSTR", pos: [920, 140] },
      { id: "sens", type: "control.lag", label: "Transmissor de temperatura", params: { K: 1, tau: 2, y0: 76.85 }, pos: [650, 560] },
      scope("sc1", "Temperatura do reator e desejada (°C)", 1200, 60),
      scope("sc2", "Temperatura da camisa (°C) e conversão (%)", 1200, 240),
    ],
    [
      ["sp", "out", "soma", "in1"], ["soma", "out", "pid", "in"], ["pid", "out", "lag", "in"], ["lag", "out", "r", "Tc"],
      ["F", "out", "r", "F"], ["CAf", "out", "r", "CAf"], ["Tf", "out", "r", "Tf"],
      ["r", "T", "sens", "in"], ["sens", "out", "soma", "in2"],
      ["r", "T", "sc1", "in1"], ["sp", "out", "sc1", "in2"], ["lag", "out", "sc2", "in1"], ["r", "X", "sc2", "in2"],
    ],
    { tf: 1800, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Trocador de calor com controle da temperatura de saída do óleo pela vazão de água. */
export function hxControl(): ProjectIR {
  return build(
    "Trocador de calor com controle de temperatura do óleo",
    [
      manual("sp", "Temperatura desejada do óleo na saída (°C)", 70, 50, 100, 0, 60),
      { id: "soma", type: "math.sum", label: "Erro (medida − desejada)", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "TIC: controlador", params: { Kp: 4, Ki: 0.15, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.5, I0: 50 }, pos: [440, 70] },
      { id: "valve", type: "process.valve", label: "Válvula da água de resfriamento", params: { max: 100, tau: 4, p0: 40 }, pos: [680, 80] },
      manual("Fh", "Vazão de óleo (L/min)", 60, 20, 120, 680, 260),
      manual("Thi", "Temperatura do óleo na entrada (°C)", 150, 100, 200, 680, 380),
      konst("Tci", "Temperatura da água na entrada (°C)", 25, 680, 500),
      { id: "hx", type: "petro.hx", label: "Trocador casco e tubo", pos: [940, 120] },
      { id: "sens", type: "control.lag", label: "Transmissor de temperatura", params: { K: 1, tau: 5, y0: 62.6 }, pos: [680, 600] },
      scope("sc1", "Temperatura do óleo na saída e desejada (°C)", 1220, 60),
      scope("sc2", "Água: vazão (L/min) e temperatura de saída (°C); calor (kW)", 1220, 240),
    ],
    [
      ["sp", "out", "soma", "in2"], ["sens", "out", "soma", "in1"], ["soma", "out", "pid", "in"], ["pid", "out", "valve", "cmd"], ["valve", "out", "hx", "Fc"],
      ["Fh", "out", "hx", "Fh"], ["Thi", "out", "hx", "Thi"], ["Tci", "out", "hx", "Tci"],
      ["hx", "Tho", "sens", "in"],
      ["hx", "Tho", "sc1", "in1"], ["sp", "out", "sc1", "in2"], ["valve", "out", "sc2", "in1"], ["hx", "Tco", "sc2", "in2"], ["hx", "Q", "sc2", "in3"],
    ],
    { tf: 900, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Coluna de destilação benzeno e tolueno com degrau no refluxo. */
export function distillOpen(): ProjectIR {
  return build(
    "Coluna de destilação benzeno e tolueno",
    [
      konst("F", "Alimentação (kmol/min)", 1, 0, 0),
      konst("zF", "Fração de benzeno na alimentação", 0.5, 0, 120),
      { id: "L", type: "signal.step", label: "Refluxo (kmol/min)", params: { t_step: 900, v0: 1.2, v1: 1.35 }, pos: [0, 240] },
      manual("V", "Vapor do refervedor (kmol/min)", 1.7, 0.8, 3, 0, 360),
      { id: "col", type: "petro.column", label: "Coluna de destilação", pos: [340, 20] },
      scope("sc1", "Pureza do destilado (xD) e fração no fundo (xB)", 760, 40),
      scope("sc2", "Destilado e fundo (kmol/min)", 760, 220),
      scope("sc3", "Temperaturas do topo e do fundo (°C)", 760, 400),
    ],
    [["F", "out", "col", "F"], ["zF", "out", "col", "zF"], ["L", "out", "col", "L"], ["V", "out", "col", "V"], ["col", "xD", "sc1", "in1"], ["col", "xB", "sc1", "in2"], ["col", "D", "sc2", "in1"], ["col", "B", "sc2", "in2"], ["col", "Tt", "sc3", "in1"], ["col", "Tb", "sc3", "in2"]],
    { tf: 5400, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Coluna com controle da pureza do topo pelo refluxo e perturbação na composição da carga. */
export function distillControl(): ProjectIR {
  return build(
    "Coluna: controle da pureza do topo",
    [
      manual("sp", "Pureza desejada do topo (xD)", 0.97, 0.9, 0.995, 0, 40),
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [220, 60] },
      { id: "pid", type: "control.pid", label: "AIC: controlador de composição", params: { Kp: 8, Ki: 0.02, Kd: 0, N: 10, limit: true, umin: 0.3, umax: 3, Kaw: 0.5, I0: 1.2 }, pos: [420, 50] },
      { id: "lag", type: "control.lag", label: "Válvula de refluxo", params: { K: 1, tau: 10, y0: 1.2 }, pos: [650, 60] },
      konst("F", "Alimentação (kmol/min)", 1, 650, 220),
      { id: "zF", type: "signal.step", label: "Fração de benzeno na carga", params: { t_step: 1500, v0: 0.5, v1: 0.55 }, pos: [650, 330] },
      manual("V", "Vapor do refervedor (kmol/min)", 1.7, 0.8, 3, 650, 460),
      { id: "col", type: "petro.column", label: "Coluna de destilação", pos: [920, 20] },
      { id: "sens", type: "control.lag", label: "Analisador (cromatógrafo)", params: { K: 1, tau: 30, y0: 0.97 }, pos: [650, 580] },
      scope("sc1", "Pureza do topo e desejada", 1330, 40),
      scope("sc2", "Refluxo e destilado (kmol/min)", 1330, 220),
    ],
    [
      ["sp", "out", "soma", "in1"], ["sens", "out", "soma", "in2"], ["soma", "out", "pid", "in"], ["pid", "out", "lag", "in"], ["lag", "out", "col", "L"],
      ["F", "out", "col", "F"], ["zF", "out", "col", "zF"], ["V", "out", "col", "V"],
      ["col", "xD", "sens", "in"],
      ["col", "xD", "sc1", "in1"], ["sp", "out", "sc1", "in2"], ["lag", "out", "sc2", "in1"], ["col", "D", "sc2", "in2"],
    ],
    { tf: 7200, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Forno de processo com controle da temperatura de saída pelo gás combustível. */
export function furnacePid(): ProjectIR {
  return build(
    "Forno de processo: temperatura de saída",
    [
      manual("sp", "Temperatura desejada na saída (°C)", 350, 250, 400, 0, 60),
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "TIC: controlador", params: { Kp: 2, Ki: 0.05, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.5, I0: 50 }, pos: [440, 70] },
      { id: "F", type: "signal.step", label: "Carga do forno (L/min)", params: { t_step: 600, v0: 300, v1: 400 }, pos: [680, 250] },
      konst("Te", "Temperatura de entrada (°C)", 200, 680, 380),
      { id: "fu", type: "petro.furnace", label: "Forno de processo", pos: [940, 120] },
      { id: "sens", type: "control.lag", label: "Termopar de saída", params: { K: 1, tau: 10, y0: 350 }, pos: [680, 520] },
      scope("sc1", "Temperatura de saída e desejada (°C)", 1240, 60),
      scope("sc2", "Comando do gás (%), chama e calor absorvido (kW)", 1240, 240),
    ],
    [
      ["sp", "out", "soma", "in1"], ["sens", "out", "soma", "in2"], ["soma", "out", "pid", "in"], ["pid", "out", "fu", "fuel"],
      ["F", "out", "fu", "F"], ["Te", "out", "fu", "Te"],
      ["fu", "Ts", "sens", "in"],
      ["fu", "Ts", "sc1", "in1"], ["sp", "out", "sc1", "in2"], ["pid", "out", "sc2", "in1"], ["fu", "fire", "sc2", "in2"], ["fu", "Q", "sc2", "in3"],
    ],
    { tf: 1800, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Esfera de gás com controle de pressão e válvula de alívio. */
export function sphereRelief(): ProjectIR {
  return build(
    "Esfera de GLP: pressão e válvula de alívio",
    [
      { id: "qin", type: "signal.step", label: "Gás que entra (kg/min)", params: { t_step: 120, v0: 300, v1: 520 }, pos: [0, 200] },
      manual("sp", "Pressão desejada (bar)", 8, 4, 10, 0, 40),
      { id: "soma", type: "math.sum", label: "Erro (medida − desejada)", params: { signs: "+-" }, pos: [220, 60] },
      { id: "pid", type: "control.pid", label: "PIC: controlador de pressão", params: { Kp: 30, Ki: 1, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.5, I0: 40 }, pos: [420, 50] },
      { id: "ok", type: "signal.step", label: "Válvula de saída disponível (1 = sim, 0 = travada)", params: { t_step: 400, v0: 1, v1: 0 }, pos: [420, 330] },
      { id: "mult", type: "math.product", label: "Comando efetivo", params: { ops: "**" }, pos: [650, 80] },
      { id: "valve", type: "process.valve", label: "Válvula de saída (gás para a rede)", params: { max: 700, tau: 5, p0: 40 }, pos: [850, 90] },
      { id: "sp1", type: "petro.sphere", label: "Esfera de GLP", pos: [1100, 120] },
      { id: "sens", type: "control.lag", label: "Transmissor de pressão", params: { K: 1, tau: 3, y0: 8 }, pos: [650, 330] },
      scope("sc1", "Pressão (bar) e desejada", 1380, 60),
      scope("sc2", "Vazão de saída, entrada e alívio da PSV (kg/min)", 1380, 240),
    ],
    [
      ["sp", "out", "soma", "in2"], ["sens", "out", "soma", "in1"], ["soma", "out", "pid", "in"], ["pid", "out", "mult", "in1"], ["ok", "out", "mult", "in2"], ["mult", "out", "valve", "cmd"],
      ["valve", "out", "sp1", "qout"], ["qin", "out", "sp1", "qin"], ["sp1", "P", "sens", "in"],
      ["sp1", "P", "sc1", "in1"], ["sp", "out", "sc1", "in2"], ["valve", "out", "sc2", "in1"], ["qin", "out", "sc2", "in2"], ["sp1", "psv", "sc2", "in3"],
    ],
    { tf: 900, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Intertravamento de nível muito alto (ESD): a bomba para e a válvula de entrada fecha. */
export function esdLevel(): ProjectIR {
  return build(
    "Intertravamento de nível muito alto (ESD)",
    [
      manual("cmd", "Comando da bomba de carga (%)", 70, 0, 100, 0, 60),
      { id: "cmpH", type: "dig.comparator", label: "LAH: alarme de nível alto (1,5 m)", params: { th: 1.5, hyst: 0.05, invert: false, y0: 0 }, pos: [660, 380] },
      { id: "cmpHH", type: "dig.comparator", label: "LAHH: nível muito alto (1,8 m)", params: { th: 1.8, hyst: 0.05, invert: false, y0: 0 }, pos: [660, 520] },
      { id: "rst", type: "dig.switch", label: "Rearme (botão)", params: { on: false }, pos: [660, 650] },
      { id: "latch", type: "dig.srlatch", label: "Trip: latch do ESD", pos: [900, 540] },
      { id: "ntrip", type: "dig.not", label: "NÃO trip", pos: [1100, 560] },
      { id: "g", type: "math.gain", label: "Habilita (0 ou 1)", params: { K: 1 }, pos: [1100, 680] },
      { id: "mult", type: "math.product", label: "Comando efetivo", params: { ops: "**" }, pos: [360, 80] },
      { id: "pump", type: "process.pump", label: "Bomba de carga", params: { max: 150, tau: 3, p0: 70 }, pos: [560, 80] },
      manual("dem", "Consumo (L/min)", 30, 0, 80, 560, 240),
      { id: "tank", type: "process.tank", label: "Vaso de carga", params: { A: 0.2, hmax: 2, kout: 40, h0: 0.8 }, pos: [820, 60] },
      { id: "la", type: "dig.led", label: "Alarme LAH", params: { color: "yellow" }, pos: [900, 400] },
      { id: "lt", type: "dig.led", label: "Trip ESD", params: { color: "red" }, pos: [1100, 400] },
      scope("sc", "Nível (m), bomba (%) e consumo", 1180, 60),
    ],
    [
      ["cmd", "out", "mult", "in1"], ["g", "out", "mult", "in2"], ["mult", "out", "pump", "cmd"], ["pump", "out", "tank", "qin"], ["dem", "out", "tank", "qext"],
      ["tank", "h", "cmpH", "in"], ["tank", "h", "cmpHH", "in"],
      ["cmpHH", "y", "latch", "s"], ["rst", "y", "latch", "r"], ["latch", "q", "lt", "a"], ["cmpH", "y", "la", "a"],
      ["latch", "q", "ntrip", "a"], ["ntrip", "y", "g", "in"],
      ["tank", "h", "sc", "in1"], ["pump", "out", "sc", "in2"],
    ],
    { tf: 900, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Unidade integrada: trocador pré-aquece a carga, o reator converte A em B e a coluna separa. */
export function integratedUnit(): ProjectIR {
  return build(
    "Unidade integrada: pré-aquecimento, reator e coluna",
    [
      konst("Fc", "Carga do reator (L/min)", 100, 0, 0),
      manual("Thi", "Óleo quente na entrada (°C)", 100, 80, 160, 0, 120),
      konst("Fh", "Vazão de óleo quente (L/min)", 60, 0, 240),
      konst("Tci", "Temperatura da carga fria (°C)", 25, 0, 360),
      { id: "hx", type: "petro.hx", label: "Pré-aquecedor", params: { UA: 0.9, cpc: 0.239, tau: 30, Tho0: 85, Tco0: 76.85 }, pos: [300, 40] },
      konst("CAf", "Concentração de A na carga (mol/L)", 1, 300, 300),
      manual("Tc", "Camisa do reator (°C)", 26.85, 15, 40, 300, 420),
      { id: "r", type: "petro.cstr", label: "Reator CSTR", pos: [600, 100] },
      konst("F", "Alimentação da coluna (kmol/min)", 1, 880, 0),
      { id: "L", type: "signal.constant", label: "Refluxo (kmol/min)", params: { value: 1.2 }, pos: [880, 360] },
      konst("V", "Vapor do refervedor (kmol/min)", 1.7, 880, 480),
      { id: "col", type: "petro.column", label: "Coluna: separa A (topo) de B (fundo)", pos: [1140, 20] },
      scope("sc1", "Reator: temperatura (°C) e saída do pré-aquecedor (°C)", 600, 380),
      scope("sc2", "Conversão (%) e pureza do topo (×100)", 1500, 40),
    ],
    [
      ["Fc", "out", "hx", "Fc"], ["Thi", "out", "hx", "Thi"], ["Fh", "out", "hx", "Fh"], ["Tci", "out", "hx", "Tci"],
      ["Fc", "out", "r", "F"], ["CAf", "out", "r", "CAf"], ["hx", "Tco", "r", "Tf"], ["Tc", "out", "r", "Tc"],
      ["r", "CA", "col", "zF"], ["F", "out", "col", "F"], ["L", "out", "col", "L"], ["V", "out", "col", "V"],
      ["r", "T", "sc1", "in1"], ["hx", "Tco", "sc1", "in2"], ["r", "X", "sc2", "in1"], ["col", "xD", "sc2", "in2"],
    ],
    { tf: 3600, rtol: 1e-6, atol: 1e-8 },
  );
}

export type _W = W;
