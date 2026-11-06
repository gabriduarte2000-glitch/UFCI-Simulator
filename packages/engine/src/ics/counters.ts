// CIs de contadores: assíncronos (7490, 7493), síncronos (74160 a 74163, 74190/191, 74192/193) e CMOS (4017, 4518, 4520).

import { CMOS_SPECS, type FnTable, type Pin, SIM_NOTES, TTL_LS_SPECS } from "./datasheet";
import { defineIC, type Ctx } from "./define";
import { chainScene } from "./scene";
import type { Scene } from "./datasheet";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const GND = (n: number, cmos = false) => P(n, cmos ? "VSS" : "GND", "pwr", "Terra (0 V)");
const VCC = (n: number, cmos = false) => P(n, cmos ? "VDD" : "VCC", "pwr", cmos ? "Alimentação positiva" : "Alimentação +5 V");
const NC = (n: number) => P(n, "NC", "nc", "Sem conexão");

const bin4 = (n: number) => [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]; // D C B A
const seqTable = (title: string, max: number, cols = ["QD", "QC", "QB", "QA"]): FnTable => ({
  title,
  head: ["Contagem", ...cols],
  rows: Array.from({ length: max + 1 }, (_, i) => [String(i), ...bin4(i).slice(4 - cols.length).map(String)]),
});

const readN = (c: Ctx) => c.get("QA") + 2 * c.get("QB") + 4 * c.get("QC") + 8 * c.get("QD");
const writeN = (c: Ctx, n: number) => {
  c.set("QA", n & 1);
  c.set("QB", (n >> 1) & 1);
  c.set("QC", (n >> 2) & 1);
  c.set("QD", (n >> 3) & 1);
};

// ------------------------------------------------------------------------------------------------ 7490 e 7493 (assíncronos)

defineIC({
  part: "7490", label: "7490 · Contador de década (÷2 e ÷5)", category: "iccount",
  keywords: "contador decada bcd assincrono ripple divisor por 10 divisor por 5 mod 10 contagem",
  nInt: 1,
  pins: [
    P(1, "CKB", "in", "Clock da seção ÷5 (borda de descida)"), P(2, "R01", "in", "Reset para 0, entrada 1"), P(3, "R02", "in", "Reset para 0, entrada 2"), NC(4), VCC(5),
    P(6, "R91", "in", "Preset para 9, entrada 1"), P(7, "R92", "in", "Preset para 9, entrada 2"), P(8, "QC", "out", "Saída C (peso 4)"), P(9, "QB", "out", "Saída B (peso 2)"), GND(10),
    P(11, "QD", "out", "Saída D (peso 8)"), P(12, "QA", "out", "Saída A (peso 1)"), NC(13), P(14, "CKA", "in", "Clock da seção ÷2 (borda de descida)"),
  ],
  ds: {
    alt: "74LS90, 74HC90, SN7490", title: "Contador de década (÷2 e ÷5) assíncrono", family: "TTL", pkg: "DIP-14",
    description: "Dois contadores independentes: um flip-flop ÷2 (CKA → QA) e um contador ÷5 (CKB → QB, QC, QD). Ligando QA em CKB e usando CKA como clock, conta de 0 a 9 em BCD. Dispara na borda de descida.",
    specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "32 MHz (CKA), 16 MHz (CKB)"], ["Encapsulamento", "DIP-14"]],
    tables: [
      { title: "Reset e preset", head: ["R01", "R02", "R91", "R92", "QD", "QC", "QB", "QA"], rows: [["1", "1", "0/X", "X/0", "0", "0", "0", "0"], ["X/0", "0/X", "1", "1", "1", "0", "0", "1"], ["0/X", "X/0", "0/X", "X/0", "contagem", "", "", ""]], note: "R0 (as duas entradas em 1) zera. R9 (as duas em 1) coloca 1001 (9)." },
      seqTable("Sequência BCD (QA ligado em CKB)", 9),
    ],
    notes: ["Para contar de 0 a 9: ligue QA na entrada CKB e aplique o clock em CKA. A saída QD é a de maior peso.", "Para ÷10 com ciclo de trabalho 50%: ligue QD em CKA e aplique o clock em CKB. QA sai em onda quadrada.", "É assíncrono: cada estágio dispara o seguinte, então as saídas não mudam todas juntas."],
    model: [...SIM_NOTES, "A propagação em cascata é instantânea, então a 'onda' de bits chega ao mesmo tempo."],
    diagramTitle: "Circuito interno (flip-flops JK em cascata)",
    diagram: ((): Scene => chainScene({ n: 4, ff: "JK", names: ["QA", "QB", "QC", "QD"], clockMode: "ripple", extra: "Seção ÷2 (CKA → QA) e seção ÷5 (CKB → QB, QC, QD). Portas de reset/preset em R0 e R9." }))(),
    apps: ["Contador de décadas em displays de 7 segmentos com o 4511 ou 7447.", "Divisor de frequência por 10.", "Frequencímetros e relógios digitais."],
  },
  update: (c) => {
    const w = (a: number, b: number) => {
      c.set("QA", a);
      c.set("QB", b & 1);
      c.set("QC", (b >> 1) & 1);
      c.set("QD", (b >> 2) & 1);
      c.ss(0, b);
    };
    const a = c.get("QA");
    const b = c.s(0);
    if (c.n.R91 && c.n.R92) w(1, 4);
    else if (c.n.R01 && c.n.R02) w(0, 0);
    else {
      let na = a,
        nb = b;
      if (c.fall("CKA")) na = 1 - a;
      if (c.fall("CKB")) nb = (b + 1) % 5;
      if (na !== a || nb !== b) w(na, nb);
    }
  },
});

