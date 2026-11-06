// CIs de portas lógicas: família TTL (74xx) e CMOS (40xx).

import { CMOS_SPECS, type Datasheet, type FnTable, type Pin, SIM_NOTES, TTL_LS_SPECS, TTL_STD_SPECS } from "./datasheet";
import { defineIC } from "./define";
import { gatesScene } from "./scene";

type Op = "and" | "or" | "nand" | "nor" | "xor" | "not";
const OPS: Record<Op, { fn: (b: number[]) => number; sym: string; name: string }> = {
  and: { fn: (b) => (b.every((v) => v === 1) ? 1 : 0), sym: "·", name: "E (AND)" },
  or: { fn: (b) => (b.some((v) => v === 1) ? 1 : 0), sym: "+", name: "OU (OR)" },
  nand: { fn: (b) => (b.every((v) => v === 1) ? 0 : 1), sym: "·", name: "NÃO-E (NAND)" },
  nor: { fn: (b) => (b.some((v) => v === 1) ? 0 : 1), sym: "+", name: "NÃO-OU (NOR)" },
  xor: { fn: (b) => b.reduce((a, v) => a ^ v, 0), sym: "⊕", name: "OU exclusivo (XOR)" },
  not: { fn: (b) => 1 - b[0], sym: "", name: "Inversor (NOT)" },
};

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const GND = (n: number, cmos = false) => P(n, cmos ? "VSS" : "GND", "pwr", cmos ? "Terra (0 V)" : "Terra (0 V)");
const VCC = (n: number, cmos = false) => P(n, cmos ? "VDD" : "VCC", "pwr", cmos ? "Alimentação positiva" : "Alimentação +5 V");

interface GateGroup {
  ins: string[];
  out: string;
}

function truth(op: Op, nIn: number): FnTable {
  const o = OPS[op];
  const head = [...Array.from({ length: nIn }, (_, i) => String.fromCharCode(65 + i)), "Y"];
  if (nIn > 3) {
    const all1 = o.fn(new Array(nIn).fill(1)),
      other = o.fn([0, ...new Array(nIn - 1).fill(1)]);
    return { title: "Tabela verdade", head: ["Entradas", "Y"], rows: [["todas em 1", String(all1)], ["pelo menos uma em 0", String(other)]] };
  }
  const rows: string[][] = [];
  for (let v = 0; v < 2 ** nIn; v++) {
    const bits = Array.from({ length: nIn }, (_, i) => (v >> (nIn - 1 - i)) & 1);
    rows.push([...bits.map(String), String(o.fn(bits))]);
  }
  return { title: "Tabela verdade (cada porta)", head, rows };
}

const eq = (op: Op, nIn: number, sym = OPS[op].sym) => {
  const ins = Array.from({ length: nIn }, (_, i) => String.fromCharCode(65 + i));
  const body = op === "not" ? "A" : ins.join(sym === "+" ? " + " : sym === "⊕" ? " ⊕ " : " · ");
  return op === "nand" || op === "nor" ? `Y = (${body})̅` : op === "not" ? "Y = A̅" : `Y = ${body}`;
};

interface GateIC {
  part: string;
  op: Op;
  cmos: boolean;
  pins: Pin[];
  groups: GateGroup[];
  title: string;
  alt: string;
  extraNotes?: string[];
  extraModel?: string[];
  apps: string[];
  tpd?: string;
  prefix?: string;
}

