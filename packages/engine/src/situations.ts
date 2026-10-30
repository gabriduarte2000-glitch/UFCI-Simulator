// Situações prontas: processos industriais e casos empresariais.
// Todos os números são ilustrativos. O objetivo é mostrar o comportamento, não representar uma planta real.

import { build, exampleFirstOrder, examplePidLoop } from "./examples";
import { dcMotorLoad, flexibleShaft, geared, massSpringDamper, positionServo, quarterCar, rcFilters, rlcSeries } from "./situations-phys";
import type { ProjectIR } from "./types";

export type SituationGroup = "basic" | "industry" | "business" | "mech" | "elec" | "electromech";

export interface Situation {
  id: string;
  group: SituationGroup;
  title: string;
  description: string;
  /** O que o estudante pode explorar. */
  explore: string;
  make: () => ProjectIR;
}

const withUnit = (p: ProjectIR, unit: "s" | "min" | "h" | "dia"): ProjectIR => {
  p.simulation.timeUnit = unit;
  return p;
};

/** Nível de um tanque controlado por PID e válvula de entrada. */
function tankLevel(): ProjectIR {
  return build(
    "Controle de nível de tanque",
    [
      { id: "sp", type: "signal.manual", label: "Nível desejado (m)", params: { value: 1, min: 0.2, max: 1.8 }, pos: [0, 60] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "Controlador de nível", params: { Kp: 60, Ki: 0.6, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.5, I0: 25 }, pos: [440, 70] },
      { id: "valve", type: "process.valve", label: "Válvula de entrada", params: { max: 120, tau: 3, p0: 25 }, pos: [680, 80] },
      { id: "tank", type: "process.tank", label: "Tanque", params: { A: 0.1, hmax: 2, kout: 60, h0: 0.5 }, pos: [920, 60] },
      { id: "dem", type: "signal.manual", label: "Consumo (L/min)", params: { value: 0, min: 0, max: 50 }, pos: [680, 250] },
      { id: "sens", type: "control.lag", label: "Transmissor de nível", params: { K: 1, tau: 2, y0: 0.5 }, pos: [680, 400] },
      { id: "scope", type: "sink.scope", label: "Nível e comando", pos: [1180, 90] },
    ],
    [
      ["sp", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "valve", "cmd"],
      ["valve", "out", "tank", "qin"],
      ["dem", "out", "tank", "qext"],
      ["tank", "h", "sens", "in"],
      ["sens", "out", "soma", "in2"],
      ["tank", "h", "scope", "in1"],
      ["sp", "out", "scope", "in2"],
      ["valve", "out", "scope", "in3"],
    ],
    { tf: 900, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Temperatura de água em tanque aquecido, com atraso de transporte e do sensor. */
function tankTemperature(): ProjectIR {
  return build(
    "Controle de temperatura em tanque aquecido",
    [
      { id: "sp", type: "signal.manual", label: "Temperatura desejada (°C)", params: { value: 60, min: 25, max: 80 }, pos: [0, 60] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "Controlador de temperatura", params: { Kp: 4, Ki: 0.03, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.05, I0: 0 }, pos: [440, 70] },
      { id: "heater", type: "process.heater", label: "Resistência", params: { max: 15, tau: 20, p0: 0 }, pos: [680, 80] },
      { id: "tank", type: "process.heated_tank", label: "Tanque aquecido", params: { V: 0.01, UA: 15, Tamb: 20, T0: 25 }, pos: [920, 60] },
      { id: "flow", type: "signal.manual", label: "Vazão de água (L/min)", params: { value: 3, min: 0, max: 8 }, pos: [680, 250] },
      { id: "tin", type: "signal.constant", label: "Água de entrada (°C)", params: { value: 20 }, pos: [680, 380] },
      { id: "dead", type: "control.deadtime", label: "Tempo morto da tubulação", params: { T: 15, n: 3, y0: 25 }, pos: [920, 330] },
      { id: "sens", type: "control.lag", label: "Sensor de temperatura", params: { K: 1, tau: 8, y0: 25 }, pos: [680, 520] },
      { id: "scope", type: "sink.scope", label: "Temperatura e potência", pos: [1180, 90] },
    ],
    [
      ["sp", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "heater", "cmd"],
      ["heater", "out", "tank", "P"],
      ["flow", "out", "tank", "F"],
      ["tin", "out", "tank", "Tin"],
      ["tank", "T", "dead", "in"],
      ["dead", "out", "sens", "in"],
      ["sens", "out", "soma", "in2"],
      ["tank", "T", "scope", "in1"],
      ["sp", "out", "scope", "in2"],
      ["heater", "out", "scope", "in3"],
    ],
    { tf: 1800, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Caldeira aberta: o controlador mantém o nível com a válvula de água de alimentação. */
function boiler(): ProjectIR {
  return build(
    "Caldeira com controle de nível",
    [
      { id: "sp", type: "signal.manual", label: "Nível desejado (m)", params: { value: 0.3, min: 0.1, max: 0.55 }, pos: [0, 60] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "Controlador de nível", params: { Kp: 150, Ki: 1.5, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.5, I0: 10 }, pos: [440, 70] },
      { id: "valve", type: "process.valve", label: "Válvula de água", params: { max: 20, tau: 3, p0: 10 }, pos: [680, 80] },
      { id: "boiler", type: "process.boiler", label: "Caldeira", params: { A: 0.1, hmax: 0.6, Tf: 20, UA: 30, Tamb: 20, h0: 0.3, T0: 25 }, pos: [920, 60] },
      { id: "power", type: "signal.manual", label: "Potência do queimador (kW)", params: { value: 100, min: 0, max: 200 }, pos: [680, 280] },
      { id: "sens", type: "control.lag", label: "Transmissor de nível", params: { K: 1, tau: 3, y0: 0.3 }, pos: [680, 430] },
      { id: "scope", type: "sink.scope", label: "Nível e temperatura", pos: [1180, 40] },
      { id: "scope2", type: "sink.scope", label: "Vapor produzido", pos: [1180, 240] },
    ],
    [
      ["sp", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "valve", "cmd"],
      ["valve", "out", "boiler", "feed"],
      ["power", "out", "boiler", "P"],
      ["boiler", "h", "sens", "in"],
      ["sens", "out", "soma", "in2"],
      ["boiler", "h", "scope", "in1"],
      ["sp", "out", "scope", "in2"],
      ["boiler", "T", "scope", "in3"],
      ["boiler", "steam", "scope2", "in1"],
    ],
    { tf: 1200, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Dois tanques em série: o nível do segundo é controlado pela válvula do primeiro. */
function twoTanks(): ProjectIR {
  return build(
    "Dois tanques em cascata",
    [
      { id: "sp", type: "signal.manual", label: "Nível desejado do tanque 2 (m)", params: { value: 0.6, min: 0.1, max: 1.8 }, pos: [0, 60] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "Controlador", params: { Kp: 30, Ki: 0.06, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 0.2, I0: 30 }, pos: [440, 70] },
      { id: "valve", type: "process.valve", label: "Válvula", params: { max: 100, tau: 3, p0: 30 }, pos: [680, 80] },
      { id: "t1", type: "process.tank", label: "Tanque 1", params: { A: 0.1, hmax: 2, kout: 40, h0: 0.8 }, pos: [920, 40] },
      { id: "t2", type: "process.tank", label: "Tanque 2", params: { A: 0.1, hmax: 2, kout: 30, h0: 0.5 }, pos: [1180, 40] },
      { id: "dem", type: "signal.manual", label: "Consumo do tanque 2 (L/min)", params: { value: 0, min: 0, max: 20 }, pos: [1180, 260] },
      { id: "sens", type: "control.lag", label: "Transmissor", params: { K: 1, tau: 2, y0: 0.5 }, pos: [920, 330] },
      { id: "scope", type: "sink.scope", label: "Níveis", pos: [1440, 70] },
    ],
    [
      ["sp", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "valve", "cmd"],
      ["valve", "out", "t1", "qin"],
      ["t1", "qout", "t2", "qin"],
      ["dem", "out", "t2", "qext"],
      ["t2", "h", "sens", "in"],
      ["sens", "out", "soma", "in2"],
      ["t1", "h", "scope", "in1"],
      ["t2", "h", "scope", "in2"],
      ["sp", "out", "scope", "in3"],
    ],
    { tf: 2400, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Vazão controlada por bomba com vazamento como perturbação. */
function pumpFlow(): ProjectIR {
  return build(
    "Controle de vazão com bomba",
    [
      { id: "sp", type: "signal.manual", label: "Vazão desejada (L/min)", params: { value: 80, min: 0, max: 140 }, pos: [0, 60] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [240, 80] },
      { id: "pid", type: "control.pid", label: "Controlador de vazão", params: { Kp: 0.6, Ki: 0.4, Kd: 0, N: 10, limit: true, umin: 0, umax: 100, Kaw: 1, I0: 0 }, pos: [440, 70] },
      { id: "pump", type: "process.pump", label: "Bomba", params: { max: 150, tau: 3, p0: 0 }, pos: [680, 80] },
      { id: "leak", type: "signal.manual", label: "Vazamento (L/min)", params: { value: 0, min: 0, max: 40 }, pos: [680, 250] },
      { id: "net", type: "math.sum", label: "Vazão na linha", params: { signs: "+-" }, pos: [920, 100] },
      { id: "sens", type: "control.lag", label: "Medidor de vazão", params: { K: 1, tau: 1, y0: 0 }, pos: [920, 330] },
      { id: "scope", type: "sink.scope", label: "Vazão e comando", pos: [1180, 90] },
    ],
    [
      ["sp", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "pump", "cmd"],
      ["pump", "out", "net", "in1"],
      ["leak", "out", "net", "in2"],
      ["net", "out", "sens", "in"],
      ["sens", "out", "soma", "in2"],
      ["net", "out", "scope", "in1"],
      ["sp", "out", "scope", "in2"],
      ["pid", "out", "scope", "in3"],
    ],
    { tf: 150, rtol: 1e-6, atol: 1e-8 },
  );
}

/** Estoque com reposição comandada por PI e atraso de produção. */
function inventory(): ProjectIR {
  return withUnit(
    build(
      "Controle de estoque com atraso de produção",
      [
        { id: "alvo", type: "signal.manual", label: "Estoque alvo (un)", params: { value: 500, min: 100, max: 900 }, pos: [0, 60] },
        { id: "soma", type: "math.sum", label: "Falta de estoque", params: { signs: "+-" }, pos: [240, 80] },
        { id: "pid", type: "control.pid", label: "Política de reposição", params: { Kp: 0.08, Ki: 0.002, Kd: 0, N: 10, limit: true, umin: 0, umax: 200, Kaw: 0.1, I0: 40 }, pos: [440, 70] },
        { id: "prod", type: "control.lag", label: "Produção (atraso)", params: { K: 1, tau: 7, y0: 40 }, pos: [680, 80] },
        { id: "stock", type: "business.stock", label: "Estoque", params: { max: 1000, x0: 500 }, pos: [920, 60] },
        { id: "dem", type: "signal.step", label: "Demanda (un/dia)", params: { t_step: 30, v0: 40, v1: 60 }, pos: [680, 250] },
        { id: "scope", type: "sink.scope", label: "Estoque e produção", pos: [1180, 70] },
      ],
      [
        ["alvo", "out", "soma", "in1"],
        ["stock", "level", "soma", "in2"],
        ["soma", "out", "pid", "in"],
        ["pid", "out", "prod", "in"],
        ["prod", "out", "stock", "in"],
        ["dem", "out", "stock", "out"],
        ["stock", "level", "scope", "in1"],
        ["alvo", "out", "scope", "in2"],
        ["prod", "out", "scope", "in3"],
        ["dem", "out", "scope", "in4"],
      ],
      { tf: 200, rtol: 1e-6, atol: 1e-8 },
    ),
    "dia",
  );
}

/** Fila de atendimento: o controlador ajusta o número de atendentes. */
function queue(): ProjectIR {
  return withUnit(
    build(
      "Fila de atendimento com escala de atendentes",
      [
        { id: "alvo", type: "signal.manual", label: "Fila máxima desejada (pessoas)", params: { value: 5, min: 0, max: 30 }, pos: [0, 60] },
        { id: "soma", type: "math.sum", label: "Excesso de fila", params: { signs: "+-" }, pos: [240, 80] },
        { id: "pid", type: "control.pid", label: "Escala de atendentes", params: { Kp: 0.3, Ki: 0.01, Kd: 0, N: 10, limit: true, umin: 0, umax: 10, Kaw: 0.5, I0: 4 }, pos: [440, 70] },
        { id: "team", type: "control.lag", label: "Equipe em atendimento (atraso)", params: { K: 1, tau: 10, y0: 4 }, pos: [680, 80] },
        { id: "rate", type: "math.gain", label: "Atendimentos por pessoa (0,5/min)", params: { K: 0.5 }, pos: [920, 100] },
        { id: "q", type: "business.queue", label: "Fila", params: { x0: 5 }, pos: [1160, 70] },
        { id: "arr", type: "signal.step", label: "Chegadas (pessoas/min)", params: { t_step: 60, v0: 2, v1: 3.5 }, pos: [920, 280] },
        { id: "scope", type: "sink.scope", label: "Fila e equipe", pos: [1420, 70] },
      ],
      [
        ["q", "level", "soma", "in1"],
        ["alvo", "out", "soma", "in2"],
        ["soma", "out", "pid", "in"],
        ["pid", "out", "team", "in"],
        ["team", "out", "rate", "in"],
        ["rate", "out", "q", "out"],
        ["arr", "out", "q", "in"],
        ["q", "level", "scope", "in1"],
        ["alvo", "out", "scope", "in2"],
        ["team", "out", "scope", "in3"],
      ],
      { tf: 300, rtol: 1e-6, atol: 1e-8 },
    ),
    "min",
  );
}

export const SITUATIONS: Situation[] = [
  { id: "msd", group: "mech", title: "Massa, mola e amortecedor", description: "A força em degrau empurra a massa, presa a uma mola e a um amortecedor.", explore: "Aumente o amortecimento c até 20 (crítico) e veja a oscilação sumir. A posição final é F/k.", make: massSpringDamper },
  { id: "quarter-car", group: "mech", title: "Suspensão de um quarto de carro", description: "Pneu, roda, mola, amortecedor e chassi passando por um degrau de 10 cm na pista.", explore: "Reduza o amortecedor e veja o chassi balançar mais.", make: quarterCar },
  { id: "flex-shaft", group: "mech", title: "Eixo flexível com dois volantes", description: "Torque em degrau no volante 1, transmitido por um eixo torcional ao volante 2.", explore: "Reduza o amortecimento do eixo e veja as duas velocidades oscilarem em oposição.", make: flexibleShaft },
  { id: "rlc", group: "elec", title: "Circuito RLC série", description: "Degrau de 10 V em um resistor, um indutor e um capacitor em série.", explore: "Aumente R até 20 Ω (amortecimento crítico) e veja a ultrapassagem sumir.", make: rlcSeries },
  { id: "rc-filters", group: "elec", title: "Filtros RC: passa-baixa e passa-alta", description: "O mesmo sinal senoidal passa por dois filtros com frequência de corte de cerca de 1,6 Hz.", explore: "Mude a frequência do sinal e compare quanto cada filtro deixa passar.", make: rcFilters },
  { id: "dc-motor", group: "electromech", title: "Motor CC com carga", description: "Degrau de 12 V em um motor com carga inercial. Você aplica torque de carga com o controle deslizante.", explore: "Aplique torque de carga e veja a velocidade cair e a corrente subir.", make: dcMotorLoad },
  { id: "servo", group: "electromech", title: "Servo de posição com PID", description: "O PID ajusta a tensão do motor para levar o eixo a 1 rad.", explore: "Aplique torque de carga e mude Ki para ver o erro ser eliminado.", make: positionServo },
  { id: "geared-motor", group: "electromech", title: "Motor com redutor de engrenagens", description: "Redutor 10:1 entre o motor e uma carga pesada com atrito.", explore: "Mude a relação N e compare a velocidade do motor com a da carga.", make: geared },
  { id: "first-order", group: "basic", title: "Resposta de 1ª ordem", description: "Degrau aplicado a G(s) = 1/(s+1).", explore: "Troque a constante de tempo e veja o tempo de subida mudar.", make: exampleFirstOrder },
  { id: "pid-loop", group: "basic", title: "Malha fechada com PID", description: "PID controlando uma planta de 2ª ordem.", explore: "Mude Kp, Ki e Kd com a simulação rodando.", make: examplePidLoop },
  { id: "tank-level", group: "industry", title: "Controle de nível de tanque", description: "Válvula de entrada, tanque com saída por gravidade e transmissor de nível.", explore: "Aumente o consumo com o controle deslizante e veja a válvula compensar.", make: tankLevel },
  { id: "tank-temperature", group: "industry", title: "Temperatura em tanque aquecido", description: "Resistência elétrica, tubulação com tempo morto e sensor lento.", explore: "Aumente o ganho e veja a malha oscilar por causa do tempo morto.", make: tankTemperature },
  { id: "boiler", group: "industry", title: "Caldeira com controle de nível", description: "A água aquece até 100 °C, vira vapor e o nível desce. A válvula de água repõe.", explore: "Aumente a potência do queimador e observe a produção de vapor.", make: boiler },
  { id: "two-tanks", group: "industry", title: "Dois tanques em cascata", description: "A saída do tanque 1 alimenta o tanque 2. O nível do segundo é controlado.", explore: "Compare a velocidade dos dois níveis.", make: twoTanks },
  { id: "pump-flow", group: "industry", title: "Vazão com bomba e vazamento", description: "PI controla a rotação da bomba. O vazamento é a perturbação.", explore: "Abra o vazamento e veja o PI recuperar a vazão.", make: pumpFlow },
  { id: "inventory", group: "business", title: "Controle de estoque", description: "A produção demora 7 dias para chegar ao estoque. A demanda sobe no dia 30.", explore: "Aumente o ganho e veja o estoque oscilar (efeito chicote).", make: inventory },
  { id: "queue", group: "business", title: "Fila de atendimento", description: "O controlador ajusta o número de atendentes conforme o tamanho da fila.", explore: "Aumente as chegadas e veja a equipe crescer com atraso.", make: queue },
];

export const SITUATION_GROUPS: { id: SituationGroup; label: string }[] = [
  { id: "mech", label: "Mecânica" },
  { id: "elec", label: "Circuitos elétricos" },
  { id: "electromech", label: "Eletromecânica" },
  { id: "industry", label: "Indústria" },
  { id: "business", label: "Empresarial" },
  { id: "basic", label: "Básicos" },
];
