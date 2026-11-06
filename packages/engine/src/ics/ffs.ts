// CIs de flip-flops e latches.

import { CMOS_SPECS, type Pin, SIM_NOTES, TTL_LS_SPECS } from "./datasheet";
import { defineIC } from "./define";
import { box, gate, gateOutX, pinLabel, txt, wire, dot } from "./scene";
import type { Item, Scene } from "./datasheet";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const GND = (n: number, cmos = false) => P(n, cmos ? "VSS" : "GND", "pwr", "Terra (0 V)");
const VCC = (n: number, cmos = false) => P(n, cmos ? "VDD" : "VCC", "pwr", cmos ? "Alimentação positiva" : "Alimentação +5 V");

// ------------------------------------------------------------------------------------------------ diagramas

/** Flip-flop D mestre-escravo: dois latches D, o primeiro ativo com CLK em 0 e o segundo com CLK em 1. */
function dffScene(pins: Pin[], cp: { d: string; clk: string; q: string; qb: string; pre?: string; clr?: string }, cmosHigh = false): Scene {
  const n = (name: string) => pins.find((p) => p.name === name)?.n ?? "?";
  const items: Item[] = [
    box(110, 50, 100, 90, "Latch D", "mestre"),
    box(280, 50, 100, 90, "Latch D", "escravo"),
    wire([50, 80], [110, 80]), pinLabel(50, 80, "l", n(cp.d), cp.d),
    txt(116, 78, "D", "start", 9), txt(116, 128, "EN", "start", 9), txt(286, 78, "D", "start", 9), txt(286, 128, "EN", "start", 9),
    wire([210, 80], [280, 80]),
    wire([380, 80], [450, 80]), pinLabel(450, 80, "r", n(cp.q), cp.q),
    wire([380, 120], [450, 120]), pinLabel(450, 120, "r", n(cp.qb), cp.qb),
    txt(374, 78, "Q", "end", 9), txt(374, 124, "Q̅", "end", 9),
    // clock: entra por baixo, vai direto ao escravo e passa por um inversor até o mestre
    wire([50, 190], [330, 190]), pinLabel(50, 190, "l", n(cp.clk), cp.clk),
    wire([330, 190], [330, 140]), dot(330, 190),
    wire([84, 190], [84, 165]), dot(84, 190), gate(84, 165, "not", 1),
    wire([gateOutX(84, "not"), 165], [160, 165], [160, 140]),
  ];
  if (cp.pre) {
    items.push(wire([50, 24], [160, 24], [160, 50]), pinLabel(50, 24, "l", n(cp.pre), cp.pre), wire([160, 24], [330, 24], [330, 50]), dot(160, 24));
  }
  if (cp.clr) {
    items.push(wire([50, 214], [120, 214]), pinLabel(50, 214, "l", n(cp.clr), cp.clr), txt(130, 214, "(zera mestre e escravo)", "start", 9));
  }
  void cmosHigh;
  return { w: 510, h: 236, items };
}

/** JK mestre-escravo, estilo dos livros: duas NAND de entrada, latch SR mestre, inversor de clock e latch SR escravo. */
function jkScene(pins: Pin[], cp: { j: string; k: string; clk: string; q: string; qb: string; pre?: string; clr?: string }): Scene {
  const n = (name: string) => pins.find((p) => p.name === name)?.n ?? "?";
  const items: Item[] = [
    gate(90, 56, "nand", 3),
    gate(90, 156, "nand", 3),
    box(210, 62, 84, 88, "Mestre", "latch SR"),
    box(366, 62, 84, 88, "Escravo", "latch SR"),
    // J, K, CLK
    wire([40, 44], [90, 44]), pinLabel(40, 44, "l", n(cp.j), cp.j),
    wire([40, 168], [90, 168]), pinLabel(40, 168, "l", n(cp.k), cp.k),
    wire([40, 214], [310, 214]), pinLabel(40, 214, "l", n(cp.clk), cp.clk),
    wire([70, 214], [70, 68], [90, 68]), dot(70, 214),
    wire([70, 144], [90, 144]), dot(70, 144),
    // portas -> mestre
    wire([136, 56], [170, 56], [170, 88], [210, 88]), wire([136, 156], [170, 156], [170, 124], [210, 124]),
    txt(216, 92, "S", "start", 9), txt(216, 128, "R", "start", 9),
    // mestre -> escravo
    wire([294, 88], [366, 88]), wire([294, 124], [366, 124]), txt(372, 92, "S", "start", 9), txt(372, 128, "R", "start", 9),
    // clock invertido para o escravo
    gate(300, 180, "not", 1), wire([310, 214], [310, 180], [300, 180]), wire([gateOutX(300, "not"), 180], [408, 180], [408, 150]),
    // saídas
    wire([450, 88], [520, 88]), pinLabel(520, 88, "r", n(cp.q), cp.q), wire([450, 124], [520, 124]), pinLabel(520, 124, "r", n(cp.qb), cp.qb),
    // realimentação Q -> NAND de K e Q̅ -> NAND de J
    wire([486, 88], [486, 20], [78, 20], [78, 56], [90, 56]), dot(486, 88),
    wire([496, 124], [496, 244], [60, 244], [60, 156], [90, 156]), dot(496, 124),
    txt(280, 14, "Q̅ realimenta a porta de J", "middle", 9), txt(280, 238, "Q realimenta a porta de K", "middle", 9),
  ];
  if (cp.pre) items.push(wire([40, 6], [408, 6], [408, 62]), pinLabel(40, 6, "l", n(cp.pre), cp.pre));
  if (cp.clr) items.push(wire([40, 264], [420, 264], [420, 150]), pinLabel(40, 264, "l", n(cp.clr), cp.clr));
  return { w: 580, h: 280, items };
}