function gateIC(g: GateIC): void {
  const nIn = g.groups[0].ins.length;
  const specs: [string, string][] = [...(g.cmos ? CMOS_SPECS : g.part.startsWith("74") && g.alt.includes("LS") ? TTL_LS_SPECS : TTL_STD_SPECS), ["Atraso de propagação típico", g.tpd ?? (g.cmos ? "cerca de 60 ns a 10 V (maior a 5 V)" : "cerca de 10 ns")], ["Encapsulamento", `DIP-${g.pins.length}`]];
  const ds: Omit<Datasheet, "part" | "pins" | "pkg"> = {
    alt: g.alt,
    title: g.title,
    family: g.cmos ? "CMOS" : "TTL",
    description: `${g.title}. ${g.groups.length} porta${g.groups.length > 1 ? "s" : ""} independente${g.groups.length > 1 ? "s" : ""} no mesmo encapsulamento, ${nIn === 1 ? "com uma entrada" : `com ${nIn} entradas`} cada.`,
    specs,
    tables: [truth(g.op, nIn)],
    notes: [
      `Equação de cada porta: ${eq(g.op, nIn)}.`,
      g.cmos ? "Entradas de portas não usadas devem ir a VDD ou GND. Entrada CMOS solta capta ruído e pode aquecer o CI." : "Entradas TTL soltas equivalem a nível alto, mas captam ruído. Ligue as entradas não usadas em nível definido.",
      ...(g.extraNotes ?? []),
    ],
    model: [...SIM_NOTES, ...(g.extraModel ?? [])],
    diagramTitle: "Circuito interno (portas e pinos)",
    diagram: gatesScene(g.op === "not" ? "not" : g.op, g.groups, g.pins),
    apps: g.apps,
  };
  defineIC({
    part: g.part,
    label: `${g.part} · ${g.title}`,
    category: "icgate",
    prefix: g.prefix ?? "U",
    keywords: `${OPS[g.op].name} ${g.op} porta logica gate ${g.op === "nand" ? "universal nao e" : g.op === "nor" ? "universal nao ou" : g.op === "xor" ? "ou exclusivo paridade comparador igualdade" : g.op === "not" ? "inversor negacao" : g.op === "and" ? "e porta and" : "ou porta or"}`,
    ds,
    pins: g.pins,
    update: (c) => {
      for (const gr of g.groups) {
        const bits = gr.ins.map((id) => c.n[id.replace(/^!/, "n")]);
        c.set(gr.out, OPS[g.op].fn(bits));
      }
    },
  });
}

const std4 = (cmos: false): Pin[] => [
  P(1, "1A", "in", "Porta 1, entrada A"), P(2, "1B", "in", "Porta 1, entrada B"), P(3, "1Y", "out", "Porta 1, saída"),
  P(4, "2A", "in", "Porta 2, entrada A"), P(5, "2B", "in", "Porta 2, entrada B"), P(6, "2Y", "out", "Porta 2, saída"), GND(7, cmos),
  P(8, "3Y", "out", "Porta 3, saída"), P(9, "3A", "in", "Porta 3, entrada A"), P(10, "3B", "in", "Porta 3, entrada B"),
  P(11, "4Y", "out", "Porta 4, saída"), P(12, "4A", "in", "Porta 4, entrada A"), P(13, "4B", "in", "Porta 4, entrada B"), VCC(14, cmos),
];
const quad: GateGroup[] = [1, 2, 3, 4].map((i) => ({ ins: [`${i}A`, `${i}B`], out: `${i}Y` }));

const T = (part: string, op: Op, title: string, alt: string, apps: string[], extra: Partial<GateIC> = {}) =>
  gateIC({ part, op, cmos: false, pins: std4(false), groups: quad, title, alt, apps, ...extra });

T("7400", "nand", "4 portas NAND de 2 entradas", "74LS00, 74HC00, SN7400", ["Porta universal: qualquer função lógica sai só com NAND.", "Latch SR com duas NAND cruzadas.", "Inversor: ligue as duas entradas juntas."]);
T("7403", "nand", "4 portas NAND de 2 entradas, coletor aberto", "74LS03, SN5403, SN74LS03", ["Saídas ligadas em fio formam um AND (wired-AND).", "Aciona carga de tensão maior que 5 V com pull-up externo.", "Barramento compartilhado de várias saídas."], {
  extraNotes: ["A saída é de coletor aberto: só puxa para 0 V. Em nível alto fica solta e precisa de um resistor de pull-up para +VCC (1 kΩ a 10 kΩ é comum).", "Corrente de saída em nível baixo: 8 mA (74LS03) e 16 mA (7403)."],
  extraModel: ["O coletor aberto é tratado como saída lógica comum de 0 ou 1: o pull-up é considerado ligado."],
});
T("7408", "and", "4 portas AND de 2 entradas", "74LS08, 74HC08, DM7408", ["Habilitar um sinal com outro (ENABLE).", "Combinar condições: todas precisam valer 1.", "Decodificação de estados nos controladores."], { tpd: "cerca de 17 ns (7408) a 9 ns (74LS08)" });
T("7432", "or", "4 portas OR de 2 entradas", "74LS32, 74HC32, SN7432", ["Juntar causas: qualquer uma ativa a saída (alarme com vários sensores).", "Soma lógica nos controladores."]);
T("7486", "xor", "4 portas XOR (OU exclusivo) de 2 entradas", "74LS86, 74HC86, SN7486", ["Detector de diferença: Y = 1 quando as entradas são diferentes.", "Bit de paridade e somadores.", "Inversor controlado: Y = A ⊕ 1 = A̅."], { prefix: "U" });

