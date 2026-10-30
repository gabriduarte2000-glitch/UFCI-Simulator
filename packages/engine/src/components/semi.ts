// Semicondutores, amplificador operacional, chave controlada e temporizador 555.
// O comportamento está no montador físico (physical.ts), que resolve a rede com Newton-Raphson.

import type { Domain, ParamDef, PortDef } from "../types";
import { registerComponent } from "./registry";

type Side = NonNullable<PortDef["side"]>;
const ph = (name: string, label: string, side: Side, short = ""): PortDef => ({ name, label, domain: "elec" as Domain, dir: "phys", side, short });
const out = (name: string, label: string, short: string, unit: string, side: Side = "right"): PortDef => ({ name, label, domain: "signal", dir: "out", short, unit, side });
const num = (key: string, label: string, unit: string, def: number, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, unit, kind: "number", default: def, group: "basic", ...extra });
const adv = (key: string, label: string, unit: string, def: number, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, unit, kind: "number", default: def, group: "advanced", ...extra });

const NL = "O circuito é resolvido com o método de Newton-Raphson a cada passo. Valores padrão ilustrativos.";

const COLORS: ParamDef = { key: "color", label: "Cor", kind: "select", default: "red", options: [{ value: "red", label: "Vermelho" }, { value: "green", label: "Verde" }, { value: "yellow", label: "Amarelo" }, { value: "blue", label: "Azul" }], group: "basic" };

registerComponent({
  type: "elec.diode",
  label: "Diodo",
  category: "semi",
  labelPrefix: "D",
  symbol: "diode",
  description: "Diodo de junção. Conduz do ânodo (a) para o cátodo (b) e bloqueia no sentido contrário.",
  model: "i = Is · (e^(v / (n·Vt)) − 1)",
  hypotheses: ["Equação de Shockley, sem capacitância de junção nem tempo de recuperação.", "Vt = 25,85 mV (300 K).", NL],
  physical: { kind: "diode" },
  ports: [ph("a", "Ânodo", "left", ""), ph("b", "Cátodo", "right", ""), out("i", "Corrente (ânodo para cátodo)", "i", "A", "bottom"), out("v", "Tensão (ânodo menos cátodo)", "v", "V", "bottom")],
  params: [num("Is", "Corrente de saturação Is", "A", 1e-14, { min: 1e-20 }), adv("n", "Fator de idealidade n", "", 1, { min: 0.5, max: 4 })],
});

registerComponent({
  type: "elec.led",
  label: "LED",
  category: "semi",
  labelPrefix: "LED",
  symbol: "led",
  description: "Diodo emissor de luz. Queda de uns 1,9 V quando acende. O brilho acompanha a corrente. Sempre use um resistor em série.",
  model: "i = Is · (e^(v / (n·Vt)) − 1);  brilho ∝ i",
  hypotheses: ["Mesma equação do diodo, com Is pequena e n = 2 para dar uns 2 V de queda.", "Considera-se 20 mA como brilho máximo no desenho.", NL],
  physical: { kind: "diode" },
  ports: [ph("a", "Ânodo", "left", ""), ph("b", "Cátodo", "right", ""), out("i", "Corrente (ânodo para cátodo)", "i", "A", "bottom"), out("v", "Tensão (ânodo menos cátodo)", "v", "V", "bottom")],
  params: [num("Is", "Corrente de saturação Is", "A", 1e-18, { min: 1e-24 }), adv("n", "Fator de idealidade n", "", 2, { min: 0.5, max: 4 }), COLORS],
});

registerComponent({
  type: "elec.zener",
  label: "Diodo Zener",
  category: "semi",
  labelPrefix: "DZ",
  symbol: "zener",
  description: "Diodo que, polarizado ao contrário, segura a tensão em torno de Vz. Base dos reguladores simples.",
  model: "direto: Shockley;  reverso: ruptura em v ≈ −Vz (rz ≈ 5 Ω)",
  hypotheses: ["Ruptura modelada por uma exponencial que vale 5 mA em v = −Vz.", NL],
  physical: { kind: "diode" },
  ports: [ph("a", "Ânodo", "left", ""), ph("b", "Cátodo", "right", ""), out("i", "Corrente (ânodo para cátodo)", "i", "A", "bottom"), out("v", "Tensão (ânodo menos cátodo)", "v", "V", "bottom")],
  params: [num("Vz", "Tensão Zener Vz", "V", 5.1, { min: 0.5, max: 200 }), adv("Is", "Corrente de saturação Is", "A", 1e-14, { min: 1e-20 }), adv("n", "Fator de idealidade n", "", 1, { min: 0.5, max: 4 })],
});