// ------------------------------------------------------------------------------------------------ 7474 / 4013 (D)

interface Dpins {
  part: string;
  title: string;
  alt: string;
  cmos: boolean;
  pins: Pin[];
  pre: (i: number) => string;
  clr: (i: number) => string;
  activeLow: boolean;
  fMax: string;
  tsu: string;
  apps: string[];
}

function dualD(d: Dpins): void {
  const id = (name: string) => name.replace(/^!/, "n");
  defineIC({
    part: d.part,
    label: `${d.part} · ${d.title}`,
    category: "icff",
    keywords: "flip flop ff d dado registrador memoria 1 bit borda de subida divisor de frequencia dual",
    ds: {
      alt: d.alt, title: d.title, family: d.cmos ? "CMOS" : "TTL",
      description: `${d.title}. Cada flip-flop copia D para Q na borda de subida do clock. ${d.activeLow ? "PRE e CLR são assíncronos e ativos em nível baixo." : "SET e RESET são assíncronos e ativos em nível alto."}`,
      specs: [...(d.cmos ? CMOS_SPECS : TTL_LS_SPECS), ["Clock máximo (típico)", d.fMax], ["Setup (tSU)", d.tsu], ["Encapsulamento", `DIP-${d.pins.length}`]],
      tables: [{
        title: "Tabela de função (cada flip-flop)",
        head: d.activeLow ? ["PRE", "CLR", "CLK", "D", "Q", "Q̅"] : ["SET", "RESET", "CLK", "D", "Q", "Q̅"],
        rows: d.activeLow
          ? [["0", "1", "X", "X", "1", "0"], ["1", "0", "X", "X", "0", "1"], ["0", "0", "X", "X", "1*", "1*"], ["1", "1", "↑", "1", "1", "0"], ["1", "1", "↑", "0", "0", "1"], ["1", "1", "0/1", "X", "Q₀", "Q̅₀"]]
          : [["1", "0", "X", "X", "1", "0"], ["0", "1", "X", "X", "0", "1"], ["1", "1", "X", "X", "1*", "1*"], ["0", "0", "↑", "1", "1", "0"], ["0", "0", "↑", "0", "0", "1"], ["0", "0", "0/1", "X", "Q₀", "Q̅₀"]],
        note: "↑ = borda de subida. X = qualquer. * = estado instável: as duas saídas vão a 1 e o resultado ao soltar as entradas é imprevisível. Q₀ = valor anterior.",
      }],
      notes: [
        d.activeLow ? "Ligue PRE e CLR em nível alto (+5 V) quando não forem usados. Deixar solto não é seguro em circuito real." : "Ligue SET e RESET em GND quando não forem usados.",
        "Divisor por 2: ligue Q̅ em D. A frequência em Q é metade da do clock.",
        "Os dados precisam estar estáveis um tempo antes (setup) e depois (hold) da borda do clock.",
      ],
      model: [...SIM_NOTES, d.activeLow ? "Entrada PRE ou CLR sem fio vale 1 (inativa), como num TTL real." : "SET ou RESET sem fio valem 0 (inativos).", "Com as duas assíncronas ativas, Q e Q̅ vão a 1 e permanecem assim até o próximo evento."],
      diagramTitle: "Circuito interno (diagrama funcional, mestre-escravo)",
      diagram: dffScene(d.pins, { d: "1D", clk: "1CLK", q: "1Q", qb: "!1Q", pre: d.pre(1), clr: d.clr(1) }),
      apps: d.apps,
    },
    pins: d.pins,
    update: (c) => {
      for (const i of [1, 2]) {
        const pre = d.activeLow ? 1 - c.n[id(d.pre(i))] : c.n[id(d.pre(i))];
        const clr = d.activeLow ? 1 - c.n[id(d.clr(i))] : c.n[id(d.clr(i))];
        const Q = `${i}Q`,
          QB = `n${i}Q`;
        if (pre || clr) {
          c.set(Q, pre ? 1 : 0);
          c.set(QB, clr ? 1 : 0);
          if (pre && clr) {
            c.set(Q, 1);
            c.set(QB, 1);
          }
        } else if (c.rise(`${i}CLK`)) {
          c.set(Q, c.n[`${i}D`]);
          c.set(QB, 1 - c.n[`${i}D`]);
        } else if (c.init) {
          c.set(Q, 0);
          c.set(QB, 1);
        }
      }
    },
  });
}