gateIC({
  part: "7402", op: "nor", cmos: false, title: "4 portas NOR de 2 entradas", alt: "74LS02, 74HC02, SN7402",
  pins: [
    P(1, "1Y", "out", "Porta 1, saída"), P(2, "1A", "in", "Porta 1, entrada A"), P(3, "1B", "in", "Porta 1, entrada B"),
    P(4, "2Y", "out", "Porta 2, saída"), P(5, "2A", "in", "Porta 2, entrada A"), P(6, "2B", "in", "Porta 2, entrada B"), GND(7),
    P(8, "3A", "in", "Porta 3, entrada A"), P(9, "3B", "in", "Porta 3, entrada B"), P(10, "3Y", "out", "Porta 3, saída"),
    P(11, "4A", "in", "Porta 4, entrada A"), P(12, "4B", "in", "Porta 4, entrada B"), P(13, "4Y", "out", "Porta 4, saída"), VCC(14),
  ],
  groups: quad,
  apps: ["Latch SR com duas NOR cruzadas.", "Porta universal, como a NAND.", "Inversor: ligue as duas entradas juntas."],
  extraNotes: ["Atenção: nesta pinagem a saída vem antes das entradas (pino 1 é saída). É diferente do 7400."],
});

gateIC({
  part: "7404", op: "not", cmos: false, title: "6 inversores (NOT)", alt: "74LS04, 74HC04, SN7404",
  pins: [
    P(1, "1A", "in", "Inversor 1, entrada"), P(2, "1Y", "out", "Inversor 1, saída"), P(3, "2A", "in", "Inversor 2, entrada"), P(4, "2Y", "out", "Inversor 2, saída"),
    P(5, "3A", "in", "Inversor 3, entrada"), P(6, "3Y", "out", "Inversor 3, saída"), GND(7),
    P(8, "4Y", "out", "Inversor 4, saída"), P(9, "4A", "in", "Inversor 4, entrada"), P(10, "5Y", "out", "Inversor 5, saída"), P(11, "5A", "in", "Inversor 5, entrada"),
    P(12, "6Y", "out", "Inversor 6, saída"), P(13, "6A", "in", "Inversor 6, entrada"), VCC(14),
  ],
  groups: [1, 2, 3, 4, 5, 6].map((i) => ({ ins: [`${i}A`], out: `${i}Y` })),
  apps: ["Complemento de sinais (A̅).", "Oscilador de anel com número ímpar de inversores.", "Regenerar um nível lógico degradado."],
});

