// Componentes físicos: mecânico (translação e rotação), elétrico e eletromecânico.
// O comportamento está no montador (physical.ts). Aqui ficam as portas, os parâmetros
// com unidade e as hipóteses de cada modelo. Valores padrão ilustrativos.

import type { Domain, ParamDef, PortDef } from "../types";
import { type CategoryId, registerComponent } from "./registry";

type Side = NonNullable<PortDef["side"]>;
const ph = (name: string, label: string, domain: Domain, side: Side, short = "", node?: string): PortDef => ({ name, label, domain, dir: "phys", side, short, node });
const out = (name: string, label: string, short: string, unit: string, side: Side = "bottom"): PortDef => ({ name, label, domain: "signal", dir: "out", short, unit, side });
const inp = (name: string, label: string, short: string, unit: string, side: Side = "top"): PortDef => ({ name, label, domain: "signal", dir: "in", short, unit, side });

const num = (key: string, label: string, unit: string, def: number, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, unit, kind: "number", default: def, group: "basic", ...extra });
const init = (key: string, label: string, unit: string, def: number, hint?: string): ParamDef => ({ key, label, unit, kind: "number", default: def, group: "initial", initialOnly: true, hint });

const ILLUS = "Valores padrão ilustrativos.";
const SI = "Unidades do Sistema Internacional. O tempo é em segundos.";

interface Spec {
  type: string;
  label: string;
  category: CategoryId;
  prefix: string;
  symbol: string;
  kind: string;
  description: string;
  model: string;
  hypotheses: string[];
  ports: PortDef[];
  params: ParamDef[];
}
const reg = (s: Spec) =>
  registerComponent({
    type: s.type,
    label: s.label,
    category: s.category,
    labelPrefix: s.prefix,
    symbol: s.symbol,
    description: s.description,
    model: s.model,
    hypotheses: [...s.hypotheses, SI, ILLUS],
    ports: s.ports,
    params: s.params,
    physical: { kind: s.kind },
  });

// ======================================================================== Mecânico, translação

reg({
  type: "mech.mass",
  label: "Massa",
  category: "mech",
  prefix: "Massa",
  symbol: "mass",
  kind: "cap1",
  description: "Corpo rígido que se move em linha reta. Todas as forças ligadas à massa somam.",
  model: "m · dv/dt = soma das forças;  dx/dt = v",
  hypotheses: ["A posição é medida a partir do equilíbrio (sem gravidade e sem atrito, a menos que você ligue um amortecedor).", "Os dois lados da massa são o mesmo ponto: ligue molas e amortecedores em qualquer um deles."],
  ports: [ph("a", "Lado esquerdo", "mech", "left", "", "n"), ph("b", "Lado direito", "mech", "right", "", "n"), out("x", "Posição", "x", "m", "top"), out("v", "Velocidade", "v", "m/s", "top")],
  params: [num("m", "Massa", "kg", 1, { min: 1e-6 }), init("x0", "Posição inicial", "m", 0, "Medida a partir do equilíbrio. Uma mola ligada começa esticada por este valor."), init("v0", "Velocidade inicial", "m/s", 0)],
});

reg({
  type: "mech.spring",
  label: "Mola",
  category: "mech",
  prefix: "Mola",
  symbol: "spring",
  kind: "ind",
  description: "Mola linear. A força é proporcional à deformação.",
  model: "F = k · (x_b − x_a),  força de tração positiva quando esticada",
  hypotheses: ["Sem massa e sem amortecimento próprio.", "A deformação inicial vem das posições iniciais das massas: a mola está relaxada quando os dois lados têm a mesma posição inicial."],
  ports: [ph("a", "Ponta a", "mech", "left"), ph("b", "Ponta b", "mech", "right"), out("F", "Força de tração", "F", "N")],
  params: [num("k", "Rigidez", "N/m", 100, { min: 1e-9 }), init("e0", "Deformação inicial adicional", "m", 0, "Somada à deformação que vem das posições iniciais.")],
});

reg({
  type: "mech.damper",
  label: "Amortecedor",
  category: "mech",
  prefix: "Amortecedor",
  symbol: "damper",
  kind: "res",
  description: "Amortecedor viscoso. A força é proporcional à velocidade relativa entre as pontas.",
  model: "F = c · (v_b − v_a)",
  hypotheses: ["Atrito viscoso linear.", "Sem massa."],
  ports: [ph("a", "Ponta a", "mech", "left"), ph("b", "Ponta b", "mech", "right"), out("F", "Força de tração", "F", "N")],
  params: [num("c", "Coeficiente de amortecimento", "N·s/m", 2, { min: 0 })],
});