defineIC({
  part: "7493", label: "7493 · Contador binário de 4 bits (÷2 e ÷8)", category: "iccount",
  keywords: "contador binario assincrono ripple divisor por 16 divisor por 8 mod 16 contagem",
  nInt: 1,
  pins: [
    P(1, "CKB", "in", "Clock da seção ÷8 (borda de descida)"), P(2, "R01", "in", "Reset para 0, entrada 1"), P(3, "R02", "in", "Reset para 0, entrada 2"), NC(4), VCC(5), NC(6), NC(7),
    P(8, "QC", "out", "Saída C (peso 4)"), P(9, "QB", "out", "Saída B (peso 2)"), GND(10), P(11, "QD", "out", "Saída D (peso 8)"), P(12, "QA", "out", "Saída A (peso 1)"), NC(13), P(14, "CKA", "in", "Clock da seção ÷2 (borda de descida)"),
  ],
  ds: {
    alt: "74LS93, 74HC93, SN7493", title: "Contador binário de 4 bits (÷2 e ÷8) assíncrono", family: "TTL", pkg: "DIP-14",
    description: "Um flip-flop ÷2 (CKA → QA) e um contador binário de 3 bits (CKB → QB, QC, QD). Ligando QA em CKB conta de 0 a 15. Dispara na borda de descida.",
    specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "32 MHz (CKA), 16 MHz (CKB)"], ["Encapsulamento", "DIP-14"]],
    tables: [{ title: "Reset", head: ["R01", "R02", "QD", "QC", "QB", "QA"], rows: [["1", "1", "0", "0", "0", "0"], ["0/X", "X/0", "contagem", "", "", ""]] }, seqTable("Sequência binária (QA ligado em CKB)", 15)],
    notes: ["Para contar de 0 a 15 ligue QA em CKB e use CKA como clock.", "Contador de módulo menor que 16: ligue duas saídas a um AND/NAND e leve o resultado aos resets R01 e R02."],
    model: [...SIM_NOTES, "A propagação em cascata é instantânea."],
    diagramTitle: "Circuito interno (flip-flops JK em cascata)",
    diagram: chainScene({ n: 4, ff: "JK", names: ["QA", "QB", "QC", "QD"], clockMode: "ripple", extra: "Seção ÷2 (CKA → QA) e seção ÷8 (CKB → QB, QC, QD). Porta de reset R0." }),
    apps: ["Divisor de frequência por 2, 4, 8 e 16.", "Contadores de módulo qualquer com reset parcial (por exemplo módulo 12)."],
  },
  update: (c) => {
    const n = readN(c);
    let nn = n;
    if (c.n.R01 && c.n.R02) nn = 0;
    else {
      const a = n & 1,
        b = n >> 1;
      let na = a,
        nb = b;
      if (c.fall("CKA")) na = 1 - a;
      if (c.fall("CKB")) nb = (b + 1) % 8;
      nn = na | (nb << 1);
    }
    if (nn !== n || c.init) {
      writeN(c, nn);
      c.ss(0, nn);
    }
  },
});

