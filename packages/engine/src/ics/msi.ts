// CIs MSI combinacionais: decodificadores de display (7447, 4511), decodificadores/multiplexadores (74138, 74139, 74153, 74151, 74157),
// somador (7483), comparador (7485) e codificador de prioridade (74148).

import { CMOS_SPECS, type Pin, SIM_NOTES, TTL_LS_SPECS } from "./datasheet";
import { defineIC, type Ctx } from "./define";
import { blocksScene, box, decoderScene, dot, pinLabel, txt, wire } from "./scene";
import type { Item } from "./datasheet";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const GND = (n: number, cmos = false) => P(n, cmos ? "VSS" : "GND", "pwr", "Terra (0 V)");
const VCC = (n: number, cmos = false) => P(n, cmos ? "VDD" : "VCC", "pwr", cmos ? "Alimentação positiva" : "Alimentação +5 V");

/** Diagrama de blocos genérico: entradas à esquerda, uma caixa com o título, saídas à direita. */
function ioBox(title: string, sub: string, ins: Pin[], outs: Pin[]): ReturnType<typeof blocksScene> {
  const rows = Math.max(ins.length, outs.length);
  const h = 40 + rows * 22;
  const items: Item[] = [box(150, 20, 190, h - 20, title, sub)];
  ins.forEach((p, i) => {
    const y = 40 + i * 22;
    items.push(wire([60, y], [150, y]), pinLabel(60, y, "l", p.n, p.name));
  });
  outs.forEach((p, i) => {
    const y = 40 + i * 22;
    items.push(wire([340, y], [430, y]), pinLabel(430, y, "r", p.n, p.name));
  });
  return blocksScene(490, h + 20, items);
}

// ------------------------------------------------------------------------------------------------ decodificadores de display

const SEG = "abcdefg";
// segmentos acesos (a..g) para 0..9; 10..15 com o padrão do 7447 (símbolos); 4511 apaga acima de 9.
const DIG = [0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111]; // bit0 = a ... bit6 = g
const T7447 = [0b1011000, 0b1001100, 0b0011100, 0b1001010, 0b1111000, 0b0000000]; // 10..15 (formas especiais, aproximadas)

const segTable = (title: string, active: "alto" | "baixo", tail: string) => ({
  title,
  head: ["D C B A", "a", "b", "c", "d", "e", "f", "g", "Dígito"],
  rows: Array.from({ length: 10 }, (_, n) => [
    [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1].join(" "),
    ...[...SEG].map((_, s) => String(active === "alto" ? (DIG[n] >> s) & 1 : 1 - ((DIG[n] >> s) & 1))),
    String(n),
  ]).concat([["1 0 1 0 a 1 1 1 1", ...Array(7).fill(""), tail]].map((r) => r.slice(0, 9)).map((r) => ["1010 a 1111", ...r.slice(1)])),
});