reg({
  type: "mech.force",
  label: "Força externa",
  category: "mech",
  prefix: "Força",
  symbol: "force",
  kind: "isrc",
  description: "Aplica uma força no ponto ligado. O valor vem de um sinal. Positivo empurra para a direita.",
  model: "F = u(t)",
  hypotheses: ["A força vem de fora do sistema."],
  ports: [ph("a", "Ponto de aplicação", "mech", "right"), inp("u", "Força", "F", "N")],
  params: [],
});

reg({
  type: "mech.velocity",
  label: "Movimento imposto",
  category: "mech",
  prefix: "Movimento",
  symbol: "velsrc",
  kind: "vsrc",
  description: "Obriga o ponto ligado a se mover com a velocidade do sinal. Serve para a base de uma suspensão, uma esteira ou um came.",
  model: "v = u(t)",
  hypotheses: ["A velocidade é imposta, qualquer que seja a força necessária.", "Não ligue em um ponto que já tem massa."],
  ports: [ph("a", "Ponto movido", "mech", "right"), inp("u", "Velocidade", "v", "m/s")],
  params: [],
});

reg({
  type: "mech.ground",
  label: "Parede (referência fixa)",
  category: "mech",
  prefix: "Parede",
  symbol: "wall",
  kind: "gnd",
  description: "Ponto fixo de referência, com velocidade zero. Todo sistema mecânico precisa de pelo menos uma parede.",
  model: "v = 0",
  hypotheses: ["Indeformável e imóvel."],
  ports: [ph("a", "Lado esquerdo", "mech", "left", "", "n"), ph("b", "Lado direito", "mech", "right", "", "n")],
  params: [],
});

reg({
  type: "mech.rack",
  label: "Pinhão e cremalheira",
  category: "mech",
  prefix: "Cremalheira",
  symbol: "rack",
  kind: "xfm",
  description: "Converte rotação em translação sem perdas: a velocidade linear é o raio vezes a velocidade angular.",
  model: "v = r · ω;  F = τ / r",
  hypotheses: ["Sem folga, sem atrito e sem perdas.", "Mudar o raio durante a simulação reinicia o sistema."],
  ports: [ph("a", "Eixo (rotação)", "rot", "left"), ph("b", "Cremalheira (translação)", "mech", "right")],
  params: [num("r", "Raio do pinhão", "m", 0.05, { min: 1e-6, structural: true })],
});

// ======================================================================== Mecânico, rotação

reg({
  type: "rot.inertia",
  label: "Inércia",
  category: "rot",
  prefix: "Inércia",
  symbol: "inertia",
  kind: "cap1",
  description: "Corpo que gira em torno de um eixo fixo. Todos os torques ligados somam.",
  model: "J · dω/dt = soma dos torques;  dθ/dt = ω",
  hypotheses: ["Os dois lados são o mesmo ponto do eixo."],
  ports: [ph("a", "Lado esquerdo", "rot", "left", "", "n"), ph("b", "Lado direito", "rot", "right", "", "n"), out("th", "Ângulo", "θ", "rad", "top"), out("w", "Velocidade angular", "ω", "rad/s", "top")],
  params: [num("J", "Momento de inércia", "kg·m²", 0.01, { min: 1e-9 }), init("th0", "Ângulo inicial", "rad", 0), init("w0", "Velocidade angular inicial", "rad/s", 0)],
});

reg({
  type: "rot.spring",
  label: "Mola torcional",
  category: "rot",
  prefix: "Mola torcional",
  symbol: "tspring",
  kind: "ind",
  description: "Eixo flexível. O torque é proporcional à torção.",
  model: "τ = k · (θ_b − θ_a)",
  hypotheses: ["Sem inércia própria."],
  ports: [ph("a", "Ponta a", "rot", "left"), ph("b", "Ponta b", "rot", "right"), out("F", "Torque de torção", "τ", "N·m")],
  params: [num("k", "Rigidez torcional", "N·m/rad", 10, { min: 1e-9 }), init("e0", "Torção inicial adicional", "rad", 0)],
});