const bjtPorts = (pnp = false): PortDef[] => [
  ph("c", "Coletor", pnp ? "bottom" : "top", "C"),
  ph("b", "Base", "left", "B"),
  ph("e", "Emissor", pnp ? "top" : "bottom", "E"),
  out("ic", "Corrente de coletor (entra)", "Ic", "A"),
  out("ib", "Corrente de base (entra)", "Ib", "A"),
  out("vbe", "Tensão base-emissor", "Vbe", "V"),
  out("vce", "Tensão coletor-emissor", "Vce", "V"),
];
const bjtParams = (): ParamDef[] => [
  num("bf", "Ganho de corrente β (direto)", "", 100, { min: 1, max: 2000 }),
  adv("Is", "Corrente de saturação Is", "A", 1e-14, { min: 1e-20 }),
  adv("br", "Ganho reverso βR", "", 1, { min: 0.01, max: 100 }),
  adv("VA", "Tensão de Early (0 = ignorar)", "V", 0, { min: 0, hint: "Com valor maior que zero, Ic cresce um pouco com Vce (resistência de saída ro = VA/Ic)." }),
];

registerComponent({
  type: "elec.npn",
  label: "Transistor NPN (BJT)",
  category: "semi",
  labelPrefix: "Q",
  symbol: "npn",
  description: "Transistor bipolar NPN. Uma pequena corrente de base controla uma corrente maior de coletor para emissor.",
  model: "Ebers-Moll:  Ic = Is(e^(Vbe/Vt) − e^(Vbc/Vt)) − (Is/βR)(e^(Vbc/Vt) − 1);  Ib = (Is/βF)(e^(Vbe/Vt) − 1) + (Is/βR)(e^(Vbc/Vt) − 1)",
  hypotheses: ["Modelo estático de Ebers-Moll, sem capacitâncias: não há limite de frequência.", "Na região ativa, Ic ≈ β · Ib.", NL],
  physical: { kind: "bjt" },
  ports: bjtPorts(),
  params: bjtParams(),
});

registerComponent({
  type: "elec.pnp",
  label: "Transistor PNP (BJT)",
  category: "semi",
  labelPrefix: "Q",
  symbol: "pnp",
  description: "Transistor bipolar PNP. É o espelho do NPN: as tensões e correntes têm sinal oposto.",
  model: "Mesmas equações do NPN, com as tensões e as correntes invertidas",
  hypotheses: ["Modelo estático de Ebers-Moll, sem capacitâncias.", "Emissor em cima, coletor embaixo. As saídas Ic, Ib, Vbe e Vce são mostradas com o sinal trocado, positivas em operação normal: Vbe = Ve − Vb e Vce = Ve − Vc.", NL],
  physical: { kind: "bjt" },
  ports: bjtPorts(true),
  params: bjtParams(),
});

const mosPorts = (pmos = false): PortDef[] => [
  ph("d", "Dreno", pmos ? "bottom" : "top", "D"),
  ph("g", "Porta (gate)", "left", "G"),
  ph("s", "Fonte (source)", pmos ? "top" : "bottom", "S"),
  out("id", "Corrente de dreno (entra)", "Id", "A"),
  out("vgs", "Tensão porta-fonte", "Vgs", "V"),
  out("vds", "Tensão dreno-fonte", "Vds", "V"),
];
const mosParams = (): ParamDef[] => [
  num("K", "Parâmetro K = µCox·W/L", "A/V²", 0.05, { min: 1e-9 }),
  num("Vth", "Tensão de limiar |Vth|", "V", 2, { min: 0.05, max: 20 }),
  adv("lam", "Modulação de canal λ", "1/V", 0.01, { min: 0, max: 1 }),
];

registerComponent({
  type: "elec.nmos",
  label: "MOSFET canal N",
  category: "semi",
  labelPrefix: "M",
  symbol: "nmos",
  description: "MOSFET de enriquecimento canal N. A tensão porta-fonte controla a corrente de dreno; a porta não consome corrente.",
  model: "corte: Id = 0;  triodo (Vds < Vgs − Vth): Id = K[(Vgs−Vth)Vds − Vds²/2];  saturação: Id = (K/2)(Vgs−Vth)²(1 + λVds)",
  hypotheses: ["Modelo de lei quadrática (nível 1), sem capacitâncias, sem efeito de corpo.", "Dreno e fonte são simétricos: se Vds ficar negativo, os papéis se trocam.", NL],
  physical: { kind: "mos" },
  ports: mosPorts(),
  params: mosParams(),
});

