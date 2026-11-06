// CIs de registradores de deslocamento: 74164 (SIPO), 74165/74166 (PISO), 74194 (universal), 74595 (SIPO com latch e tri-state).

import { type Pin, SIM_NOTES, TTL_LS_SPECS } from "./datasheet";
import { defineIC, type Ctx } from "./define";
import { chainScene } from "./scene";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const GND = (n: number) => P(n, "GND", "pwr", "Terra (0 V)");
const VCC = (n: number) => P(n, "VCC", "pwr", "Alimentação +5 V");
const L8 = ["A", "B", "C", "D", "E", "F", "G", "H"];
const bits = (c: Ctx, names: string[]) => names.map((n) => c.get(n));
const put = (c: Ctx, names: string[], v: number[]) => names.forEach((n, i) => c.set(n, v[i]));

defineIC({
  part: "74164", label: "74164 · Registrador de deslocamento 8 bits (série → paralelo)", category: "icreg",
  keywords: "registrador deslocamento shift register serie paralelo sipo 8 bits serial",
  pins: [
    P(1, "A", "in", "Entrada serial A (E1)"), P(2, "B", "in", "Entrada serial B (E2). A entrada efetiva é A · B"), P(3, "QA", "out", "Saída do 1º estágio"), P(4, "QB", "out", "Saída do 2º estágio"), P(5, "QC", "out", "Saída do 3º estágio"), P(6, "QD", "out", "Saída do 4º estágio"), GND(7),
    P(8, "CLK", "in", "Clock (borda de subida)"), P(9, "!CLR", "in", "Clear assíncrono (ativo em 0)"), P(10, "QE", "out", "Saída do 5º estágio"), P(11, "QF", "out", "Saída do 6º estágio"), P(12, "QG", "out", "Saída do 7º estágio"), P(13, "QH", "out", "Saída do 8º estágio"), VCC(14),
  ],
  ds: {
    alt: "74LS164, 74HC164", title: "Registrador de deslocamento de 8 bits, entrada serial e saída paralela", family: "TTL", pkg: "DIP-14",
    description: "A cada borda de subida do clock, o dado serial (A · B) entra em QA e cada bit avança uma posição (QA→QB→...→QH). Clear assíncrono em !CLR.",
    specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "36 MHz (74LS)"], ["Encapsulamento", "DIP-14"]],
    tables: [{ title: "Tabela de função", head: ["CLR", "CLK", "A", "B", "QA", "QB ... QH"], rows: [["0", "X", "X", "X", "0", "0"], ["1", "0", "X", "X", "mantém", "mantém"], ["1", "↑", "1", "1", "1", "QA→QB, ..., QG→QH"], ["1", "↑", "0", "X", "0", "QA→QB, ..., QG→QH"], ["1", "↑", "X", "0", "0", "QA→QB, ..., QG→QH"]] }],
    notes: ["Use A e B juntos (AND) como habilitação do dado: ligue um deles em 1 e use o outro como entrada.", "Após 8 clocks, o primeiro bit enviado chega a QH.", "Conversor serial → paralelo: comunicação, teclados, expansão de saídas."],
    model: [...SIM_NOTES, "!CLR sem fio vale 1 (inativo)."],
    diagramTitle: "Circuito interno (8 flip-flops D em cadeia)",
    diagram: chainScene({ n: 8, ff: "D", names: L8.map((l) => "Q" + l), clockMode: "shift", inLabel: "A · B", extra: "Porta AND na entrada. Clear assíncrono comum a todos os flip-flops." }),
    apps: ["Conversão serial → paralelo.", "Expansão de saídas digitais para displays e LEDs.", "Linhas de atraso por bits."],
  },
  update: (c) => {
    const q = ["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"];
    if (c.n.nCLR === 0) return put(c, q, new Array(8).fill(0));
    if (c.rise("CLK")) {
      const v = bits(c, q);
      put(c, q, [c.n.A && c.n.B ? 1 : 0, ...v.slice(0, 7)]);
    }
  },
});