reg({
  type: "rot.damper",
  label: "Amortecedor rotacional",
  category: "rot",
  prefix: "Amortecedor rot.",
  symbol: "tdamper",
  kind: "res",
  description: "Atrito viscoso entre dois pontos que giram.",
  model: "τ = b · (ω_b − ω_a)",
  hypotheses: ["Atrito viscoso linear."],
  ports: [ph("a", "Ponta a", "rot", "left"), ph("b", "Ponta b", "rot", "right"), out("F", "Torque", "τ", "N·m")],
  params: [num("b", "Coeficiente de amortecimento", "N·m·s/rad", 0.05, { min: 0 })],
});

reg({
  type: "rot.torque",
  label: "Torque externo",
  category: "rot",
  prefix: "Torque",
  symbol: "torque",
  kind: "isrc",
  description: "Aplica um torque no ponto ligado. O valor vem de um sinal.",
  model: "τ = u(t)",
  hypotheses: ["O torque vem de fora do sistema."],
  ports: [ph("a", "Ponto de aplicação", "rot", "right"), inp("u", "Torque", "τ", "N·m")],
  params: [],
});

reg({
  type: "rot.speed",
  label: "Rotação imposta",
  category: "rot",
  prefix: "Rotação",
  symbol: "speedsrc",
  kind: "vsrc",
  description: "Obriga o eixo a girar com a velocidade angular do sinal.",
  model: "ω = u(t)",
  hypotheses: ["Não ligue em um ponto que já tem inércia."],
  ports: [ph("a", "Eixo", "rot", "right"), inp("u", "Velocidade angular", "ω", "rad/s")],
  params: [],
});

reg({
  type: "rot.ground",
  label: "Carcaça (referência fixa)",
  category: "rot",
  prefix: "Carcaça",
  symbol: "wall",
  kind: "gnd",
  description: "Referência fixa para a rotação, com velocidade angular zero.",
  model: "ω = 0",
  hypotheses: ["Indeformável e imóvel."],
  ports: [ph("a", "Lado esquerdo", "rot", "left", "", "n"), ph("b", "Lado direito", "rot", "right", "", "n")],
  params: [],
});

reg({
  type: "rot.gear",
  label: "Engrenagem (redutor)",
  category: "rot",
  prefix: "Redutor",
  symbol: "gear",
  kind: "xfm",
  description: "Par de engrenagens ideal. A saída gira mais devagar e com mais torque.",
  model: "ω_b = ω_a / N;  τ_b = N · τ_a",
  hypotheses: ["Sem folga, sem atrito e sem perdas. A inércia da saída aparece multiplicada por 1/N² no lado da entrada.", "Mudar a relação durante a simulação reinicia o sistema."],
  ports: [ph("a", "Entrada (rápida)", "rot", "left"), ph("b", "Saída (lenta)", "rot", "right")],
  params: [num("N", "Relação de redução N", "", 5, { min: 0.01, structural: true, hint: "N maior que 1 reduz a velocidade e aumenta o torque." })],
});

// ======================================================================== Elétrico

reg({
  type: "elec.resistor",
  label: "Resistor",
  category: "elec",
  prefix: "R",
  symbol: "resistor",
  kind: "res",
  description: "Resistor ôhmico.",
  model: "v = R · i",
  hypotheses: ["Linear e sem aquecimento."],
  ports: [ph("a", "Terminal a", "elec", "left"), ph("b", "Terminal b", "elec", "right"), out("i", "Corrente (a para b)", "i", "A"), out("v", "Tensão (a menos b)", "v", "V")],
  params: [num("R", "Resistência", "Ω", 100, { min: 1e-9 })],
});

reg({
  type: "elec.capacitor",
  label: "Capacitor",
  category: "elec",
  prefix: "C",
  symbol: "capacitor",
  kind: "cap2",
  description: "Capacitor ideal.",
  model: "C · dv/dt = i",
  hypotheses: ["Sem fuga e sem resistência série."],
  ports: [ph("a", "Terminal a", "elec", "left"), ph("b", "Terminal b", "elec", "right"), out("v", "Tensão (a menos b)", "v", "V")],
  params: [num("C", "Capacitância", "F", 0.001, { min: 1e-12 }), init("v0", "Tensão inicial", "V", 0)],
});

reg({
  type: "elec.inductor",
  label: "Indutor",
  category: "elec",
  prefix: "L",
  symbol: "inductor",
  kind: "ind",
  description: "Indutor ideal.",
  model: "L · di/dt = v",
  hypotheses: ["Sem resistência série e sem saturação do núcleo."],
  ports: [ph("a", "Terminal a", "elec", "left"), ph("b", "Terminal b", "elec", "right"), out("i", "Corrente (a para b)", "i", "A")],
  params: [num("L", "Indutância", "H", 0.1, { min: 1e-9 }), init("i0", "Corrente inicial", "A", 0)],
});