// ------------------------------------------------------------------------------------------------ 74160 a 74163 (síncronos)

const syncPins = (): Pin[] => [
  P(1, "!CLR", "in", "Clear (ativo em 0)"), P(2, "CLK", "in", "Clock (borda de subida)"), P(3, "A", "in", "Dado A (peso 1)"), P(4, "B", "in", "Dado B (peso 2)"), P(5, "C", "in", "Dado C (peso 4)"), P(6, "D", "in", "Dado D (peso 8)"),
  P(7, "ENP", "in", "Habilita a contagem (ENP e ENT em 1)"), GND(8), P(9, "!LOAD", "in", "Carga síncrona (ativo em 0)"), P(10, "ENT", "in", "Habilita a contagem e o carry RCO"),
  P(11, "QD", "out", "Saída D (peso 8)"), P(12, "QC", "out", "Saída C (peso 4)"), P(13, "QB", "out", "Saída B (peso 2)"), P(14, "QA", "out", "Saída A (peso 1)"), P(15, "RCO", "out", "Carry: 1 na contagem máxima com ENT = 1"), VCC(16),
];

function syncCounter(part: string, decade: boolean, asyncClear: boolean): void {
  const max = decade ? 9 : 15;
  defineIC({
    part,
    label: `${part} · Contador síncrono ${decade ? "de década (BCD)" : "binário de 4 bits"}, clear ${asyncClear ? "assíncrono" : "síncrono"}`,
    category: "iccount",
    keywords: `contador sincrono ${decade ? "decada bcd mod 10" : "binario mod 16"} carga paralela load clear ${asyncClear ? "assincrono" : "sincrono"} cascata rco`,
    pins: syncPins(),
    ds: {
      alt: `74LS${part.slice(2)}, 74HC${part.slice(2)}, 74ALS${part.slice(2)}`, family: "TTL", pkg: "DIP-16",
      title: `Contador síncrono ${decade ? "de década" : "binário de 4 bits"} com carga paralela e clear ${asyncClear ? "assíncrono" : "síncrono"}`,
      description: `Todos os flip-flops mudam juntos na borda de subida do clock. Conta de 0 a ${max}${decade ? " (BCD)" : ""}. Tem carga paralela síncrona (LOAD), habilitação (ENP e ENT) e saída de carry (RCO) para cascata. O clear é ${asyncClear ? "assíncrono: zera na hora, sem esperar o clock" : "síncrono: zera na próxima borda de subida"}.`,
      specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "25 a 32 MHz (74LS)"], ["Setup dos dados", "da ordem de 20 ns"], ["Encapsulamento", "DIP-16"]],
      tables: [
        { title: "Tabela de função", head: ["CLR", "LOAD", "ENP", "ENT", "CLK", "Operação"], rows: [asyncClear ? ["0", "X", "X", "X", "X", "Zera já (assíncrono)"] : ["0", "X", "X", "X", "↑", "Zera na borda (síncrono)"], ["1", "0", "X", "X", "↑", "Carrega A, B, C, D"], ["1", "1", "1", "1", "↑", "Conta +1"], ["1", "1", "0", "X", "X", "Mantém"], ["1", "1", "X", "0", "X", "Mantém (RCO = 0)"]] },
        seqTable(`Contagem 0 a ${max}`, max),
      ],
      notes: [
        "RCO = ENT · QA · QB · QC · QD (binário) ou ENT · QA · QD (década): sobe na contagem máxima e permite ligar vários contadores em cascata.",
        "Cascata síncrona: ligue RCO do primeiro em ENT do segundo e use o mesmo clock nos dois (ENP em 1).",
        "Contador de módulo M menor que o máximo: detecte o estado M−1 com uma porta e ligue a saída em LOAD (carregando 0), ou use o clear.",
        "Para uso normal ligue CLR, LOAD, ENP e ENT em 1.",
      ],
      model: [...SIM_NOTES, "Entradas ativas em baixo (CLR e LOAD) sem fio valem 1 (inativas). ENP e ENT sem fio valem 0: ligue-as em nível alto para contar."],
      diagramTitle: "Circuito interno (flip-flops JK síncronos)",
      diagram: chainScene({ n: 4, ff: "JK", names: ["QA", "QB", "QC", "QD"], clockMode: "sync", extra: "Lógica à frente de cada J e K: carga (LOAD), habilitação (ENP, ENT), limite do módulo e clear. RCO = ENT · estado máximo." }),
      apps: ["Contador de estados de uma máquina de estados (por exemplo sequência de semáforo).", "Divisores de frequência programáveis com carga paralela.", "Temporizadores digitais em cascata."],
    },
    update: (c) => {
      let N = readN(c);
      const clear = c.n.nCLR === 0;
      if (asyncClear && clear) N = 0;
      else if (c.rise("CLK")) {
        if (clear) N = 0;
        else if (c.n.nLOAD === 0) N = c.n.A + 2 * c.n.B + 4 * c.n.C + 8 * c.n.D;
        else if (c.n.ENP && c.n.ENT) N = decade ? (N >= 9 ? 0 : N + 1) : (N + 1) % 16;
      }
      writeN(c, N);
      c.set("RCO", c.n.ENT && N === max ? 1 : 0);
    },
  });
}
syncCounter("74160", true, true);
syncCounter("74161", false, true);
syncCounter("74162", true, false);
syncCounter("74163", false, false);

