// Situações prontas: processos industriais e casos empresariais.
// Todos os números são ilustrativos. O objetivo é mostrar o comportamento, não representar uma planta real.

import { build, exampleFirstOrder, examplePidLoop } from "./examples";
import { dcMotorLoad, flexibleShaft, geared, massSpringDamper, positionServo, quarterCar, rcFilters, rlcSeries } from "./situations-phys";
import { rainTreatment } from "./situations-tcc";
import { chirpResonance, digitalPid, noisyFilter, notchDemo, relayOven } from "./situations-ctrl";
import { commonEmitter, counterDisplay, dacStaircase, fullAdderGates, halfWaveRectifier, invertingAmp, mosfetSwitch, norLatch, thermostat, timer555Astable, zenerRegulator } from "./situations-semi";
import { fridgeCompressor, trafficLadder, trafficLight } from "./situations-ics";
import * as more from "./situations-more";
import type { ProjectIR } from "./types";

export type SituationGroup = "control" | "basic" | "industry" | "business" | "mech" | "elec" | "electromech" | "semi" | "digital";

export interface Situation {
  id: string;
  group: SituationGroup;
  title: string;
  description: string;
  /** O que o estudante pode explorar. */
  explore: string;
  /** Subpasta: o tipo de projeto. */
  folder?: string;
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

const BASE: Situation[] = [
  { id: "msd", group: "mech", title: "Massa, mola e amortecedor", description: "A força em degrau empurra a massa, presa a uma mola e a um amortecedor.", explore: "Aumente o amortecimento c até 20 (crítico) e veja a oscilação sumir. A posição final é F/k.", make: massSpringDamper },
  { id: "quarter-car", group: "mech", title: "Suspensão de um quarto de carro", description: "Pneu, roda, mola, amortecedor e chassi passando por um degrau de 10 cm na pista.", explore: "Reduza o amortecedor e veja o chassi balançar mais.", make: quarterCar },
  { id: "flex-shaft", group: "mech", title: "Eixo flexível com dois volantes", description: "Torque em degrau no volante 1, transmitido por um eixo torcional ao volante 2.", explore: "Reduza o amortecimento do eixo e veja as duas velocidades oscilarem em oposição.", make: flexibleShaft },
  { id: "rlc", group: "elec", title: "Circuito RLC série", description: "Degrau de 10 V em um resistor, um indutor e um capacitor em série.", explore: "Aumente R até 20 Ω (amortecimento crítico) e veja a ultrapassagem sumir.", make: rlcSeries },
  { id: "rc-filters", group: "elec", title: "Filtros RC: passa-baixa e passa-alta", description: "O mesmo sinal senoidal passa por dois filtros com frequência de corte de cerca de 1,6 Hz.", explore: "Mude a frequência do sinal e compare quanto cada filtro deixa passar.", make: rcFilters },
  { id: "dc-motor", group: "electromech", title: "Motor CC com carga", description: "Degrau de 12 V em um motor com carga inercial. Você aplica torque de carga com o controle deslizante.", explore: "Aplique torque de carga e veja a velocidade cair e a corrente subir.", make: dcMotorLoad },
  { id: "servo", group: "electromech", title: "Servo de posição com PID", description: "O PID ajusta a tensão do motor para levar o eixo a 1 rad.", explore: "Aplique torque de carga e mude Ki para ver o erro ser eliminado.", make: positionServo },
  { id: "geared-motor", group: "electromech", title: "Motor com redutor de engrenagens", description: "Redutor 10:1 entre o motor e uma carga pesada com atrito.", explore: "Mude a relação N e compare a velocidade do motor com a da carga.", make: geared },
  { id: "rectifier", group: "semi", title: "Retificador de meia onda com filtro", description: "Fonte senoidal de 10 V e 50 Hz, diodo e capacitor de filtro alimentando uma carga.", explore: "Reduza o capacitor e veja a ondulação (ripple) aumentar. Compare a corrente do diodo, que só conduz em pulsos.", make: halfWaveRectifier },
  { id: "zener", group: "semi", title: "Regulador com diodo Zener", description: "Resistor em série e Zener de 5,1 V seguram a tensão na carga enquanto a entrada varia.", explore: "Varie a tensão de entrada de 7 a 30 V e veja a saída ficar quase parada em 5 V. Abaixo de uns 6 V o Zener deixa de regular.", make: zenerRegulator },
  { id: "ce-amp", group: "semi", title: "Amplificador emissor comum (BJT)", description: "Transistor NPN polarizado por divisor de tensão, com capacitores de acoplamento e de desvio.", explore: "Tire o capacitor Ce (coloque uma capacitância muito pequena) e veja o ganho cair. Aumente o sinal para ver a saída distorcer.", make: commonEmitter },
  { id: "mosfet-led", group: "semi", title: "MOSFET como chave com LED", description: "Um pulso na porta liga e desliga o MOSFET de canal N, que acende o LED.", explore: "Mude o ciclo de trabalho do pulso e veja o tempo aceso mudar. Baixe o pulso para menos de 2 V (Vth) e o LED não acende.", make: mosfetSwitch },
  { id: "inv-amp", group: "semi", title: "Amplificador inversor com amp-op", description: "Ganho de −4,7 com Rf/Rin, alimentação de ±10 V e entrada senoidal.", explore: "Aumente a amplitude do sinal para 3 V e veja a saída ser cortada em ±10 V.", make: invertingAmp },
  { id: "timer555", group: "digital", title: "555 astável (pisca-pisca)", description: "O CI 555 carrega e descarrega o capacitor entre 1/3 e 2/3 de Vcc e gera uma onda quadrada.", explore: "O período é 0,693·(R1 + 2·R2)·C. Mude R2 e confira o novo período no gráfico.", make: timer555Astable },
  { id: "counter-disp", group: "digital", title: "Contador binário com display", description: "Clock de 2 Hz, contador de 4 bits, quatro LEDs e display de 7 segmentos.", explore: "Ligue a chave de zerar para travar a contagem em 0. Mude o módulo do contador para 10.", make: counterDisplay },
  { id: "full-adder", group: "digital", title: "Somador completo com portas", description: "Duas portas XOR, duas AND e uma OR somam A, B e o vai-um de entrada.", explore: "Mude as três chaves e confira a tabela verdade: 1 + 1 + 1 dá soma 1 e vai-um 1.", make: fullAdderGates },
  { id: "sr-latch", group: "digital", title: "Latch SR com portas NOR", description: "Duas portas NOR com realimentação cruzada guardam 1 bit de memória.", explore: "O pulso em S põe Q em 1. Ele continua em 1 quando S volta a 0. O pulso em R zera.", make: norLatch },
  { id: "dac-stair", group: "digital", title: "Contador com conversor D/A", description: "O contador de 4 bits alimenta um DAC e gera uma rampa em escada de 0 a 5 V.", explore: "Aumente os bits do contador e do DAC para 6 e veja a escada ficar mais fina.", make: dacStaircase },
  { id: "thermostat", group: "digital", title: "Termostato liga-desliga com histerese", description: "Um comparador com histerese liga e desliga a resistência de um tanque d'água entre 58 e 62 °C.", explore: "Aumente a histerese e veja a temperatura oscilar numa faixa maior, com menos chaveamentos.", make: thermostat },
  { id: "traffic-ladder", group: "digital", title: "Semáforo com temporizadores TON (estilo ladder)", description: "Cinco temporizadores TON em cadeia, como no CLP: verde dos veículos, amarelo, todos vermelhos, verde dos pedestres e vermelho piscando. Só depois do pisca o verde dos veículos volta. Você digita o tempo de cada fase.", explore: "Clique em cada temporizador e mude o tempo programado PT. Aumente T1 para 20 s e veja o verde dos veículos durar mais.", make: trafficLadder },
  { id: "traffic-light", group: "digital", title: "Semáforo de veículos e pedestres (CI 4017)", description: "Um clock de 1 Hz avança o 4017. Portas OU juntam as saídas e acendem 3 LEDs para veículos e 2 para pedestres. O verde dos pedestres apaga e o vermelho pisca antes do verde dos veículos. Ciclo de 10 s.", explore: "Troque o clock para 0,5 Hz e veja cada fase durar o dobro. Mude as saídas ligadas nas portas OU para alterar o tempo do verde.", make: trafficLight },
  { id: "fridge", group: "digital", title: "Refrigerador com compressor protegido (74123)", description: "Termostato com histerese pede o compressor. Um monoestável 74123 bloqueia nova partida por 120 s depois de cada desligamento.", explore: "Abra a porta com o controle deslizante e veja a temperatura subir. Troque R1 e C1 do 74123 para mudar o tempo de bloqueio.", make: fridgeCompressor },
  { id: "digital-pid", group: "control", title: "Controle digital: PID discreto com ZOH", description: "PID amostrado a cada 50 ms controlando uma planta de 2ª ordem, com saída limitada e anti-windup.", explore: "Aumente o período de amostragem Ts e veja a malha perder estabilidade.", make: digitalPid },
  { id: "noisy-filter", group: "control", title: "Filtro Butterworth contra ruído", description: "Uma senoide de 0,5 Hz com ruído passa por um passa-baixa de 3ª ordem.", explore: "Baixe a frequência de corte até a senoide começar a atenuar.", make: noisyFilter },
  { id: "notch", group: "control", title: "Filtro notch tirando uma interferência", description: "Um sinal lento misturado com uma interferência de 10 Hz, que o notch elimina.", explore: "Mude a frequência do notch e veja a interferência voltar.", make: notchDemo },
  { id: "relay-oven", group: "control", title: "Forno com controle liga-desliga (relé)", description: "Um relé com histerese liga e desliga o aquecimento em torno da temperatura desejada.", explore: "Aumente a histerese e veja a temperatura oscilar numa faixa maior.", make: relayOven },
  { id: "chirp", group: "control", title: "Varredura de frequência numa ressonância", description: "Um sinal cuja frequência sobe de 0,2 a 3 Hz excita um sistema ressonante em 1 Hz.", explore: "Diminua o amortecimento ζ e veja o pico ficar maior.", make: chirpResonance },
  { id: "first-order", group: "basic", title: "Resposta de 1ª ordem", description: "Degrau aplicado a G(s) = 1/(s+1).", explore: "Troque a constante de tempo e veja o tempo de subida mudar.", make: exampleFirstOrder },
  { id: "pid-loop", group: "basic", title: "Malha fechada com PID", description: "PID controlando uma planta de 2ª ordem.", explore: "Mude Kp, Ki e Kd com a simulação rodando.", make: examplePidLoop },
  { id: "rain-treatment", group: "industry", title: "Tratamento de água pluvial (TCC)", description: "Reservatório, bomba, pré-tratamento, decantador, caixa de água decantada, cloração com filtro e saída, com as válvulas 1, 3, 4 e 5.", explore: "Na página Gráficos, mexa nos controles deslizantes das bombas e das válvulas e veja os níveis de cada tanque.", make: rainTreatment },
  { id: "tank-level", group: "industry", title: "Controle de nível de tanque", description: "Válvula de entrada, tanque com saída por gravidade e transmissor de nível.", explore: "Aumente o consumo com o controle deslizante e veja a válvula compensar.", make: tankLevel },
  { id: "tank-temperature", group: "industry", title: "Temperatura em tanque aquecido", description: "Resistência elétrica, tubulação com tempo morto e sensor lento.", explore: "Aumente o ganho e veja a malha oscilar por causa do tempo morto.", make: tankTemperature },
  { id: "boiler", group: "industry", title: "Caldeira com controle de nível", description: "A água aquece até 100 °C, vira vapor e o nível desce. A válvula de água repõe.", explore: "Aumente a potência do queimador e observe a produção de vapor.", make: boiler },
  { id: "two-tanks", group: "industry", title: "Dois tanques em cascata", description: "A saída do tanque 1 alimenta o tanque 2. O nível do segundo é controlado.", explore: "Compare a velocidade dos dois níveis.", make: twoTanks },
  { id: "pump-flow", group: "industry", title: "Vazão com bomba e vazamento", description: "PI controla a rotação da bomba. O vazamento é a perturbação.", explore: "Abra o vazamento e veja o PI recuperar a vazão.", make: pumpFlow },
  { id: "inventory", group: "business", title: "Controle de estoque", description: "A produção demora 7 dias para chegar ao estoque. A demanda sobe no dia 30.", explore: "Aumente o ganho e veja o estoque oscilar (efeito chicote).", make: inventory },
  { id: "queue", group: "business", title: "Fila de atendimento", description: "O controlador ajusta o número de atendentes conforme o tamanho da fila.", explore: "Aumente as chegadas e veja a equipe crescer com atraso.", make: queue },
];

const FOLDER_OF: Record<string, string> = {
  "pid-loop": "Malhas de controle", "digital-pid": "Malhas de controle", "first-order": "Respostas de sistemas",
  "noisy-filter": "Filtros e sinais", notch: "Filtros e sinais", chirp: "Filtros e sinais", "relay-oven": "Controle liga-desliga",
  msd: "Massa, mola e amortecedor", "quarter-car": "Massa, mola e amortecedor", "flex-shaft": "Rotação",
  rlc: "Circuitos RC e RLC", "rc-filters": "Circuitos RC e RLC",
  "dc-motor": "Motores", servo: "Motores", "geared-motor": "Motores",
  rectifier: "Fontes e retificação", zener: "Fontes e retificação", "ce-amp": "Amplificadores", "inv-amp": "Amplificadores", "mosfet-led": "Chaveamento",
  timer555: "Osciladores e temporização", "counter-disp": "Contadores e displays", "dac-stair": "Contadores e displays",
  "full-adder": "Lógica e memórias", "sr-latch": "Lógica e memórias", thermostat: "Refrigeração e termostatos", fridge: "Refrigeração e termostatos",
  "traffic-ladder": "Semáforos", "traffic-light": "Semáforos",
  "tank-level": "Tanques e vazão", "pump-flow": "Tanques e vazão", "two-tanks": "Tanques e vazão", "tank-temperature": "Térmicos", boiler: "Térmicos", "rain-treatment": "Tratamento de água",
  inventory: "Estoque e filas", queue: "Estoque e filas",
};

const MORE: Situation[] = [
  { id: "crossroads", group: "digital", folder: "Semáforos", title: "Semáforo de cruzamento (duas vias)", description: "Quatro temporizadores TON em cadeia dão verde, amarelo e vermelho para as vias A e B, sem nunca liberar as duas ao mesmo tempo.", explore: "Mude T1 e T3 para dar mais verde a uma via.", make: more.crossroads },
  { id: "ped-button", group: "digital", folder: "Semáforos", title: "Semáforo com botão de pedestre (74123)", description: "O botão dispara dois monoestáveis do 74123: o verde dos pedestres dura 6 s, depois o vermelho pisca por 4 s, e só então volta o verde dos veículos.", explore: "Clique na chave do botão durante a simulação. Mude R1 e C1 para trocar o tempo da travessia.", make: more.pedestrianButton },
  { id: "traffic-138", group: "digital", folder: "Semáforos", title: "Semáforo com 74163 e 74138", description: "O contador 74163 conta de 0 a 7, o decodificador 74138 escolhe o estado e portas NAND acendem os LEDs. No estado 7 o vermelho dos pedestres pisca antes do verde dos veículos.", explore: "Mude as entradas das portas NAND para alterar quantos segundos cada cor fica acesa.", make: more.trafficCounterDecoder },
  { id: "decade-7490", group: "digital", folder: "Contadores e displays", title: "Contador de década 7490 com display", description: "O 7490 conta de 0 a 9 e o display mostra o valor.", explore: "Ligue R01 e R02 em 1 para zerar. Troque o clock para 4 Hz.", make: more.decade7490 },
  { id: "two-digits", group: "digital", folder: "Contadores e displays", title: "Contador de dois dígitos com 4518", description: "O 4518 duplo conta de 00 a 99. O carry do primeiro contador faz o segundo avançar.", explore: "Observe a dezena subir a cada 10 pulsos.", make: more.twoDigits4518 },
  { id: "batch-count", group: "digital", folder: "Contadores e displays", title: "Contagem de peças em lote (74163 e 7485)", description: "O 7485 compara a contagem com o tamanho do lote. Ao chegar, acende o LED e zera o contador.", explore: "Mude as chaves B0 a B3 para outro tamanho de lote.", make: more.batchCounter },
  { id: "johnson", group: "digital", folder: "Registradores e sequenciais", title: "Contador Johnson com 74194", description: "O registrador universal desloca à direita e realimenta o QD invertido, gerando 8 estados.", explore: "Troque S1 S0 para deslocar à esquerda.", make: more.johnson74194 },
  { id: "sipo-74164", group: "digital", folder: "Registradores e sequenciais", title: "Serial para paralelo com 74164", description: "Um dado serial entra bit a bit e aparece em 8 saídas paralelas.", explore: "Mude a frequência do dado serial e veja o padrão deslizar pelos LEDs.", make: more.serialParallel74164 },
  { id: "adder-7483", group: "digital", folder: "Aritmética e lógica combinacional", title: "Somador de 4 bits com 7483", description: "Soma A = 5 e B = 3 e mostra o resultado no display, com o vai-um em um LED.", explore: "Mude as chaves para somar 9 + 9 e veja o vai-um acender.", make: more.adder7483 },
  { id: "cmp-7485", group: "digital", folder: "Aritmética e lógica combinacional", title: "Comparador de magnitude 7485", description: "Compara A com B e acende um entre três LEDs: maior, igual ou menor.", explore: "Deixe A igual a B e veja o LED de igualdade acender.", make: more.comparator7485 },
  { id: "majority", group: "digital", folder: "Aritmética e lógica combinacional", title: "Função maioria com multiplexador 74151", description: "O 74151 implementa a função maioria de 3 entradas: as entradas de dados D0 a D7 são a tabela-verdade.", explore: "Mude A, B e C e confira a tabela. Altere um D para criar outra função.", make: more.majority74151 },
  { id: "motor-latch", group: "digital", folder: "Comando e ladder", title: "Partida e parada de motor com selo e TON", description: "Um latch SR faz o selo do botão Liga. Um TON atrasa a partida do motor em 3 s. O Desliga zera tudo.", explore: "Mude o PT do TON e veja o atraso mudar.", make: more.motorLatch },
  { id: "street-light", group: "digital", folder: "Aplicações de eletrônica", title: "Luz de rua automática", description: "Um comparador com histerese acende a lâmpada quando a luz do ambiente cai abaixo de 30 %.", explore: "Aumente a histerese e veja a lâmpada trocar menos de estado.", make: more.streetLight },
  { id: "pwm", group: "semi", folder: "Aplicações de eletrônica", title: "PWM e filtro passa-baixa", description: "A razão cíclica é comparada com uma onda triangular. O filtro RC devolve a média, que vale 12 V vezes a razão cíclica.", explore: "Mude a razão cíclica de 0,3 para 0,8 e veja a média subir.", make: more.pwmFilter },
  { id: "pd-position", group: "control", folder: "Malhas de controle", title: "Posicionamento com controlador PD", description: "Uma carga com atrito e inércia segue uma referência em degrau com um controlador PD.", explore: "Zere o Kd e veja a oscilação aparecer.", make: more.pdPosition },
  { id: "damping", group: "control", folder: "Respostas de sistemas", title: "Efeito do amortecimento (ζ) na 2ª ordem", description: "O mesmo degrau passa por três sistemas com ζ = 0,2, 0,7 e 1,5.", explore: "Compare a ultrapassagem e o tempo de acomodação das três curvas.", make: more.dampingCompare },
  { id: "tank-onoff", group: "industry", folder: "Tanques e vazão", title: "Nível de tanque com bomba liga-desliga", description: "Uma chave de nível com histerese liga a bomba abaixo de 0,8 m e desliga acima de 1,2 m.", explore: "Aumente o consumo e veja a bomba ficar mais tempo ligada.", make: more.tankOnOff },
  { id: "stock-minmax", group: "business", folder: "Estoque e filas", title: "Estoque com ponto de reposição", description: "A reposição liga abaixo de 250 e desliga acima de 350 unidades, enquanto a demanda é constante.", explore: "Aumente a demanda e veja a reposição ficar ligada por mais tempo.", make: more.stockMinMax },
];

export const SITUATIONS: Situation[] = [...BASE, ...MORE].map((x) => ({ ...x, folder: x.folder ?? FOLDER_OF[x.id] ?? "Outros" }));



export const SITUATION_GROUPS: { id: SituationGroup; label: string }[] = [
  { id: "control", label: "Controle, filtros e digital" },
  { id: "mech", label: "Mecânica" },
  { id: "elec", label: "Circuitos elétricos" },
  { id: "electromech", label: "Eletromecânica" },
  { id: "semi", label: "Semicondutores e amplificadores" },
  { id: "digital", label: "Digital e CIs" },
  { id: "industry", label: "Indústria" },
  { id: "business", label: "Empresarial" },
  { id: "basic", label: "Básicos" },
];