dualD({
  part: "7474", title: "2 flip-flops D com preset e clear", alt: "74LS74, 74HC74, SN7474", cmos: false, activeLow: true,
  pins: [
    P(1, "!1CLR", "in", "Clear assíncrono do FF1 (ativo em 0)"), P(2, "1D", "in", "Dado do FF1"), P(3, "1CLK", "in", "Clock do FF1 (borda de subida)"), P(4, "!1PRE", "in", "Preset assíncrono do FF1 (ativo em 0)"),
    P(5, "1Q", "out", "Saída Q do FF1"), P(6, "!1Q", "out", "Saída Q̅ do FF1"), GND(7),
    P(8, "!2Q", "out", "Saída Q̅ do FF2"), P(9, "2Q", "out", "Saída Q do FF2"), P(10, "!2PRE", "in", "Preset assíncrono do FF2 (ativo em 0)"),
    P(11, "2CLK", "in", "Clock do FF2 (borda de subida)"), P(12, "2D", "in", "Dado do FF2"), P(13, "!2CLR", "in", "Clear assíncrono do FF2 (ativo em 0)"), VCC(14),
  ],
  pre: (i) => `!${i}PRE`, clr: (i) => `!${i}CLR`, fMax: "33 MHz (74LS74)", tsu: "20 ns (74LS74)",
  apps: ["Divisor de frequência por 2 e por 4 em cascata.", "Registrador de 1 bit e sincronizador de entrada.", "Contador assíncrono (ripple) ligando Q̅ no clock seguinte."],
});

dualD({
  part: "4013", title: "2 flip-flops D com set e reset (CMOS)", alt: "CD4013B, MC14013B, HEF4013B", cmos: true, activeLow: false,
  pins: [
    P(1, "1Q", "out", "Saída Q do FF1"), P(2, "!1Q", "out", "Saída Q̅ do FF1"), P(3, "1CLK", "in", "Clock do FF1 (borda de subida)"), P(4, "1RESET", "in", "Reset do FF1 (ativo em 1)"),
    P(5, "1D", "in", "Dado do FF1"), P(6, "1SET", "in", "Set do FF1 (ativo em 1)"), GND(7, true),
    P(8, "2SET", "in", "Set do FF2 (ativo em 1)"), P(9, "2D", "in", "Dado do FF2"), P(10, "2RESET", "in", "Reset do FF2 (ativo em 1)"),
    P(11, "2CLK", "in", "Clock do FF2 (borda de subida)"), P(12, "!2Q", "out", "Saída Q̅ do FF2"), P(13, "2Q", "out", "Saída Q do FF2"), VCC(14, true),
  ],
  pre: (i) => `${i}SET`, clr: (i) => `${i}RESET`, fMax: "8 MHz a 5 V e 16 MHz a 10 V", tsu: "ordem de 20 a 40 ns",
  apps: ["Divisor de frequência por 2 com baixo consumo.", "Memória de 1 bit e detector de borda."],
});

// ------------------------------------------------------------------------------------------------ JK