// ------------------------------------------------------------------------------------------------ 74190 e 74191 (up/down, um clock)

function upDownSingle(part: string, decade: boolean): void {
  const max = decade ? 9 : 15;
  defineIC({
    part,
    label: `${part} · Contador up/down síncrono ${decade ? "de década" : "binário"} (um clock)`,
    category: "iccount",
    keywords: `contador up down crescente decrescente sincrono ${decade ? "decada bcd" : "binario"} carga paralela`,
    pins: [
      P(1, "B", "in", "Dado B (peso 2)"), P(2, "QB", "out", "Saída B"), P(3, "QA", "out", "Saída A"), P(4, "!CTEN", "in", "Habilita a contagem (ativo em 0)"), P(5, "DWN", "in", "Sentido: 0 = sobe, 1 = desce (D/Ū)"),
      P(6, "QC", "out", "Saída C"), P(7, "QD", "out", "Saída D"), GND(8), P(9, "D", "in", "Dado D (peso 8)"), P(10, "C", "in", "Dado C (peso 4)"), P(11, "!LOAD", "in", "Carga assíncrona (ativo em 0)"),
      P(12, "!RCO", "out", "Clock de ondulação (ativo em 0)"), P(13, "MXMN", "out", "Máximo ou mínimo alcançado"), P(14, "CLK", "in", "Clock (borda de subida)"), P(15, "A", "in", "Dado A (peso 1)"), VCC(16),
    ],
    ds: {
      alt: `74LS${part.slice(2)}, 74HC${part.slice(2)}, 74ALS${part.slice(2)}`, family: "TTL", pkg: "DIP-16",
      title: `Contador síncrono up/down ${decade ? "de década" : "binário"} com um clock e carga paralela`,
      description: `Conta para cima ou para baixo (pino DWN) de 0 a ${max}, na borda de subida do clock, quando !CTEN está em 0. Carga paralela assíncrona (!LOAD em 0). MXMN vale 1 na contagem ${max} (subindo) ou 0 (descendo). Os sinais MXMN e !RCO ligam estágios em cascata.`,
      specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "20 MHz (74LS)"], ["Encapsulamento", "DIP-16"]],
      tables: [{ title: "Tabela de função", head: ["LOAD", "CTEN", "DWN", "CLK", "Operação"], rows: [["0", "X", "X", "X", "Carrega A, B, C, D (assíncrono)"], ["1", "0", "0", "↑", "Conta para cima"], ["1", "0", "1", "↑", "Conta para baixo"], ["1", "1", "X", "X", "Mantém"]] }, seqTable(`Contagem 0 a ${max}`, max)],
      notes: ["MXMN = 1 em 9 contando para cima (ou 15, no binário) e em 0 contando para baixo.", "!RCO = 0 quando MXMN = 1, CLK = 0 e !CTEN = 0: serve de clock para o estágio seguinte.", "Para cascata, ligue !RCO do primeiro no clock do segundo e mantenha !CTEN em 0 nos dois."],
      model: [...SIM_NOTES, "Entradas ativas em baixo sem fio valem 1 (inativas). DWN sem fio vale 0 (sobe)."],
      diagramTitle: "Circuito interno (flip-flops síncronos com lógica up/down)",
      diagram: chainScene({ n: 4, ff: "JK", names: ["QA", "QB", "QC", "QD"], clockMode: "sync", extra: "Lógica de sentido (DWN), habilitação (!CTEN) e carga paralela (!LOAD) à frente de cada flip-flop." }),
      apps: ["Contador crescente e decrescente (entrada e saída de pessoas, estoque).", "Temporizador regressivo.", "Frequencímetro e relógio."],
    },
    update: (c) => {
      let N = readN(c);
      if (c.n.nLOAD === 0) N = c.n.A + 2 * c.n.B + 4 * c.n.C + 8 * c.n.D;
      else if (c.rise("CLK") && c.n.nCTEN === 0) {
        const down = c.n.DWN === 1;
        N = down ? (N <= 0 ? max : N - 1) : N >= max ? 0 : N + 1;
      }
      writeN(c, N);
      const mm = c.n.DWN ? N === 0 : N === max;
      c.set("MXMN", mm ? 1 : 0);
      c.set("nRCO", mm && c.n.CLK === 0 && c.n.nCTEN === 0 ? 0 : 1);
    },
  });
}
upDownSingle("74190", true);
upDownSingle("74191", false);