gateIC({
  part: "7414", op: "not", cmos: false, title: "6 inversores com entrada Schmitt trigger", alt: "74LS14, 74HC14, SN7414",
  pins: [
    P(1, "1A", "in", "Inversor 1, entrada"), P(2, "1Y", "out", "Inversor 1, saída"), P(3, "2A", "in", "Inversor 2, entrada"), P(4, "2Y", "out", "Inversor 2, saída"),
    P(5, "3A", "in", "Inversor 3, entrada"), P(6, "3Y", "out", "Inversor 3, saída"), GND(7),
    P(8, "4Y", "out", "Inversor 4, saída"), P(9, "4A", "in", "Inversor 4, entrada"), P(10, "5Y", "out", "Inversor 5, saída"), P(11, "5A", "in", "Inversor 5, entrada"),
    P(12, "6Y", "out", "Inversor 6, saída"), P(13, "6A", "in", "Inversor 6, entrada"), VCC(14),
  ],
  groups: [1, 2, 3, 4, 5, 6].map((i) => ({ ins: [`${i}A`], out: `${i}Y` })),
  apps: ["Limpar sinais lentos ou ruidosos (botões, sensores).", "Oscilador RC simples com um resistor e um capacitor.", "Debounce de chave."],
  extraNotes: ["Limiares com histerese (típico 74LS14): VT+ ≈ 1,6 V e VT− ≈ 0,8 V. A histerese evita chaveamentos falsos em sinais lentos."],
  extraModel: ["A histerese analógica não é modelada: o bloco é um inversor lógico ideal. Para histerese use o comparador com histerese da biblioteca."],
  tpd: "cerca de 15 ns",
});

gateIC({
  part: "7410", op: "nand", cmos: false, title: "3 portas NAND de 3 entradas", alt: "74LS10, 74HC10, SN7410",
  pins: [
    P(1, "1A", "in", "Porta 1, entrada A"), P(2, "1B", "in", "Porta 1, entrada B"), P(3, "2A", "in", "Porta 2, entrada A"), P(4, "2B", "in", "Porta 2, entrada B"),
    P(5, "2C", "in", "Porta 2, entrada C"), P(6, "2Y", "out", "Porta 2, saída"), GND(7),
    P(8, "3Y", "out", "Porta 3, saída"), P(9, "3A", "in", "Porta 3, entrada A"), P(10, "3B", "in", "Porta 3, entrada B"), P(11, "3C", "in", "Porta 3, entrada C"),
    P(12, "1Y", "out", "Porta 1, saída"), P(13, "1C", "in", "Porta 1, entrada C"), VCC(14),
  ],
  groups: [1, 2, 3].map((i) => ({ ins: [`${i}A`, `${i}B`, `${i}C`], out: `${i}Y` })),
  apps: ["Decodificar um estado de 3 bits (detecta 111).", "Portas de reset em contadores de módulo menor que 2ⁿ."],
});

gateIC({
  part: "7420", op: "nand", cmos: false, title: "2 portas NAND de 4 entradas", alt: "74LS20, 74HC20, SN7420",
  pins: [
    P(1, "1A", "in", "Porta 1, entrada A"), P(2, "1B", "in", "Porta 1, entrada B"), P(3, "NC", "nc", "Sem conexão"), P(4, "1C", "in", "Porta 1, entrada C"),
    P(5, "1D", "in", "Porta 1, entrada D"), P(6, "1Y", "out", "Porta 1, saída"), GND(7),
    P(8, "2Y", "out", "Porta 2, saída"), P(9, "2A", "in", "Porta 2, entrada A"), P(10, "2B", "in", "Porta 2, entrada B"), P(11, "NC", "nc", "Sem conexão"),
    P(12, "2C", "in", "Porta 2, entrada C"), P(13, "2D", "in", "Porta 2, entrada D"), VCC(14),
  ],
  groups: [1, 2].map((i) => ({ ins: [`${i}A`, `${i}B`, `${i}C`, `${i}D`], out: `${i}Y` })),
  apps: ["Zerar um contador de década na contagem 10 (1010 detectado pelas saídas).", "Detectar um estado de 4 bits."],
});

// ------------------------------------------------------------------------------------------------ CMOS 4000