reg({
  type: "elec.vsource",
  label: "Fonte de tensão",
  category: "elec",
  prefix: "V",
  symbol: "vsource",
  kind: "vsrc",
  description: "Fonte de tensão ideal comandada por um sinal. O terminal p fica mais positivo que o n quando o sinal é positivo.",
  model: "v_p − v_n = u(t)",
  hypotheses: ["Resistência interna zero: ligue um resistor se quiser uma fonte real.", "Não ligue em paralelo com um capacitor sem resistência."],
  ports: [ph("p", "Terminal positivo", "elec", "top", "+"), ph("n", "Terminal negativo", "elec", "bottom", "−"), inp("u", "Tensão", "u", "V", "left")],
  params: [],
});

reg({
  type: "elec.isource",
  label: "Fonte de corrente",
  category: "elec",
  prefix: "I",
  symbol: "isource",
  kind: "isrc",
  description: "Fonte de corrente ideal comandada por um sinal. A corrente sai do terminal p para o circuito.",
  model: "i = u(t)",
  hypotheses: ["Resistência interna infinita."],
  ports: [ph("p", "Terminal p (corrente sai)", "elec", "top", "+"), ph("n", "Terminal n (corrente entra)", "elec", "bottom", "−"), inp("u", "Corrente", "u", "A", "left")],
  params: [],
});

reg({
  type: "elec.ground",
  label: "Terra",
  category: "elec",
  prefix: "Terra",
  symbol: "egnd",
  kind: "gnd",
  description: "Ponto de referência com tensão zero. Todo circuito precisa de pelo menos um terra.",
  model: "v = 0",
  hypotheses: [],
  ports: [ph("a", "Terra", "elec", "top")],
  params: [],
});

reg({
  type: "elec.voltmeter",
  label: "Voltímetro",
  category: "elec",
  prefix: "Voltímetro",
  symbol: "voltmeter",
  kind: "vmeter",
  description: "Mede a tensão entre dois pontos sem influenciar o circuito.",
  model: "v = v_a − v_b",
  hypotheses: ["Resistência interna infinita."],
  ports: [ph("a", "Ponto a", "elec", "left"), ph("b", "Ponto b", "elec", "right"), out("v", "Tensão (a menos b)", "v", "V")],
  params: [],
});

// ======================================================================== Eletromecânico

reg({
  type: "electromech.motor",
  label: "Motor CC",
  category: "electromech",
  prefix: "Motor",
  symbol: "motor",
  kind: "motor",
  description: "Motor de corrente contínua com ímã permanente. Converte tensão em torque no eixo.",
  model: "La · di/dt = v − Ra·i − K·ω;  J · dω/dt = K·i − b·ω − torque da carga",
  hypotheses: ["Constante de torque igual à constante de tensão (K em unidades SI).", "A inércia J e o atrito b são do rotor. A carga acoplada ao eixo soma a sua inércia.", "Sem saturação magnética e sem atrito seco."],
  ports: [
    ph("p", "Terminal positivo", "elec", "left"),
    ph("n", "Terminal negativo", "elec", "left"),
    ph("s", "Eixo", "rot", "right"),
    out("i", "Corrente de armadura", "i", "A", "top"),
    out("w", "Velocidade angular", "ω", "rad/s", "top"),
    out("th", "Ângulo do eixo", "θ", "rad", "top"),
    out("tau", "Torque do motor", "τ", "N·m", "top"),
  ],
  params: [
    num("Ra", "Resistência da armadura", "Ω", 2, { min: 1e-6 }),
    num("La", "Indutância da armadura", "H", 0.005, { min: 1e-7 }),
    num("K", "Constante do motor", "N·m/A", 0.1, { min: 1e-6, hint: "Em unidades SI, N·m/A e V·s/rad são iguais." }),
    num("J", "Inércia do rotor", "kg·m²", 0.005, { min: 1e-9 }),
    num("b", "Atrito viscoso do rotor", "N·m·s/rad", 0.001, { min: 0 }),
    init("th0", "Ângulo inicial", "rad", 0),
    init("w0", "Velocidade angular inicial", "rad/s", 0),
  ],
});