defineIC({
  part: "7447", label: "7447 · Decodificador BCD → 7 segmentos (anodo comum, saídas ativas em 0)", category: "icmsi",
  keywords: "decodificador bcd display 7 segmentos anodo comum 7447 ls47",
  pins: [
    P(1, "B", "in", "Entrada BCD B (peso 2)"), P(2, "C", "in", "Entrada BCD C (peso 4)"), P(3, "!LT", "in", "Lamp test: todos os segmentos acesos (ativo em 0)"), P(4, "!BI", "in", "Blanking input: apaga todos (ativo em 0)"), P(5, "!RBI", "in", "Ripple blanking input: apaga o zero (ativo em 0)"),
    P(6, "D", "in", "Entrada BCD D (peso 8)"), P(7, "A", "in", "Entrada BCD A (peso 1)"), GND(8), P(9, "!e", "out", "Segmento e (ativo em 0)"), P(10, "!d", "out", "Segmento d (ativo em 0)"), P(11, "!c", "out", "Segmento c (ativo em 0)"), P(12, "!b", "out", "Segmento b (ativo em 0)"),
    P(13, "!a", "out", "Segmento a (ativo em 0)"), P(14, "!g", "out", "Segmento g (ativo em 0)"), P(15, "!f", "out", "Segmento f (ativo em 0)"), VCC(16),
  ],
  ds: {
    alt: "74LS47, SN7447", title: "Decodificador/acionador BCD para display de 7 segmentos (ânodo comum)", family: "TTL", pkg: "DIP-16",
    description: "Converte o código BCD (D C B A) nos sete segmentos (a a g). As saídas são ativas em nível baixo e drenam corrente (coletor aberto), por isso acionam diretamente um display de ânodo comum, com resistor em série em cada segmento.",
    specs: [...TTL_LS_SPECS, ["Corrente de saída (IOL)", "até 24 mA (74LS47)"], ["Encapsulamento", "DIP-16"]],
    tables: [{ ...segTable("Tabela de função (saídas = nível nos pinos, 0 = aceso)", "baixo", "formas especiais"), rows: segTable("", "baixo", "").rows.slice(0, 10) }, { title: "Entradas de controle", head: ["!LT", "!BI", "!RBI", "Resultado"], rows: [["0", "X", "X", "Todos acesos (teste)"], ["1", "0", "X", "Todos apagados"], ["1", "1", "0 e BCD = 0", "Apaga o zero à esquerda"], ["1", "1", "1", "Decodificação normal"]] }],
    notes: ["Ânodo comum: ligue o ânodo do display em VCC e cada cátodo ao segmento correspondente com resistor de 330 Ω.", "Entradas BCD acima de 9 mostram símbolos especiais no 7447.", "Para display de cátodo comum use o 7448 ou o 4511."],
    model: [...SIM_NOTES, "!LT, !BI e !RBI sem fio valem 1 (inativos)."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("Decodificador", "BCD → 7 segmentos", [P(7, "A", "in", ""), P(1, "B", "in", ""), P(2, "C", "in", ""), P(6, "D", "in", ""), P(3, "!LT", "in", ""), P(4, "!BI", "in", ""), P(5, "!RBI", "in", "")], [P(13, "!a", "out", ""), P(12, "!b", "out", ""), P(11, "!c", "out", ""), P(10, "!d", "out", ""), P(9, "!e", "out", ""), P(15, "!f", "out", ""), P(14, "!g", "out", "")]),
    apps: ["Contador de décadas com display (7490 + 7447).", "Cronômetros e relógios digitais.", "Mostrador do estado de uma máquina de estados."],
  },
  update: (c) => {
    const n = c.n.A + 2 * c.n.B + 4 * c.n.C + 8 * c.n.D;
    let seg = n < 10 ? DIG[n] : T7447[n - 10];
    if (c.n.nBI === 0 || (c.n.nRBI === 0 && n === 0 && c.n.nLT === 1)) seg = 0;
    if (c.n.nLT === 0 && c.n.nBI === 1) seg = 0b1111111;
    if (c.n.nLT === 0 && c.n.nBI === 0) seg = 0;
    [...SEG].forEach((s, i) => c.set(`n${s}`, (seg >> i) & 1 ? 0 : 1));
  },
});

defineIC({
  part: "4511", label: "4511 · Decodificador BCD → 7 segmentos com latch (cátodo comum, saídas ativas em 1)", category: "icmsi",
  keywords: "decodificador bcd display 7 segmentos catodo comum 4511 latch cmos",
  pins: [
    P(1, "B", "in", "Entrada BCD B (peso 2)"), P(2, "C", "in", "Entrada BCD C (peso 4)"), P(3, "!LT", "in", "Lamp test (ativo em 0)"), P(4, "!BI", "in", "Blanking (ativo em 0)"), P(5, "LE", "in", "Latch enable: em 1 trava o código atual"),
    P(6, "D", "in", "Entrada BCD D (peso 8)"), P(7, "A", "in", "Entrada BCD A (peso 1)"), GND(8, true), P(9, "e", "out", "Segmento e"), P(10, "d", "out", "Segmento d"), P(11, "c", "out", "Segmento c"), P(12, "b", "out", "Segmento b"),
    P(13, "a", "out", "Segmento a"), P(14, "g", "out", "Segmento g"), P(15, "f", "out", "Segmento f"), VCC(16, true),
  ],
  nInt: 1,
  ds: {
    alt: "CD4511B, MC14511B, HEF4511B", title: "Decodificador BCD → 7 segmentos com latch (CMOS)", family: "CMOS", pkg: "DIP-16",
    description: "Converte BCD em sete segmentos de saída ativos em nível alto, para display de cátodo comum. Tem latch (LE), lamp test (!LT) e blanking (!BI). Entradas acima de 9 apagam o display.",
    specs: [...CMOS_SPECS, ["Corrente de saída", "até 25 mA por segmento (VDD = 5 V, típico)"], ["Encapsulamento", "DIP-16"]],
    tables: [{ ...segTable("Tabela de função", "alto", ""), rows: segTable("", "alto", "").rows.slice(0, 10).concat([["1 0 1 0 a 1 1 1 1".replace("1 0 1 0 a 1 1 1 1", "1010 a 1111"), "0", "0", "0", "0", "0", "0", "0", "apagado"]]) }, { title: "Controle", head: ["!LT", "!BI", "LE", "Resultado"], rows: [["0", "X", "X", "Todos acesos"], ["1", "0", "X", "Todos apagados"], ["1", "1", "0", "Decodifica as entradas"], ["1", "1", "1", "Mantém o último código"]] }],
    notes: ["Cátodo comum: ligue o cátodo do display à terra e cada segmento a um resistor de 330 Ω.", "Com LE em 0 o display acompanha a entrada.", "Em CMOS não deixe entradas soltas."],
    model: [...SIM_NOTES, "!LT e !BI sem fio valem 1. LE sem fio vale 0."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("Decodificador", "BCD → 7 segmentos com latch", [P(7, "A", "in", ""), P(1, "B", "in", ""), P(2, "C", "in", ""), P(6, "D", "in", ""), P(5, "LE", "in", ""), P(3, "!LT", "in", ""), P(4, "!BI", "in", "")], [P(13, "a", "out", ""), P(12, "b", "out", ""), P(11, "c", "out", ""), P(10, "d", "out", ""), P(9, "e", "out", ""), P(15, "f", "out", ""), P(14, "g", "out", "")]),
    apps: ["Contador CMOS 4518 + 4511 + display de cátodo comum (experimento de aula).", "Placar e cronômetro.", "Mostrador de contagem de produtos."],
  },
  update: (c) => {
    let n = c.s(0);
    if (!c.n.LE || c.init) n = c.n.A + 2 * c.n.B + 4 * c.n.C + 8 * c.n.D;
    c.ss(0, n);
    let seg = n < 10 ? DIG[n] : 0;
    if (c.n.nBI === 0) seg = 0;
    if (c.n.nLT === 0) seg = 0b1111111;
    [...SEG].forEach((s, i) => c.set(s, (seg >> i) & 1));
  },
});

// ------------------------------------------------------------------------------------------------ decodificadores 74138 e 74139

const y8 = ["!Y0", "!Y1", "!Y2", "!Y3", "!Y4", "!Y5", "!Y6", "!Y7"];
defineIC({
  part: "74138", label: "74138 · Decodificador 3 → 8 (saídas ativas em 0)", category: "icmsi",
  keywords: "decodificador 3 para 8 demultiplexador 1 de 8 endereco selecionador 138",
  pins: [
    P(1, "A", "in", "Endereço A (peso 1)"), P(2, "B", "in", "Endereço B (peso 2)"), P(3, "C", "in", "Endereço C (peso 4)"), P(4, "!G2A", "in", "Enable 2A (ativo em 0)"), P(5, "!G2B", "in", "Enable 2B (ativo em 0)"), P(6, "G1", "in", "Enable 1 (ativo em 1)"),
    P(7, "!Y7", "out", "Saída 7 (ativa em 0)"), GND(8), P(9, "!Y6", "out", "Saída 6"), P(10, "!Y5", "out", "Saída 5"), P(11, "!Y4", "out", "Saída 4"), P(12, "!Y3", "out", "Saída 3"), P(13, "!Y2", "out", "Saída 2"), P(14, "!Y1", "out", "Saída 1"), P(15, "!Y0", "out", "Saída 0"), VCC(16),
  ],
  ds: {
    alt: "74LS138, 74HC138", title: "Decodificador/demultiplexador de 3 linhas para 8", family: "TTL", pkg: "DIP-16",
    description: "Ativa (nível 0) apenas a saída cujo número é o código binário C B A, desde que G1 = 1 e G2A = G2B = 0. Caso contrário todas as saídas ficam em 1.",
    specs: [...TTL_LS_SPECS, ["Atraso típico", "21 ns (74LS138)"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["G1", "G2A", "G2B", "C B A", "Saída em 0"], rows: [["0", "X", "X", "X X X", "nenhuma"], ["X", "1", "X", "X X X", "nenhuma"], ["X", "X", "1", "X X X", "nenhuma"], ["1", "0", "0", "0 0 0", "Y0"], ["1", "0", "0", "0 0 1", "Y1"], ["1", "0", "0", "0 1 0", "Y2"], ["1", "0", "0", "0 1 1", "Y3"], ["1", "0", "0", "1 0 0", "Y4"], ["1", "0", "0", "1 0 1", "Y5"], ["1", "0", "0", "1 1 0", "Y6"], ["1", "0", "0", "1 1 1", "Y7"]] }],
    notes: ["Funciona como gerador de mintermos: cada saída é o complemento de um mintermo (use com NAND para somar mintermos).", "Combine dois 74138 para obter um decodificador 4 → 16.", "Como demultiplexador: use um enable como entrada de dados."],
    model: [...SIM_NOTES, "G2A e G2B sem fio valem 1 (inativos); ligue-os em 0 e G1 em 1 para habilitar."],
    diagramTitle: "Circuito interno (inversores e portas NAND de 3 a 6 entradas)",
    diagram: decoderScene({ inNames: ["A", "B", "C"], inPins: [], outs: y8.map((n, i) => ({ name: n, code: i })), enables: ["EN"], enPins: [], outPins: [], gate: "nand" }),
    apps: ["Seleção de endereços e chip select.", "Gerador de mintermos para funções lógicas.", "Acionamento de uma de oito cargas (por exemplo fases de um semáforo)."],
  },
  update: (c) => {
    const en = c.n.G1 && c.n.nG2A === 0 && c.n.nG2B === 0;
    const n = c.n.A + 2 * c.n.B + 4 * c.n.C;
    for (let i = 0; i < 8; i++) c.set(`nY${i}`, en && i === n ? 0 : 1);
  },
});

defineIC({
  part: "74139", label: "74139 · Dois decodificadores 2 → 4 (saídas ativas em 0)", category: "icmsi",
  keywords: "decodificador 2 para 4 duplo demultiplexador 139",
  pins: [
    P(1, "!1G", "in", "Enable do decodificador 1 (ativo em 0)"), P(2, "1A", "in", "Endereço A do decodificador 1"), P(3, "1B", "in", "Endereço B do decodificador 1"), P(4, "!1Y0", "out", "Saída 0 (dec. 1)"), P(5, "!1Y1", "out", "Saída 1 (dec. 1)"), P(6, "!1Y2", "out", "Saída 2 (dec. 1)"), P(7, "!1Y3", "out", "Saída 3 (dec. 1)"), GND(8),
    P(9, "!2Y3", "out", "Saída 3 (dec. 2)"), P(10, "!2Y2", "out", "Saída 2 (dec. 2)"), P(11, "!2Y1", "out", "Saída 1 (dec. 2)"), P(12, "!2Y0", "out", "Saída 0 (dec. 2)"), P(13, "2B", "in", "Endereço B do decodificador 2"), P(14, "2A", "in", "Endereço A do decodificador 2"), P(15, "!2G", "in", "Enable do decodificador 2 (ativo em 0)"), VCC(16),
  ],
  ds: {
    alt: "74LS139, 74HC139", title: "Dois decodificadores/demultiplexadores de 2 linhas para 4", family: "TTL", pkg: "DIP-16",
    description: "Cada metade ativa (nível 0) uma entre quatro saídas conforme o código B A, quando o enable !G está em 0.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função (cada decodificador)", head: ["!G", "B A", "Saída em 0"], rows: [["1", "X X", "nenhuma"], ["0", "0 0", "Y0"], ["0", "0 1", "Y1"], ["0", "1 0", "Y2"], ["0", "1 1", "Y3"]] }],
    notes: ["Os dois decodificadores são independentes.", "Serve como gerador dos 4 mintermos de duas variáveis."],
    model: [...SIM_NOTES, "!1G e !2G sem fio valem 1 (desabilitados)."],
    diagramTitle: "Circuito interno (um dos decodificadores)",
    diagram: decoderScene({ inNames: ["A", "B"], inPins: [], outs: ["!Y0", "!Y1", "!Y2", "!Y3"].map((n, i) => ({ name: n, code: i })), enables: ["G"], enPins: [], outPins: [], gate: "nand" }),
    apps: ["Seleção de dispositivos em barramento.", "Decodificação de dois bits de estado (por exemplo um contador de 2 bits)."],
  },
  update: (c) => {
    for (const k of [1, 2]) {
      const en = c.n[`n${k}G`] === 0;
      const n = c.n[`${k}A`] + 2 * c.n[`${k}B`];
      for (let i = 0; i < 4; i++) c.set(`n${k}Y${i}`, en && i === n ? 0 : 1);
    }
  },
});