function dualJK(o: { part: string; title: string; alt: string; cmos: boolean; pins: Pin[]; fall: boolean; activeLow: boolean; fMax: string; spec: [string, string][]; apps: string[] }): void {
  const id = (name: string) => name.replace(/^!/, "n");
  const pre = (i: number) => (o.activeLow ? `!${i}PRE` : `${i}SET`);
  const clr = (i: number) => (o.activeLow ? `!${i}CLR` : `${i}RESET`);
  const edge = o.fall ? "descida" : "subida";
  defineIC({
    part: o.part,
    label: `${o.part} · ${o.title}`,
    category: "icff",
    keywords: "flip flop ff jk toggle mestre escravo master slave borda dual divisor contador assincrono",
    ds: {
      alt: o.alt, title: o.title, family: o.cmos ? "CMOS" : "TTL",
      description: `${o.title}. Cada flip-flop muda na borda de ${edge} do clock conforme J e K. J = K = 1 inverte a saída (toggle). ${o.activeLow ? "PRE e CLR são assíncronos e ativos em nível baixo." : "SET e RESET são assíncronos e ativos em nível alto."}`,
      specs: [...(o.cmos ? CMOS_SPECS : TTL_LS_SPECS), ...o.spec, ["Clock máximo", o.fMax], ["Encapsulamento", `DIP-${o.pins.length}`]],
      tables: [{
        title: "Tabela de função (cada flip-flop)",
        head: o.activeLow ? ["PRE", "CLR", "CLK", "J", "K", "Q", "Q̅"] : ["SET", "RESET", "CLK", "J", "K", "Q", "Q̅"],
        rows: (() => {
          const a = o.activeLow ? ["0", "1"] : ["1", "0"],
            b = o.activeLow ? ["1", "0"] : ["0", "1"],
            both = o.activeLow ? ["0", "0"] : ["1", "1"],
            off = o.activeLow ? ["1", "1"] : ["0", "0"];
          const ck = o.fall ? "↓" : "↑";
          return [
            [...a, "X", "X", "X", "1", "0"], [...b, "X", "X", "X", "0", "1"], [...both, "X", "X", "X", "1*", "1*"],
            [...off, ck, "0", "0", "Q₀", "Q̅₀"], [...off, ck, "1", "0", "1", "0"], [...off, ck, "0", "1", "0", "1"], [...off, ck, "1", "1", "Q̅₀", "Q₀"],
            [...off, "H/L", "X", "X", "Q₀", "Q̅₀"],
          ];
        })(),
        note: `${o.fall ? "↓ = borda de descida" : "↑ = borda de subida"}. X = qualquer. * = as duas saídas vão a 1 (estado instável). Q₀ = valor anterior.`,
      }],
      notes: [
        "J = K = 1 faz o flip-flop inverter a cada borda: divisor de frequência por 2 e bloco de contadores.",
        o.fall ? "A bolinha na entrada de clock mostra disparo na borda de descida: a saída muda quando o clock cai de 1 para 0." : "Dispara na borda de subida do clock.",
        o.activeLow ? "Ligue PRE e CLR em +5 V quando não forem usados." : "Ligue SET e RESET em GND quando não forem usados.",
      ],
      model: [...SIM_NOTES, "Setup e hold não são checados: J e K valem no instante da borda do clock.", o.activeLow ? "PRE ou CLR sem fio valem 1 (inativos)." : "SET ou RESET sem fio valem 0 (inativos)."],
      diagramTitle: "Circuito interno (mestre-escravo com portas NAND)",
      diagram: jkScene(o.pins, { j: "1J", k: "1K", clk: "1CLK", q: "1Q", qb: "!1Q", pre: pre(1), clr: clr(1) }),
      apps: o.apps,
    },
    pins: o.pins,
    update: (c) => {
      for (const i of [1, 2]) {
        const p = o.activeLow ? 1 - c.n[id(pre(i))] : c.n[id(pre(i))];
        const r = o.activeLow ? 1 - c.n[id(clr(i))] : c.n[id(clr(i))];
        const Q = `${i}Q`,
          QB = `n${i}Q`;
        if (p || r) {
          c.set(Q, p ? 1 : 0);
          c.set(QB, r ? 1 : 0);
          if (p && r) {
            c.set(Q, 1);
            c.set(QB, 1);
          }
        } else if (o.fall ? c.fall(`${i}CLK`) : c.rise(`${i}CLK`)) {
          const j = c.n[`${i}J`],
            k = c.n[`${i}K`];
          const q = c.get(Q);
          const nq = j && k ? 1 - q : j ? 1 : k ? 0 : q;
          c.set(Q, nq);
          c.set(QB, 1 - nq);
        } else if (c.init) {
          c.set(Q, 0);
          c.set(QB, 1);
        }
      }
    },
  });
}