// ------------------------------------------------------------------------------------------------ 74192 e 74193 (up/down, dois clocks)

function upDownDual(part: string, decade: boolean): void {
  const max = decade ? 9 : 15;
  defineIC({
    part,
    label: `${part} · Contador up/down síncrono ${decade ? "de década" : "binário"} (dois clocks)`,
    category: "iccount",
    keywords: `contador up down crescente decrescente dois clocks ${decade ? "decada bcd" : "binario"} carga paralela clear borrow carry`,
    pins: [
      P(1, "B", "in", "Dado B (peso 2)"), P(2, "QB", "out", "Saída B"), P(3, "QA", "out", "Saída A"), P(4, "DOWN", "in", "Clock de contagem para baixo (borda de subida)"), P(5, "UP", "in", "Clock de contagem para cima (borda de subida)"),
      P(6, "QC", "out", "Saída C"), P(7, "QD", "out", "Saída D"), GND(8), P(9, "D", "in", "Dado D (peso 8)"), P(10, "C", "in", "Dado C (peso 4)"), P(11, "!LOAD", "in", "Carga assíncrona (ativo em 0)"),
      P(12, "!CO", "out", "Carry (ativo em 0)"), P(13, "!BO", "out", "Borrow (ativo em 0)"), P(14, "CLR", "in", "Clear assíncrono (ativo em 1)"), P(15, "A", "in", "Dado A (peso 1)"), VCC(16),
    ],
    ds: {
      alt: `74LS${part.slice(2)}, 74HC${part.slice(2)}`, family: "TTL", pkg: "DIP-16",
      title: `Contador síncrono up/down ${decade ? "de década" : "binário"} com dois clocks`,
      description: `Tem um clock para subir (UP) e outro para descer (DOWN). Use um deles de cada vez e mantenha o outro em 1. Clear (CLR em 1) e carga paralela (!LOAD em 0) são assíncronos. !CO e !BO ligam estágios em cascata (!CO no UP do seguinte, !BO no DOWN do seguinte).`,
      specs: [...TTL_LS_SPECS, ["Clock máximo (típico)", "25 MHz (74LS)"], ["Encapsulamento", "DIP-16"]],
      tables: [{ title: "Tabela de função", head: ["CLR", "LOAD", "UP", "DOWN", "Operação"], rows: [["1", "X", "X", "X", "Zera (assíncrono)"], ["0", "0", "X", "X", "Carrega A, B, C, D (assíncrono)"], ["0", "1", "↑", "1", "Conta para cima"], ["0", "1", "1", "↑", "Conta para baixo"]] }, seqTable(`Contagem 0 a ${max}`, max)],
      notes: ["Atenção: CLR é ativo em nível ALTO (diferente dos 74160 a 74163).", "!CO = 0 quando o contador está em " + `${max}` + " e UP está em 0. !BO = 0 quando está em 0 e DOWN está em 0.", "Mantenha o clock que não é usado em nível alto."],
      model: [...SIM_NOTES, "UP e DOWN sem fio valem 0: ligue o clock não usado em nível alto (1)."],
      diagramTitle: "Circuito interno (flip-flops síncronos com dois clocks)",
      diagram: chainScene({ n: 4, ff: "T", names: ["QA", "QB", "QC", "QD"], clockMode: "sync", extra: "Lógica de contagem para cima (UP) e para baixo (DOWN), carry (!CO) e borrow (!BO)." }),
      apps: ["Contagem de entrada e saída (estacionamento, estoque).", "Divisores programáveis.", "Temporizador regressivo com borrow em cascata."],
    },
    update: (c) => {
      let N = readN(c);
      if (c.n.CLR) N = 0;
      else if (c.n.nLOAD === 0) N = c.n.A + 2 * c.n.B + 4 * c.n.C + 8 * c.n.D;
      else if (c.rise("UP") && c.n.DOWN === 1) N = N >= max ? 0 : N + 1;
      else if (c.rise("DOWN") && c.n.UP === 1) N = N <= 0 ? max : N - 1;
      writeN(c, N);
      c.set("nCO", N === max && c.n.UP === 0 ? 0 : 1);
      c.set("nBO", N === 0 && c.n.DOWN === 0 ? 0 : 1);
    },
  });
}
upDownDual("74192", true);
upDownDual("74193", false);