// ------------------------------------------------------------------------------------------------ multiplexadores

defineIC({
  part: "74153", label: "74153 · Dois multiplexadores 4 → 1", category: "icmsi",
  keywords: "multiplexador mux 4 para 1 duplo seletor dados 153",
  pins: [
    P(1, "!1G", "in", "Enable do mux 1 (ativo em 0)"), P(2, "B", "in", "Seleção B (peso 2), comum"), P(3, "1C3", "in", "Dado 3 do mux 1"), P(4, "1C2", "in", "Dado 2 do mux 1"), P(5, "1C1", "in", "Dado 1 do mux 1"), P(6, "1C0", "in", "Dado 0 do mux 1"), P(7, "1Y", "out", "Saída do mux 1"), GND(8),
    P(9, "2Y", "out", "Saída do mux 2"), P(10, "2C0", "in", "Dado 0 do mux 2"), P(11, "2C1", "in", "Dado 1 do mux 2"), P(12, "2C2", "in", "Dado 2 do mux 2"), P(13, "2C3", "in", "Dado 3 do mux 2"), P(14, "A", "in", "Seleção A (peso 1), comum"), P(15, "!2G", "in", "Enable do mux 2 (ativo em 0)"), VCC(16),
  ],
  ds: {
    alt: "74LS153, 74HC153", title: "Dois multiplexadores de 4 entradas para 1 saída", family: "TTL", pkg: "DIP-16",
    description: "Cada multiplexador escolhe uma entre quatro entradas de dados (C0 a C3) pelo código B A (comum aos dois). Enable !G em 1 força a saída em 0.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["B A", "!G", "Y"], rows: [["X X", "1", "0"], ["0 0", "0", "C0"], ["0 1", "0", "C1"], ["1 0", "0", "C2"], ["1 1", "0", "C3"]] }],
    notes: ["Implementa qualquer função de 3 variáveis: use B e A como variáveis e C0 a C3 como 0, 1, a terceira variável ou seu complemento.", "Seleção comum aos dois multiplexadores."],
    model: [...SIM_NOTES, "!1G e !2G sem fio valem 1 (saída em 0): ligue em 0 para habilitar."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("MUX 4 → 1 (×2)", "Seleção B A", [P(6, "C0", "in", ""), P(5, "C1", "in", ""), P(4, "C2", "in", ""), P(3, "C3", "in", ""), P(14, "A", "in", ""), P(2, "B", "in", ""), P(1, "!G", "in", "")], [P(7, "Y", "out", "")]),
    apps: ["Seleção de uma entre várias chaves (leitura de sensores).", "Gerador de funções lógicas.", "Roteamento de dados."],
  },
  update: (c) => {
    const s = c.n.A + 2 * c.n.B;
    for (const k of [1, 2]) c.set(`${k}Y`, c.n[`n${k}G`] === 0 ? c.n[`${k}C${s}`] : 0);
  },
});

defineIC({
  part: "74151", label: "74151 · Multiplexador 8 → 1", category: "icmsi",
  keywords: "multiplexador mux 8 para 1 seletor dados 151",
  pins: [
    P(1, "D3", "in", "Dado 3"), P(2, "D2", "in", "Dado 2"), P(3, "D1", "in", "Dado 1"), P(4, "D0", "in", "Dado 0"), P(5, "Y", "out", "Saída"), P(6, "!W", "out", "Saída complementar"), P(7, "!G", "in", "Enable (ativo em 0)"), GND(8),
    P(9, "C", "in", "Seleção C (peso 4)"), P(10, "B", "in", "Seleção B (peso 2)"), P(11, "A", "in", "Seleção A (peso 1)"), P(12, "D7", "in", "Dado 7"), P(13, "D6", "in", "Dado 6"), P(14, "D5", "in", "Dado 5"), P(15, "D4", "in", "Dado 4"), VCC(16),
  ],
  ds: {
    alt: "74LS151, 74HC151", title: "Multiplexador de 8 entradas para 1 saída", family: "TTL", pkg: "DIP-16",
    description: "Escolhe uma das oito entradas D0 a D7 pelo código C B A e a leva a Y (e seu complemento a !W). Com !G em 1, Y = 0 e !W = 1.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["C B A", "!G", "Y"], rows: [["X X X", "1", "0"], ["0 0 0", "0", "D0"], ["0 0 1", "0", "D1"], ["0 1 0", "0", "D2"], ["0 1 1", "0", "D3"], ["1 0 0", "0", "D4"], ["1 0 1", "0", "D5"], ["1 1 0", "0", "D6"], ["1 1 1", "0", "D7"]] }],
    notes: ["Implementa qualquer função de 3 variáveis: ligue C B A nas variáveis e D0 a D7 em 0 ou 1 conforme a tabela-verdade.", "Com um contador de 3 bits em C B A, funciona como serializador."],
    model: [...SIM_NOTES, "!G sem fio vale 1 (desabilitado): ligue em 0."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("MUX 8 → 1", "Seleção C B A", [P(4, "D0", "in", ""), P(3, "D1", "in", ""), P(2, "D2", "in", ""), P(1, "D3", "in", ""), P(15, "D4", "in", ""), P(14, "D5", "in", ""), P(13, "D6", "in", ""), P(12, "D7", "in", "")], [P(5, "Y", "out", ""), P(6, "!W", "out", "")]),
    apps: ["Gerador de funções lógicas de 3 variáveis.", "Seleção de sensores.", "Serialização de dados."],
  },
  update: (c) => {
    const s = c.n.A + 2 * c.n.B + 4 * c.n.C;
    const y = c.n.nG === 0 ? c.n[`D${s}`] : 0;
    c.set("Y", y);
    c.set("nW", 1 - y);
  },
});

defineIC({
  part: "74157", label: "74157 · Quatro multiplexadores 2 → 1", category: "icmsi",
  keywords: "multiplexador mux 2 para 1 quadruplo seletor 157",
  pins: [
    P(1, "S", "in", "Seleção: 0 escolhe A, 1 escolhe B"), P(2, "1A", "in", "Entrada A do mux 1"), P(3, "1B", "in", "Entrada B do mux 1"), P(4, "1Y", "out", "Saída do mux 1"), P(5, "2A", "in", "Entrada A do mux 2"), P(6, "2B", "in", "Entrada B do mux 2"), P(7, "2Y", "out", "Saída do mux 2"), GND(8),
    P(9, "3Y", "out", "Saída do mux 3"), P(10, "3B", "in", "Entrada B do mux 3"), P(11, "3A", "in", "Entrada A do mux 3"), P(12, "4Y", "out", "Saída do mux 4"), P(13, "4B", "in", "Entrada B do mux 4"), P(14, "4A", "in", "Entrada A do mux 4"), P(15, "!G", "in", "Enable (ativo em 0)"), VCC(16),
  ],
  ds: {
    alt: "74LS157, 74HC157", title: "Quatro multiplexadores de 2 entradas para 1 saída", family: "TTL", pkg: "DIP-16",
    description: "Cada uma das quatro saídas escolhe a entrada A (S = 0) ou B (S = 1). Com !G em 1 todas as saídas ficam em 0.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["!G", "S", "Y"], rows: [["1", "X", "0"], ["0", "0", "A"], ["0", "1", "B"]] }],
    notes: ["Escolhe entre duas palavras de 4 bits (por exemplo modo automático e modo manual)."],
    model: [...SIM_NOTES, "!G sem fio vale 1 (saídas em 0): ligue em 0."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("MUX 2 → 1 (×4)", "Seleção S", [P(2, "A", "in", ""), P(3, "B", "in", ""), P(1, "S", "in", ""), P(15, "!G", "in", "")], [P(4, "Y", "out", "")]),
    apps: ["Chave automático/manual de um controle.", "Seleção entre duas fontes de dados de 4 bits."],
  },
  update: (c) => {
    for (const k of [1, 2, 3, 4]) c.set(`${k}Y`, c.n.nG === 0 ? (c.n.S ? c.n[`${k}B`] : c.n[`${k}A`]) : 0);
  },
});

// ------------------------------------------------------------------------------------------------ aritmética: 7483 e 7485

defineIC({
  part: "7483", label: "7483 · Somador completo de 4 bits", category: "icmsi",
  keywords: "somador adder 4 bits soma aritmetica carry vai um 83 binario",
  pins: [
    P(1, "A4", "in", "Bit 4 de A (peso 8)"), P(2, "S3", "out", "Soma, bit 3"), P(3, "A3", "in", "Bit 3 de A (peso 4)"), P(4, "B3", "in", "Bit 3 de B"), VCC(5), P(6, "S2", "out", "Soma, bit 2"), P(7, "B2", "in", "Bit 2 de B"), P(8, "A2", "in", "Bit 2 de A (peso 2)"),
    P(9, "S1", "out", "Soma, bit 1"), P(10, "A1", "in", "Bit 1 de A (peso 1)"), P(11, "B1", "in", "Bit 1 de B"), GND(12), P(13, "C0", "in", "Carry de entrada"), P(14, "C4", "out", "Carry de saída"), P(15, "S4", "out", "Soma, bit 4 (peso 8)"), P(16, "B4", "in", "Bit 4 de B"),
  ],
  ds: {
    alt: "74LS83A, 74HC283", title: "Somador completo binário de 4 bits com carry rápido", family: "TTL", pkg: "DIP-16",
    description: "Soma A4A3A2A1 + B4B3B2B1 + C0. O resultado de 5 bits é C4 S4 S3 S2 S1.",
    specs: [...TTL_LS_SPECS, ["Tempo C0 → C4", "da ordem de 16 ns"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Exemplos", head: ["A", "B", "C0", "C4 S4S3S2S1"], rows: [["0101 (5)", "0011 (3)", "0", "0 1000 (8)"], ["1001 (9)", "0111 (7)", "0", "1 0000 (16)"], ["1111 (15)", "0000", "1", "1 0000 (16)"]] }],
    notes: ["Subtrator: inverta B com portas XOR e ligue C0 em 1 (complemento de 2).", "Para somar mais bits ligue C4 de um no C0 do seguinte."],
    model: [...SIM_NOTES, "Entradas sem fio valem 0."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("Σ somador 4 bits", "A + B + C0", [P(10, "A1", "in", ""), P(8, "A2", "in", ""), P(3, "A3", "in", ""), P(1, "A4", "in", ""), P(11, "B1", "in", ""), P(7, "B2", "in", ""), P(4, "B3", "in", ""), P(16, "B4", "in", ""), P(13, "C0", "in", "")], [P(9, "S1", "out", ""), P(6, "S2", "out", ""), P(2, "S3", "out", ""), P(15, "S4", "out", ""), P(14, "C4", "out", "")]),
    apps: ["Somas e subtrações em ULAs.", "Contadores e acumuladores.", "Conversores de código."],
  },
  update: (c) => {
    const a = c.n.A1 + 2 * c.n.A2 + 4 * c.n.A3 + 8 * c.n.A4;
    const b = c.n.B1 + 2 * c.n.B2 + 4 * c.n.B3 + 8 * c.n.B4;
    const s = a + b + c.n.C0;
    c.set("S1", s & 1);
    c.set("S2", (s >> 1) & 1);
    c.set("S3", (s >> 2) & 1);
    c.set("S4", (s >> 3) & 1);
    c.set("C4", (s >> 4) & 1);
  },
});

defineIC({
  part: "7485", label: "7485 · Comparador de magnitude de 4 bits", category: "icmsi",
  keywords: "comparador magnitude 4 bits maior menor igual 85",
  pins: [
    P(1, "B3", "in", "Bit 3 de B"), P(2, "LTi", "in", "Entrada de cascata A < B"), P(3, "EQi", "in", "Entrada de cascata A = B"), P(4, "GTi", "in", "Entrada de cascata A > B"), P(5, "GTo", "out", "Saída A > B"), P(6, "EQo", "out", "Saída A = B"), P(7, "LTo", "out", "Saída A < B"), GND(8),
    P(9, "B0", "in", "Bit 0 de B"), P(10, "A0", "in", "Bit 0 de A"), P(11, "B1", "in", "Bit 1 de B"), P(12, "A1", "in", "Bit 1 de A"), P(13, "A2", "in", "Bit 2 de A"), P(14, "B2", "in", "Bit 2 de B"), P(15, "A3", "in", "Bit 3 de A"), VCC(16),
  ],
  ds: {
    alt: "74LS85, 74HC85", title: "Comparador de magnitude de 4 bits", family: "TTL", pkg: "DIP-16",
    description: "Compara A3A2A1A0 com B3B2B1B0 e ativa uma das saídas: A > B, A = B ou A < B. As entradas de cascata decidem o resultado quando A = B.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função (resumo)", head: ["A, B", "Entradas de cascata", "GTo", "EQo", "LTo"], rows: [["A > B", "X", "1", "0", "0"], ["A < B", "X", "0", "0", "1"], ["A = B", "EQi = 1", "0", "1", "0"], ["A = B", "GTi = 1", "1", "0", "0"], ["A = B", "LTi = 1", "0", "0", "1"]] }],
    notes: ["Para um único comparador de 4 bits, ligue EQi em 1 e GTi, LTi em 0.", "Cascata: ligue as saídas do comparador menos significativo nas entradas de cascata do mais significativo."],
    model: [...SIM_NOTES, "As entradas de cascata sem fio valem 0: ligue EQi em 1 para ter a saída A = B."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("Comparador 4 bits", "A ? B", [P(10, "A0", "in", ""), P(12, "A1", "in", ""), P(13, "A2", "in", ""), P(15, "A3", "in", ""), P(9, "B0", "in", ""), P(11, "B1", "in", ""), P(14, "B2", "in", ""), P(1, "B3", "in", ""), P(4, "GTi", "in", ""), P(3, "EQi", "in", ""), P(2, "LTi", "in", "")], [P(5, "GTo", "out", ""), P(6, "EQo", "out", ""), P(7, "LTo", "out", "")]),
    apps: ["Controle liga/desliga digital: compara a temperatura medida com o ponto de ajuste (refrigerador).", "Comparação de contagens (parar quando o contador atinge um valor)."],
  },
  update: (c) => {
    const a = c.n.A0 + 2 * c.n.A1 + 4 * c.n.A2 + 8 * c.n.A3;
    const b = c.n.B0 + 2 * c.n.B1 + 4 * c.n.B2 + 8 * c.n.B3;
    let gt = a > b ? 1 : 0,
      lt = a < b ? 1 : 0,
      eq = a === b ? 1 : 0;
    if (eq) {
      if (c.n.GTi && !c.n.LTi) (gt = 1), (eq = 0);
      else if (c.n.LTi && !c.n.GTi) (lt = 1), (eq = 0);
      else if (c.n.EQi) eq = 1;
      else if (c.n.GTi && c.n.LTi) (gt = 0), (lt = 0), (eq = 0);
      else eq = 0;
    }
    c.set("GTo", gt);
    c.set("EQo", eq);
    c.set("LTo", lt);
  },
});

// ------------------------------------------------------------------------------------------------ codificador de prioridade 74148

defineIC({
  part: "74148", label: "74148 · Codificador de prioridade 8 → 3", category: "icmsi",
  keywords: "codificador prioridade 8 para 3 encoder 148 teclado interrupcao",
  pins: [
    P(1, "!I4", "in", "Entrada 4 (ativa em 0)"), P(2, "!I5", "in", "Entrada 5 (ativa em 0)"), P(3, "!I6", "in", "Entrada 6 (ativa em 0)"), P(4, "!I7", "in", "Entrada 7, maior prioridade (ativa em 0)"), P(5, "!EI", "in", "Enable de entrada (ativo em 0)"),
    P(6, "!A2", "out", "Saída A2 (ativa em 0)"), P(7, "!A1", "out", "Saída A1 (ativa em 0)"), GND(8), P(9, "!A0", "out", "Saída A0 (ativa em 0)"), P(10, "!I0", "in", "Entrada 0 (ativa em 0)"), P(11, "!I1", "in", "Entrada 1 (ativa em 0)"), P(12, "!I2", "in", "Entrada 2 (ativa em 0)"), P(13, "!I3", "in", "Entrada 3 (ativa em 0)"),
    P(14, "!GS", "out", "Group select: 0 quando alguma entrada está ativa"), P(15, "!EO", "out", "Enable de saída: 0 quando nenhuma entrada está ativa"), VCC(16),
  ],
  ds: {
    alt: "74LS148, 74HC148", title: "Codificador de prioridade de 8 linhas para 3 (binário)", family: "TTL", pkg: "DIP-16",
    description: "Gera o código binário (ativo em 0) da entrada ativa de maior número. A entrada 7 tem a maior prioridade. !GS indica que há uma entrada ativa e !EO permite cascata.",
    specs: [...TTL_LS_SPECS, ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função (resumo)", head: ["Entrada ativa mais alta", "!A2 !A1 !A0", "!GS", "!EO"], rows: [["nenhuma", "1 1 1", "1", "0"], ["I0", "1 1 1", "0", "1"], ["I1", "1 1 0", "0", "1"], ["I2", "1 0 1", "0", "1"], ["I3", "1 0 0", "0", "1"], ["I4", "0 1 1", "0", "1"], ["I5", "0 1 0", "0", "1"], ["I6", "0 0 1", "0", "1"], ["I7", "0 0 0", "0", "1"]] }],
    notes: ["As saídas estão em lógica negativa: I7 ativa resulta em 000.", "!GS distingue 'entrada 0 ativa' de 'nenhuma ativa' (as duas dão 111)."],
    model: [...SIM_NOTES, "Todas as entradas e !EI sem fio valem 1 (inativas)."],
    diagramTitle: "Diagrama funcional", diagram: ioBox("Codificador de prioridade", "8 → 3", [P(10, "!I0", "in", ""), P(11, "!I1", "in", ""), P(12, "!I2", "in", ""), P(13, "!I3", "in", ""), P(1, "!I4", "in", ""), P(2, "!I5", "in", ""), P(3, "!I6", "in", ""), P(4, "!I7", "in", ""), P(5, "!EI", "in", "")], [P(6, "!A2", "out", ""), P(7, "!A1", "out", ""), P(9, "!A0", "out", ""), P(14, "!GS", "out", ""), P(15, "!EO", "out", "")]),
    apps: ["Teclados e botoeiras.", "Controle de interrupção por prioridade.", "Escolha da maior demanda em um sistema com vários pedidos."],
  },
  update: (c) => {
    let hi = -1;
    if (c.n.nEI === 0) for (let i = 0; i < 8; i++) if (c.n[`nI${i}`] === 0) hi = i;
    const code = hi < 0 ? 7 : 7 - hi;
    c.set("nA0", code & 1);
    c.set("nA1", (code >> 1) & 1);
    c.set("nA2", (code >> 2) & 1);
    c.set("nGS", hi >= 0 ? 0 : 1);
    c.set("nEO", c.n.nEI === 0 && hi < 0 ? 0 : 1);
  },
});

void txt;
void dot;
void (null as unknown as Ctx);