dualJK({
  part: "74112", title: "2 flip-flops JK, borda de descida, com preset e clear", alt: "74LS112, 74LS112A, 74HC112, DM74LS112A, SN74LS112A", cmos: false, fall: true, activeLow: true,
  pins: [
    P(1, "1CLK", "in", "Clock do FF1 (borda de descida)"), P(2, "1K", "in", "Entrada K do FF1"), P(3, "1J", "in", "Entrada J do FF1"), P(4, "!1PRE", "in", "Preset assíncrono do FF1 (ativo em 0)"),
    P(5, "1Q", "out", "Saída Q do FF1"), P(6, "!1Q", "out", "Saída Q̅ do FF1"), P(7, "!2Q", "out", "Saída Q̅ do FF2"), GND(8),
    P(9, "2Q", "out", "Saída Q do FF2"), P(10, "!2PRE", "in", "Preset assíncrono do FF2 (ativo em 0)"), P(11, "2J", "in", "Entrada J do FF2"), P(12, "2K", "in", "Entrada K do FF2"),
    P(13, "2CLK", "in", "Clock do FF2 (borda de descida)"), P(14, "!2CLR", "in", "Clear assíncrono do FF2 (ativo em 0)"), P(15, "!1CLR", "in", "Clear assíncrono do FF1 (ativo em 0)"), VCC(16),
  ],
  fMax: "30 MHz (74LS112A, VCC = 5 V)",
  spec: [["Setup (tSU)", "20 ns antes da borda de descida"], ["Hold (tH)", "0 ns"], ["Largura mínima", "clock em alto 20 ns; PRE ou CLR em baixo 25 ns"]],
  apps: ["Contadores assíncronos e síncronos com J = K = 1 (toggle).", "Divisores de frequência em cascata.", "Experimento do flip-flop JK na aula: tabela de estados e diagrama de tempo."],
});

dualJK({
  part: "4027", title: "2 flip-flops JK com set e reset (CMOS)", alt: "CD4027B, MC14027B, HEF4027B", cmos: true, fall: false, activeLow: false,
  pins: [
    P(1, "1Q", "out", "Saída Q do FF1"), P(2, "!1Q", "out", "Saída Q̅ do FF1"), P(3, "1CLK", "in", "Clock do FF1 (borda de subida)"), P(4, "1RESET", "in", "Reset do FF1 (ativo em 1)"),
    P(5, "1K", "in", "Entrada K do FF1"), P(6, "1J", "in", "Entrada J do FF1"), P(7, "1SET", "in", "Set do FF1 (ativo em 1)"), GND(8, true),
    P(9, "2SET", "in", "Set do FF2 (ativo em 1)"), P(10, "2J", "in", "Entrada J do FF2"), P(11, "2K", "in", "Entrada K do FF2"), P(12, "2RESET", "in", "Reset do FF2 (ativo em 1)"),
    P(13, "2CLK", "in", "Clock do FF2 (borda de subida)"), P(14, "!2Q", "out", "Saída Q̅ do FF2"), P(15, "2Q", "out", "Saída Q do FF2"), VCC(16, true),
  ],
  fMax: "da ordem de 10 MHz a 10 V",
  spec: [],
  apps: ["Contadores e divisores CMOS de baixo consumo.", "Registrador de estado em controladores alimentados por bateria."],
});

// ------------------------------------------------------------------------------------------------ 74175 e 74273 (registradores D)