registerComponent({
  type: "elec.pmos",
  label: "MOSFET canal P",
  category: "semi",
  labelPrefix: "M",
  symbol: "pmos",
  description: "MOSFET de enriquecimento canal P. Liga quando a porta fica abaixo da fonte por mais que |Vth|.",
  model: "Mesmas equações do canal N com todas as tensões e correntes invertidas",
  hypotheses: ["Modelo de lei quadrática (nível 1), sem capacitâncias, sem efeito de corpo.", NL],
  physical: { kind: "mos" },
  ports: mosPorts(true),
  params: mosParams(),
});

registerComponent({
  type: "elec.opamp",
  label: "Amplificador operacional",
  category: "semi",
  labelPrefix: "AO",
  symbol: "opamp",
  description: "Amp-op com ganho alto e saturação nos limites de alimentação. Com realimentação negativa, a tensão entre as entradas vai a quase zero.",
  model: "Vo = Vmed + Vspan · g(u),  u = A0 · (V+ − V−) / Vspan,  g(u) = u / (1 + |u|⁸)^(1/8)",
  hypotheses: ["Corrente de entrada zero e saída com impedância zero (fonte de tensão controlada).", "Sem limite de banda nem de slew rate.", "Os limites de saturação substituem os pinos de alimentação.", NL],
  physical: { kind: "opamp" },
  ports: [ph("n", "Entrada inversora (−)", "left", "−"), ph("p", "Entrada não inversora (+)", "left", "+"), ph("o", "Saída", "right", ""), out("vo", "Tensão de saída", "Vo", "V", "bottom"), out("vd", "Tensão diferencial (+ menos −)", "Vd", "V", "bottom")],
  params: [
    num("A0", "Ganho em malha aberta A0", "", 1e5, { min: 10, max: 1e9 }),
    num("vpos", "Saturação positiva", "V", 12),
    num("vneg", "Saturação negativa", "V", -12),
  ],
});

registerComponent({
  type: "elec.switch",
  label: "Chave comandada",
  category: "semi",
  labelPrefix: "SW",
  symbol: "switch",
  description: "Chave entre os terminais a e b, fechada quando o sinal de comando é maior ou igual a 0,5. Serve para ligar um transistor ideal, relé, PWM ou lógica digital ao circuito.",
  model: "Ron se u ≥ 0,5;  Roff caso contrário",
  hypotheses: ["O instante da troca é calculado com precisão, não só no fim do passo.", "Sem arco nem tempo de comutação."],
  physical: { kind: "sw" },
  ports: [ph("a", "Terminal a", "left", ""), ph("b", "Terminal b", "right", ""), { name: "u", label: "Comando", domain: "signal", dir: "in", short: "u", unit: "", side: "top" }, out("i", "Corrente (a para b)", "i", "A", "bottom")],
  params: [num("Ron", "Resistência fechada", "Ω", 0.1, { min: 1e-6 }), adv("Roff", "Resistência aberta", "Ω", 1e9, { min: 1 })],
});

registerComponent({
  type: "elec.timer555",
  label: "Temporizador 555",
  category: "dseq",
  labelPrefix: "555",
  symbol: "ic-555",
  description: "CI 555: dois comparadores (1/3 e 2/3 de Vcc), um latch e um transistor de descarga. Gera pulsos (astável) ou atrasos (monoestável) com um resistor e um capacitor.",
  model: "TRIG < Vcc/3 → saída 1 (descarga aberta);  THR > 2·Vcc/3 → saída 0 (DIS ligado ao terra por Rdis);  RESET = 0 → saída 0",
  hypotheses: [
    "Os comparadores são ideais e não puxam corrente. A tensão de alimentação Vcc é um parâmetro: use o mesmo valor da fonte do circuito.",
    "A saída OUT é um nível lógico (0 ou 1). Ligue um ganho e uma fonte de tensão para acionar cargas.",
    "O transistor de descarga fecha com resistência Rdis.",
  ],
  physical: { kind: "t555" },
  ports: [
    ph("trig", "Disparo (TRIG)", "left", "TRIG"),
    ph("thr", "Limiar (THR)", "left", "THR"),
    { name: "rst", label: "Reset (ativo em nível baixo)", domain: "signal", dir: "in", optional: true, short: "RST", unit: "", side: "left" },
    { name: "out", label: "Saída (OUT)", domain: "signal", dir: "out", short: "OUT", unit: "", side: "right" },
    ph("dis", "Descarga (DIS)", "right", "DIS"),
  ],
  params: [
    num("vcc", "Tensão de alimentação Vcc", "V", 5, { min: 1, max: 40 }),
    adv("rdis", "Resistência de descarga", "Ω", 10, { min: 0.01 }),
    { key: "q0", label: "Saída inicial (sem comparador ativo)", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true },
  ],
});