const cmosQuad = (): Pin[] => [
  P(1, "1A", "in", "Porta 1, entrada A"), P(2, "1B", "in", "Porta 1, entrada B"), P(3, "1Y", "out", "Porta 1, saída (J)"), P(4, "2Y", "out", "Porta 2, saída (K)"),
  P(5, "2A", "in", "Porta 2, entrada A"), P(6, "2B", "in", "Porta 2, entrada B"), GND(7, true),
  P(8, "3A", "in", "Porta 3, entrada A"), P(9, "3B", "in", "Porta 3, entrada B"), P(10, "3Y", "out", "Porta 3, saída (L)"), P(11, "4Y", "out", "Porta 4, saída (M)"),
  P(12, "4A", "in", "Porta 4, entrada A"), P(13, "4B", "in", "Porta 4, entrada B"), VCC(14, true),
];
const C = (part: string, op: Op, title: string, alt: string, apps: string[]) =>
  gateIC({ part, op, cmos: true, pins: cmosQuad(), groups: quad, title, alt, apps, extraNotes: ["Nos datasheets da RCA as saídas das quatro portas aparecem como J, K, L e M."] });

C("4001", "nor", "4 portas NOR de 2 entradas (CMOS)", "CD4001B, MC14001B, HEF4001B", ["Latch SR com duas NOR.", "Lógica de baixo consumo alimentada de 3 a 15 V."]);
C("4011", "nand", "4 portas NAND de 2 entradas (CMOS)", "CD4011B, MC14011B, HEF4011B", ["Osciladores RC com NAND e resistor.", "Lógica de baixo consumo."]);
C("4071", "or", "4 portas OR de 2 entradas (CMOS)", "CD4071B, MC14071B, HEF4071B", ["Combinar saídas de contadores e sensores.", "Portas lógicas em circuitos alimentados por bateria."]);
C("4081", "and", "4 portas AND de 2 entradas (CMOS)", "CD4081B, MC14081B, HEF4081B", ["Habilitar sinais (ENABLE).", "Combinar condições em controladores CMOS."]);

gateIC({
  part: "4012", op: "nand", cmos: true, title: "2 portas NAND de 4 entradas (CMOS)", alt: "CD4012B, CD4012A, MC14012B",
  pins: [
    P(1, "1Y", "out", "Porta 1, saída (J)"), P(2, "1A", "in", "Porta 1, entrada A"), P(3, "1B", "in", "Porta 1, entrada B"), P(4, "1C", "in", "Porta 1, entrada C"), P(5, "1D", "in", "Porta 1, entrada D"),
    P(6, "NC", "nc", "Sem conexão"), GND(7, true), P(8, "NC", "nc", "Sem conexão"),
    P(9, "2A", "in", "Porta 2, entrada A"), P(10, "2B", "in", "Porta 2, entrada B"), P(11, "2C", "in", "Porta 2, entrada C"), P(12, "2D", "in", "Porta 2, entrada D"), P(13, "2Y", "out", "Porta 2, saída (K)"), VCC(14, true),
  ],
  groups: [1, 2].map((i) => ({ ins: [`${i}A`, `${i}B`, `${i}C`, `${i}D`], out: `${i}Y` })),
  apps: ["Detectar um estado de 4 bits e zerar contadores CMOS.", "Reset de um contador de módulo menor que 16."],
});

gateIC({
  part: "4069", op: "not", cmos: true, title: "6 inversores (CMOS)", alt: "CD4069UB, MC14069UB, HEF4069UB",
  pins: [
    P(1, "1A", "in", "Inversor 1, entrada"), P(2, "1Y", "out", "Inversor 1, saída"), P(3, "2A", "in", "Inversor 2, entrada"), P(4, "2Y", "out", "Inversor 2, saída"),
    P(5, "3A", "in", "Inversor 3, entrada"), P(6, "3Y", "out", "Inversor 3, saída"), GND(7, true),
    P(8, "4Y", "out", "Inversor 4, saída"), P(9, "4A", "in", "Inversor 4, entrada"), P(10, "5Y", "out", "Inversor 5, saída"), P(11, "5A", "in", "Inversor 5, entrada"),
    P(12, "6Y", "out", "Inversor 6, saída"), P(13, "6A", "in", "Inversor 6, entrada"), VCC(14, true),
  ],
  groups: [1, 2, 3, 4, 5, 6].map((i) => ({ ins: [`${i}A`], out: `${i}Y` })),
  apps: ["Osciladores RC com dois ou três inversores.", "Complemento de sinais em lógica CMOS."],
});