function quadD(o: { part: string; n: number; title: string; alt: string; pins: Pin[]; qb: boolean; fMax: string; apps: string[] }): void {
  const ids = Array.from({ length: o.n }, (_, i) => i + 1);
  defineIC({
    part: o.part,
    label: `${o.part} · ${o.title}`,
    category: "icff",
    keywords: "flip flop d registrador de paralelo memoria palavra barramento clear comum",
    ds: {
      alt: o.alt, title: o.title, family: "TTL",
      description: `${o.title}. Todos os flip-flops compartilham o clock (borda de subida) e o clear assíncrono ativo em nível baixo.`,
      specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", o.fMax], ["Encapsulamento", `DIP-${o.pins.length}`]],
      tables: [{ title: "Tabela de função", head: ["CLR", "CLK", "D", "Q", ...(o.qb ? ["Q̅"] : [])], rows: [["0", "X", "X", "0", ...(o.qb ? ["1"] : [])], ["1", "↑", "1", "1", ...(o.qb ? ["0"] : [])], ["1", "↑", "0", "0", ...(o.qb ? ["1"] : [])], ["1", "0/1", "X", "Q₀", ...(o.qb ? ["Q̅₀"] : [])]], note: "Cada bit tem o seu D e a sua saída Q." }],
      notes: ["Armazena uma palavra de dados: os bits entram juntos e saem juntos na borda do clock.", "Ligue CLR em +5 V quando não for usado."],
      model: [...SIM_NOTES, "CLR sem fio vale 1 (inativo)."],
      diagramTitle: "Circuito interno (diagrama funcional)",
      diagram: dffScene(o.pins, { d: "1D", clk: "CLK", q: "1Q", qb: o.qb ? "!1Q" : "1Q", clr: "!CLR" }),
      apps: o.apps,
    },
    pins: o.pins,
    update: (c) => {
      if (!c.n.nCLR) {
        for (const i of ids) {
          c.set(`${i}Q`, 0);
          if (o.qb) c.set(`n${i}Q`, 1);
        }
      } else if (c.rise("CLK")) {
        for (const i of ids) {
          c.set(`${i}Q`, c.n[`${i}D`]);
          if (o.qb) c.set(`n${i}Q`, 1 - c.n[`${i}D`]);
        }
      } else if (c.init) {
        for (const i of ids) if (o.qb) c.set(`n${i}Q`, 1);
      }
    },
  });
}

quadD({
  part: "74175", n: 4, title: "4 flip-flops D com clear comum e saídas Q e Q̅", alt: "74LS175, 74HC175", qb: true, fMax: "30 MHz (74LS175)",
  pins: [
    P(1, "!CLR", "in", "Clear assíncrono comum (ativo em 0)"), P(2, "1Q", "out", "Saída Q do FF1"), P(3, "!1Q", "out", "Saída Q̅ do FF1"), P(4, "1D", "in", "Dado do FF1"),
    P(5, "2D", "in", "Dado do FF2"), P(6, "!2Q", "out", "Saída Q̅ do FF2"), P(7, "2Q", "out", "Saída Q do FF2"), GND(8),
    P(9, "CLK", "in", "Clock comum (borda de subida)"), P(10, "3Q", "out", "Saída Q do FF3"), P(11, "!3Q", "out", "Saída Q̅ do FF3"), P(12, "3D", "in", "Dado do FF3"),
    P(13, "4D", "in", "Dado do FF4"), P(14, "!4Q", "out", "Saída Q̅ do FF4"), P(15, "4Q", "out", "Saída Q do FF4"), VCC(16),
  ],
  apps: ["Registrador de 4 bits em paralelo.", "Armazenar o resultado de um contador ou somador."],
});

quadD({
  part: "74273", n: 8, title: "8 flip-flops D com clear comum", alt: "74LS273, 74HC273", qb: false, fMax: "30 MHz (74LS273)",
  pins: [
    P(1, "!CLR", "in", "Clear assíncrono comum (ativo em 0)"), P(2, "1Q", "out", "Saída do FF1"), P(3, "1D", "in", "Dado do FF1"), P(4, "2D", "in", "Dado do FF2"),
    P(5, "2Q", "out", "Saída do FF2"), P(6, "3D", "in", "Dado do FF3"), P(7, "3Q", "out", "Saída do FF3"), P(8, "4D", "in", "Dado do FF4"), P(9, "4Q", "out", "Saída do FF4"), GND(10),
    P(11, "CLK", "in", "Clock comum (borda de subida)"), P(12, "5Q", "out", "Saída do FF5"), P(13, "5D", "in", "Dado do FF5"), P(14, "6Q", "out", "Saída do FF6"), P(15, "6D", "in", "Dado do FF6"),
    P(16, "7Q", "out", "Saída do FF7"), P(17, "7D", "in", "Dado do FF7"), P(18, "8D", "in", "Dado do FF8"), P(19, "8Q", "out", "Saída do FF8"), VCC(20),
  ],
  apps: ["Registrador de 8 bits (um byte).", "Porta de saída de um sistema com microcontrolador."],
});