// ------------------------------------------------------------------------------------------------ CMOS: 4017, 4518, 4520

defineIC({
  part: "4017", label: "4017 · Contador de década com 10 saídas decodificadas (CMOS)", category: "iccount",
  keywords: "contador johnson decada decodificado sequenciador semaforo luzes leds um de dez 1 de 10 divisor por 10 ciclo",
  nInt: 0,
  pins: [
    P(1, "Q5", "out", "Saída decodificada 5"), P(2, "Q1", "out", "Saída decodificada 1"), P(3, "Q0", "out", "Saída decodificada 0"), P(4, "Q2", "out", "Saída decodificada 2"), P(5, "Q6", "out", "Saída decodificada 6"),
    P(6, "Q7", "out", "Saída decodificada 7"), P(7, "Q3", "out", "Saída decodificada 3"), GND(8, true), P(9, "Q8", "out", "Saída decodificada 8"), P(10, "Q4", "out", "Saída decodificada 4"), P(11, "Q9", "out", "Saída decodificada 9"),
    P(12, "CO", "out", "Carry out: 1 nas contagens 0 a 4, 0 de 5 a 9"), P(13, "INH", "in", "Inibe o clock (1 = trava a contagem)"), P(14, "CLK", "in", "Clock (borda de subida)"), P(15, "RESET", "in", "Reset (1 = volta para Q0)"), VCC(16, true),
  ],
  ds: {
    alt: "CD4017B, MC14017B, HEF4017B", title: "Contador de década com 10 saídas decodificadas (Johnson)", family: "CMOS", pkg: "DIP-16",
    description: "A cada borda de subida do clock, a saída em nível alto avança uma posição: Q0, Q1, ..., Q9 e volta a Q0. Só uma saída fica em 1 de cada vez. É o CI clássico para sequenciadores, luzes em sequência e semáforos.",
    specs: [...CMOS_SPECS, ["Clock máximo (típico)", "5 MHz a VDD = 10 V"], ["Corrente de saída", "suficiente para acionar um LED com resistor em série"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função", head: ["RESET", "INH", "CLK", "Operação"], rows: [["1", "X", "X", "Q0 = 1, demais 0"], ["0", "0", "↑", "Avança uma posição"], ["0", "1", "X", "Mantém"], ["0", "X", "↓", "Mantém"]] }],
    notes: ["Para um ciclo menor que 10, ligue a saída seguinte ao último estado desejado no RESET. Exemplo: ciclo de 6 estados → ligue Q6 em RESET.", "Para ligar em cascata use CO como clock do contador seguinte.", "INH em 0 e RESET em 0 para contar normalmente."],
    model: [...SIM_NOTES, "INH e RESET sem fio valem 0 (contagem liberada)."],
    diagramTitle: "Circuito interno (contador Johnson de 5 estágios + decodificador)",
    diagram: chainScene({ n: 5, ff: "D", names: ["J1", "J2", "J3", "J4", "J5"], clockMode: "shift", inLabel: "Q̅5 realimenta", extra: "Contador Johnson de 5 flip-flops D com 10 estados, seguido de um decodificador que ativa uma só saída (Q0 a Q9)." }),
    apps: ["Sequenciador de semáforo: cada saída acende uma luz ou fase.", "Luzes em sequência (efeito corrente).", "Divisor por 10 com saída decodificada."],
  },
  update: (c) => {
    let N = 0;
    for (let i = 0; i < 10; i++) if (c.get(`Q${i}`)) N = i;
    if (c.init) N = 0;
    if (c.n.RESET) N = 0;
    else if (c.rise("CLK") && !c.n.INH) N = (N + 1) % 10;
    for (let i = 0; i < 10; i++) c.set(`Q${i}`, i === N ? 1 : 0);
    c.set("CO", N < 5 ? 1 : 0);
  },
});

function cmosDual(part: string, decade: boolean): void {
  const max = decade ? 9 : 15;
  const pins: Pin[] = [
    P(1, "1CLK", "in", "Clock do contador A"), P(2, "1EN", "in", "Enable do contador A"), P(3, "1Q1", "out", "Q1 do contador A (peso 1)"), P(4, "1Q2", "out", "Q2 do contador A (peso 2)"),
    P(5, "1Q3", "out", "Q3 do contador A (peso 4)"), P(6, "1Q4", "out", "Q4 do contador A (peso 8)"), P(7, "1RST", "in", "Reset do contador A (ativo em 1)"), GND(8, true),
    P(9, "2CLK", "in", "Clock do contador B"), P(10, "2EN", "in", "Enable do contador B"), P(11, "2Q1", "out", "Q1 do contador B (peso 1)"), P(12, "2Q2", "out", "Q2 do contador B (peso 2)"),
    P(13, "2Q3", "out", "Q3 do contador B (peso 4)"), P(14, "2Q4", "out", "Q4 do contador B (peso 8)"), P(15, "2RST", "in", "Reset do contador B (ativo em 1)"), VCC(16, true),
  ];
  defineIC({
    part,
    label: `${part} · 2 contadores ${decade ? "BCD (década)" : "binários de 4 bits"} (CMOS)`,
    category: "iccount",
    keywords: `contador dual duplo cmos ${decade ? "bcd decada" : "binario"} clock enable reset cascata ripple`,
    pins,
    ds: {
      alt: `CD${part}B, CD${part}BMS, MC14${part.slice(1)}B`, family: "CMOS", pkg: "DIP-16",
      title: `Dois contadores ${decade ? "BCD (década)" : "binários de 4 bits"} crescentes (CMOS)`,
      description: `Dois contadores síncronos independentes. Cada um tem CLOCK e ENABLE intercambiáveis: conta na borda de subida do CLOCK com ENABLE em 1, ou na borda de descida do ENABLE com CLOCK em 0. RESET em 1 zera. Conta de 0 a ${max}.`,
      specs: [...CMOS_SPECS, ["Clock máximo (típico)", "6 MHz a VDD = 10 V (datasheet CD4518/4520BMS)"], ["Saída (fonte, 5 V)", "−0,53 mA com VOUT = 4,6 V"], ["Saída (dreno, 5 V)", "0,53 mA com VOUT = 0,4 V"], ["Encapsulamento", "DIP-16"]],
      tables: [{ title: "Tabela de função (cada contador)", head: ["CLOCK", "ENABLE", "RESET", "Operação"], rows: [["↑", "1", "0", "Conta +1"], ["0", "↓", "0", "Conta +1"], ["↓", "X", "0", "Mantém"], ["X", "↑", "0", "Mantém"], ["X", "X", "1", "Zera (Q1 a Q4 = 0)"]] }, seqTable(`Contagem 0 a ${max}`, max, ["Q4", "Q3", "Q2", "Q1"])],
      notes: ["Contagem única: ENABLE em 1 e clock no CLOCK.", "Cascata ondulante: ligue Q4 do primeiro no ENABLE do segundo e mantenha o CLOCK do segundo em 0.", `${decade ? "O CD4518 é BCD: volta a 0 depois de 9." : "O CD4520 é binário: volta a 0 depois de 15."}`, "Em CMOS, entradas que não forem usadas devem ir a VDD ou GND."],
      model: [...SIM_NOTES, "ENABLE e RESET sem fio valem 0. Para contar sem usar ENABLE, ligue-o em 1."],
      diagramTitle: "Circuito interno (4 flip-flops D síncronos)",
      diagram: chainScene({ n: 4, ff: "D", names: ["Q1", "Q2", "Q3", "Q4"], clockMode: "sync", extra: "Contador síncrono interno de 4 estágios, com lógica de carry interna e entrada de reset." }),
      apps: ["Contador de unidades e dezenas com o 4511 e displays de 7 segmentos (experimento da aula).", "Divisores de frequência em CMOS.", "Contagem de eventos com baixo consumo."],
    },
    update: (c) => {
      for (const i of [1, 2]) {
        let N = c.get(`${i}Q1`) + 2 * c.get(`${i}Q2`) + 4 * c.get(`${i}Q3`) + 8 * c.get(`${i}Q4`);
        if (c.n[`${i}RST`]) N = 0;
        else if ((c.rise(`${i}CLK`) && c.n[`${i}EN`] === 1) || (c.fall(`${i}EN`) && c.n[`${i}CLK`] === 0)) N = N >= max ? 0 : N + 1;
        c.set(`${i}Q1`, N & 1);
        c.set(`${i}Q2`, (N >> 1) & 1);
        c.set(`${i}Q3`, (N >> 2) & 1);
        c.set(`${i}Q4`, (N >> 3) & 1);
      }
    },
  });
}
cmosDual("4518", true);
cmosDual("4520", false);