function piso(part: string, p165: boolean): void {
  const pins: Pin[] = p165
    ? [P(1, "SHLD", "in", "Shift (1) / Load (0): carga paralela assíncrona quando em 0"), P(2, "CLK", "in", "Clock (borda de subida)"), P(3, "E", "in", "Dado paralelo E"), P(4, "F", "in", "Dado paralelo F"), P(5, "G", "in", "Dado paralelo G"), P(6, "H", "in", "Dado paralelo H"), P(7, "!QH", "out", "Saída complementar do 8º estágio"), GND(8), P(9, "QH", "out", "Saída serial (8º estágio)"), P(10, "SI", "in", "Entrada serial"), P(11, "A", "in", "Dado paralelo A"), P(12, "B", "in", "Dado paralelo B"), P(13, "C", "in", "Dado paralelo C"), P(14, "D", "in", "Dado paralelo D"), P(15, "INH", "in", "Inibe o clock (1 = trava)"), VCC(16)]
    : [P(1, "SI", "in", "Entrada serial"), P(2, "A", "in", "Dado paralelo A"), P(3, "B", "in", "Dado paralelo B"), P(4, "C", "in", "Dado paralelo C"), P(5, "D", "in", "Dado paralelo D"), P(6, "INH", "in", "Inibe o clock (1 = trava)"), P(7, "CLK", "in", "Clock (borda de subida)"), GND(8), P(9, "!CLR", "in", "Clear assíncrono (ativo em 0)"), P(10, "E", "in", "Dado paralelo E"), P(11, "F", "in", "Dado paralelo F"), P(12, "G", "in", "Dado paralelo G"), P(13, "QH", "out", "Saída serial (8º estágio)"), P(14, "H", "in", "Dado paralelo H"), P(15, "SHLD", "in", "Shift (1) / Load (0): carga paralela síncrona quando em 0"), VCC(16)];
  defineIC({
    part, label: `${part} · Registrador de deslocamento 8 bits (paralelo → série), carga ${p165 ? "assíncrona" : "síncrona"}`, category: "icreg",
    keywords: "registrador deslocamento shift register paralelo serie piso 8 bits carga paralela serializador",
    pins,
    ds: {
      alt: `74LS${part.slice(2)}, 74HC${part.slice(2)}`, title: "Registrador de deslocamento de 8 bits, entrada paralela e saída serial", family: "TTL", pkg: "DIP-16",
      description: `Com SHLD em 0 carrega os 8 bits A a H (${p165 ? "assíncrono, sem clock" : "na próxima borda de subida do clock"}). Com SHLD em 1, cada borda de subida desloca os bits em direção a QH, e SI entra pelo primeiro estágio. A saída serial é QH.`,
      specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "35 MHz (74LS)"], ["Encapsulamento", "DIP-16"]],
      tables: [{ title: "Tabela de função", head: ["SHLD", "INH", "CLK", "Operação"], rows: [["0", "X", p165 ? "X" : "↑", "Carrega A a H"], ["1", "0", "↑", "Desloca: SI→A→B→...→H"], ["1", "1", "X", "Mantém"]] }],
      notes: ["O bit H sai primeiro: monte a palavra em H...A para enviar o bit mais significativo antes.", "Conversor paralelo → serial: transmissão de dados, leitura de teclados e chaves.", "Mantenha INH em 0 para deslocar."],
      model: [...SIM_NOTES, "INH e SI sem fio valem 0. SHLD sem fio vale 0 (carregando)."],
      diagramTitle: "Circuito interno (8 flip-flops com carga paralela)",
      diagram: chainScene({ n: 8, ff: "D", names: L8.map((l) => l), clockMode: "shift", inLabel: "SI", extra: "Cada estágio tem um multiplexador: entrada do estágio anterior (deslocar) ou dado paralelo (carregar)." }),
      apps: ["Conversão paralelo → serial.", "Leitura de 8 chaves por um único fio.", "Transmissão serial de palavras."],
    },
    update: (c) => {
      const q = ["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"];
      // O estado interno guarda os 8 bits (índices 0 a 7). Saída apenas QH.
      const st = () => Array.from({ length: 8 }, (_, i) => c.s(i));
      const wr = (v: number[]) => {
        v.forEach((b, i) => c.ss(i, b));
        c.set("QH", v[7]);
        if (p165) c.set("nQH", 1 - v[7]);
      };
      const par = () => L8.map((l) => c.n[l]);
      void q;
      if (!p165 && c.n.nCLR === 0) return wr(new Array(8).fill(0));
      if (p165 && c.n.SHLD === 0) return wr(par());
      if (c.rise("CLK") && !c.n.INH) {
        if (!p165 && c.n.SHLD === 0) return wr(par());
        const v = st();
        wr([c.n.SI, ...v.slice(0, 7)]);
      }
    },
    nInt: 8,
  });
}
piso("74165", true);
piso("74166", false);

defineIC({
  part: "74194", label: "74194 · Registrador universal de 4 bits (bidirecional)", category: "icreg",
  keywords: "registrador universal bidirecional shift register direita esquerda carga paralela 4 bits anel johnson",
  pins: [
    P(1, "!CLR", "in", "Clear assíncrono (ativo em 0)"), P(2, "SR", "in", "Entrada serial para deslocar à direita (QA←SR)"), P(3, "A", "in", "Dado paralelo A"), P(4, "B", "in", "Dado paralelo B"), P(5, "C", "in", "Dado paralelo C"), P(6, "D", "in", "Dado paralelo D"), P(7, "SL", "in", "Entrada serial para deslocar à esquerda (QD←SL)"), GND(8),
    P(9, "S1", "in", "Seleção de modo, bit 1"), P(10, "S0", "in", "Seleção de modo, bit 0"), P(11, "CLK", "in", "Clock (borda de subida)"), P(12, "QD", "out", "Saída D"), P(13, "QC", "out", "Saída C"), P(14, "QB", "out", "Saída B"), P(15, "QA", "out", "Saída A"), VCC(16),
  ],
  ds: {
    alt: "74LS194, 74HC194", title: "Registrador de deslocamento universal de 4 bits", family: "TTL", pkg: "DIP-16",
    description: "Quatro modos pelo par S1 S0: manter, deslocar à direita (QA→QB→QC→QD), deslocar à esquerda (QD→QC→QB→QA) e carga paralela. Clear assíncrono.",
    specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "36 MHz (74LS)"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["CLR", "S1", "S0", "CLK", "Operação"], rows: [["0", "X", "X", "X", "Zera"], ["1", "X", "X", "0", "Mantém"], ["1", "0", "0", "↑", "Mantém"], ["1", "0", "1", "↑", "Desloca à direita (SR entra em QA)"], ["1", "1", "0", "↑", "Desloca à esquerda (SL entra em QD)"], ["1", "1", "1", "↑", "Carrega A, B, C, D"]] }],
    notes: ["Contador em anel: ligue QD em SR, carregue 1000 e use S1 S0 = 01.", "Contador Johnson: ligue QD̅ em SR (use uma porta NOT).", "Mantenha o clock em um nível fixo ao mudar S1 e S0."],
    model: [...SIM_NOTES, "!CLR sem fio vale 1. S1 e S0 sem fio valem 0 (mantém)."],
    diagramTitle: "Circuito interno (4 flip-flops D com multiplexador de 4 entradas)",
    diagram: chainScene({ n: 4, ff: "D", names: ["QA", "QB", "QC", "QD"], clockMode: "shift", inLabel: "SR", extra: "Cada flip-flop recebe: ele mesmo (manter), vizinho da esquerda (direita), vizinho da direita (esquerda) ou dado paralelo (carga), escolhido por S1 S0." }),
    apps: ["Contadores em anel e Johnson (sequenciadores de semáforo e luzes).", "Conversor serial/paralelo bidirecional.", "Multiplicação e divisão por 2 em binário (desloca à esquerda ou direita)."],
  },
  update: (c) => {
    const q = ["QA", "QB", "QC", "QD"];
    if (c.n.nCLR === 0) return put(c, q, [0, 0, 0, 0]);
    if (!c.rise("CLK")) return;
    const v = bits(c, q);
    const m = c.n.S1 * 2 + c.n.S0;
    if (m === 1) put(c, q, [c.n.SR, v[0], v[1], v[2]]);
    else if (m === 2) put(c, q, [v[1], v[2], v[3], c.n.SL]);
    else if (m === 3) put(c, q, [c.n.A, c.n.B, c.n.C, c.n.D]);
  },
});

defineIC({
  part: "74595", label: "74HC595 · Registrador de deslocamento 8 bits com latch e saídas tri-state", category: "icreg",
  keywords: "74hc595 595 registrador deslocamento latch saida tri state expansor de saidas serial paralelo spi",
  nInt: 8,
  pins: [
    P(1, "QB", "out", "Saída B"), P(2, "QC", "out", "Saída C"), P(3, "QD", "out", "Saída D"), P(4, "QE", "out", "Saída E"), P(5, "QF", "out", "Saída F"), P(6, "QG", "out", "Saída G"), P(7, "QH", "out", "Saída H"), GND(8),
    P(9, "QHS", "out", "Saída serial (para ligar em cascata)"), P(10, "!SRCLR", "in", "Clear do registrador de deslocamento (ativo em 0)"), P(11, "SRCLK", "in", "Clock do deslocamento (borda de subida)"), P(12, "RCLK", "in", "Clock do latch (borda de subida)"), P(13, "!OE", "in", "Habilita saídas (ativo em 0)"), P(14, "SER", "in", "Entrada serial"), P(15, "QA", "out", "Saída A"), VCC(16),
  ],
  ds: {
    alt: "SN74HC595, 74LV595, 74AHC595", title: "Registrador de deslocamento de 8 bits com latch de saída e três estados", family: "CMOS", pkg: "DIP-16",
    description: "Dois estágios: um registrador de deslocamento (SRCLK) e um latch de saída (RCLK). As saídas só mudam quando RCLK sobe, o que evita piscadas durante o deslocamento. !OE em 1 coloca as saídas em alta impedância.",
    specs: [["Alimentação", "2 V a 6 V"], ["Clock máximo (típico)", "100 MHz (HC, VCC = 4,5 V)"], ["Corrente de saída", "±6 mA por saída"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["SRCLK", "RCLK", "!SRCLR", "!OE", "Operação"], rows: [["↑", "X", "1", "X", "Desloca: SER→reg A→B→...→H"], ["X", "↑", "1", "X", "Copia o registrador para as saídas"], ["X", "X", "0", "X", "Zera o registrador (não as saídas)"], ["X", "X", "X", "1", "Saídas em alta impedância"]] }],
    notes: ["Cascata: ligue QHS na entrada SER do próximo CI e use os mesmos clocks.", "Envie 8 bits com SRCLK e depois dê um pulso em RCLK.", "No simulador, a alta impedância é mostrada como 0 (saídas desabilitadas)."],
    model: [...SIM_NOTES, "!SRCLR sem fio vale 1. !OE sem fio vale 1 (saídas desabilitadas): ligue-o em 0 para ver as saídas."],
    diagramTitle: "Circuito interno (registrador de deslocamento + latch + tri-state)",
    diagram: chainScene({ n: 8, ff: "D", names: L8, clockMode: "shift", inLabel: "SER", extra: "Registrador de deslocamento (SRCLK) → latch de 8 bits (RCLK) → buffers tri-state controlados por !OE." }),
    apps: ["Expansão de saídas com 3 fios (SER, SRCLK, RCLK).", "Display de LEDs e matrizes.", "Controle de relés e semáforos com poucos pinos."],
  },
  update: (c) => {
    const outs = ["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"];
    const sh = (i: number) => c.s(i);
    // estado interno: 8 bits do registrador de deslocamento; latch guardado nas saídas (antes do tri-state): usar saída = latch & OE
    // Para manter o latch, guardamos em internos 0..7 o registrador; o latch fica implícito em c.get com OE ativo.
    // Simplificação: guardar latch em estado extra codificado como bit alto (valor 2 + bit).
    const reg: number[] = Array.from({ length: 8 }, (_, i) => sh(i) % 2);
    const lat: number[] = Array.from({ length: 8 }, (_, i) => (sh(i) >= 2 ? 1 : 0));
    let r: number[] = reg,
      l: number[] = lat;
    if (c.n.nSRCLR === 0) r = new Array(8).fill(0);
    else if (c.rise("SRCLK")) r = [c.n.SER, ...reg.slice(0, 7)];
    if (c.rise("RCLK")) l = r.slice();
    r.forEach((b, i) => c.ss(i, b + 2 * l[i]));
    const oe = c.n.nOE === 0;
    outs.forEach((o, i) => c.set(o, oe ? l[i] : 0));
    c.set("QHS", r[7]);
  },
});
