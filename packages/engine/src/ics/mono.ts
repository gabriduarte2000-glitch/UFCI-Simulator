// Monoestável 74123 e datasheet do temporizador 555 (componente já existente).

import { getDef } from "../components/registry";
import { CMOS_SPECS, type Pin, registerDatasheet, SIM_NOTES, TTL_LS_SPECS } from "./datasheet";
import { defineIC } from "./define";
import { blocksScene, box, dot, gate, pinLabel, txt, wire } from "./scene";
import type { Item } from "./datasheet";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });

defineIC({
  part: "74123", label: "74123 · Dois monoestáveis redisparáveis (R e C como parâmetros)", category: "ictime",
  keywords: "monoestavel one shot pulso temporizador atraso monoestable largura de pulso 123 retriggerable",
  pins: [
    P(1, "!1A", "in", "Disparo do monoestável 1 por borda de descida (com 1B = 1)"), P(2, "1B", "in", "Disparo do monoestável 1 por borda de subida (com !1A = 0)"), P(3, "!1CLR", "in", "Clear do monoestável 1 (ativo em 0)"),
    P(4, "!1Q", "out", "Saída complementar do monoestável 1"), P(5, "2Q", "out", "Saída do monoestável 2"), P(6, "2Cext", "nc", "Capacitor externo 2 (no simulador: parâmetro C2)"), P(7, "2RCext", "nc", "Resistor/capacitor externo 2 (no simulador: parâmetro R2)"), P(8, "GND", "pwr", "Terra (0 V)"),
    P(9, "!2A", "in", "Disparo do monoestável 2 por borda de descida (com 2B = 1)"), P(10, "2B", "in", "Disparo do monoestável 2 por borda de subida (com !2A = 0)"), P(11, "!2CLR", "in", "Clear do monoestável 2 (ativo em 0)"), P(12, "!2Q", "out", "Saída complementar do monoestável 2"),
    P(13, "1Q", "out", "Saída do monoestável 1"), P(14, "1Cext", "nc", "Capacitor externo 1 (no simulador: parâmetro C1)"), P(15, "1RCext", "nc", "Resistor/capacitor externo 1 (no simulador: parâmetro R1)"), P(16, "VCC", "pwr", "Alimentação +5 V"),
  ],
  timers: { n: 2, guard: (t, x, o, g, base) => ((g[base] = t - x[o]), (g[base + 1] = t - x[o + 1])) },
  init: [1e30, 1e30],
  params: [
    { key: "R1", label: "R1 externo", unit: "kΩ", kind: "number", default: 10, min: 1, max: 1000, group: "basic" },
    { key: "C1", label: "C1 externo", unit: "µF", kind: "number", default: 1, min: 0.001, group: "basic" },
    { key: "R2", label: "R2 externo", unit: "kΩ", kind: "number", default: 10, min: 1, max: 1000, group: "basic" },
    { key: "C2", label: "C2 externo", unit: "µF", kind: "number", default: 1, min: 0.001, group: "basic" },
  ],
  ds: {
    alt: "74LS123, 74HC123, SN74123", title: "Dois multivibradores monoestáveis redisparáveis com clear", family: "TTL", pkg: "DIP-16",
    description: "Cada metade gera um pulso de largura fixa tw ≈ 0,28 · R · C quando recebe uma borda de disparo. Redisparável: um novo disparo durante o pulso reinicia a contagem de tempo. Clear em 0 encerra o pulso.",
    specs: [...TTL_LS_SPECS, ["Largura do pulso (C > 1000 pF)", "tw ≈ 0,28 · R · C (R em Ω, C em F)"], ["R externo", "5 kΩ a 260 kΩ (74LS123)"], ["Encapsulamento", "DIP-16"]],
    tables: [{ title: "Tabela de função (cada metade)", head: ["!CLR", "!A", "B", "Q", "!Q"], rows: [["0", "X", "X", "0", "1"], ["X", "1", "X", "mantém", "mantém"], ["X", "X", "0", "mantém", "mantém"], ["1", "↓", "1", "pulso", "pulso"], ["1", "0", "↑", "pulso", "pulso"], ["↑", "0", "1", "pulso", "pulso"]], note: "Pulso: Q = 1 durante tw." }],
    notes: ["Disparo por A: borda de descida com B em 1. Disparo por B: borda de subida com A em 0.", "Se o disparo se repete antes de tw acabar, Q fica em 1 (redisparável): serve de detector de falta de pulso (watchdog).", "No simulador a largura é tw = 0,28 · R · C com R em kΩ e C em µF dos parâmetros.", "Use no semáforo para gerar o tempo de travessia de pedestres a partir de um botão."],
    model: [...SIM_NOTES, "Os pinos de R e C externos não existem no simulador: ajuste R1, C1, R2 e C2 nos parâmetros. Entradas ativas em baixo sem fio valem 1; B sem fio vale 0."],
    diagramTitle: "Circuito interno (um dos monoestáveis)",
    diagram: ((): ReturnType<typeof blocksScene> => {
      const items: Item[] = [
        txt(8, 40, "!A", "start", 10, true), wire([40, 36], [110, 36]), pinLabel(40, 36, "l", "1", "!A"),
        txt(8, 70, "B", "start", 10, true), wire([40, 70], [110, 70]), pinLabel(40, 70, "l", "2", "B"),
        gate(110, 54, "and", 2),
        box(200, 20, 120, 80, "Disparo", "borda → pulso"),
        wire([150, 54], [200, 54]),
        box(350, 20, 130, 80, "Temporização", "tw = 0,28·R·C"),
        wire([320, 60], [350, 60]),
        box(350, 130, 130, 40, "R e C externos", "", undefined, true), wire([415, 100], [415, 130]),
        box(510, 40, 90, 40, "Latch Q", "!Q"), wire([480, 60], [510, 60]),
        wire([600, 52], [640, 52]), pinLabel(640, 52, "r", "13", "Q"), wire([600, 70], [640, 70]), pinLabel(640, 70, "r", "4", "!Q"),
        txt(250, 130, "!CLR zera o latch", "middle", 9), dot(150, 54),
      ];
      return blocksScene(720, 190, items);
    })(),
    apps: ["Tempo de travessia de pedestres (botão → verde de pedestres por tw).", "Eliminação de ruído de contato (debounce).", "Gerador de atraso e de pulso de largura fixa.", "Detector de falta de pulso (watchdog)."],
  },
  update: (c) => {
    if (c.init) (c.set("n1Q", 1), c.set("n2Q", 1));
    for (const k of [1, 2]) {
      const q = `${k}Q`;
      const w = 0.28 * c.par.num(`R${k}`) * 1e3 * c.par.num(`C${k}`) * 1e-6;
      const clrId = `n${k}CLR`;
      if (c.n[clrId] === 0) {
        c.set(q, 0);
        c.set(`n${q}`, 1);
        c.ss(k - 1, 1e30);
        continue;
      }
      const aId = `n${k}A`;
      const bId = `${k}B`;
      const trig = (c.fall(aId) && c.n[bId] === 1) || (c.rise(bId) && c.n[aId] === 0) || (c.rise(clrId) && c.n[aId] === 0 && c.n[bId] === 1);
      if (trig) {
        c.set(q, 1);
        c.set(`n${q}`, 0);
        c.ss(k - 1, c.t + w);
      } else if (c.rise(`__timer${k - 1}`)) {
        c.set(q, 0);
        c.set(`n${q}`, 1);
        c.ss(k - 1, 1e30);
      }
    }
  },
});

// ---------------------------------------------------------------- 555

registerDatasheet({
  part: "555", alt: "NE555, LM555, TLC555 (CMOS)", title: "Temporizador de precisão 555", family: "TTL", pkg: "DIP-8",
  description: "Dois comparadores (limiares em 1/3 e 2/3 de VCC), um latch SR, um transistor de descarga e um estágio de saída. Opera como astável (oscilador) ou monoestável (pulso único).",
  pins: [
    P(1, "GND", "pwr", "Terra (0 V)"), P(2, "TRIG", "in", "Disparo: quando abaixo de VCC/3, a saída vai a 1"), P(3, "OUT", "out", "Saída"), P(4, "RESET", "in", "Reset (ativo em 0): força a saída em 0"),
    P(5, "CTRL", "in", "Controle de tensão: altera o limiar de 2/3 de VCC (filtre com 10 nF)"), P(6, "THR", "in", "Limiar: quando acima de 2VCC/3, a saída vai a 0"), P(7, "DIS", "out", "Descarga: leva ao terra quando a saída está em 0"), P(8, "VCC", "pwr", "Alimentação +4,5 V a +16 V"),
  ],
  specs: [["Alimentação (NE555)", "4,5 V a 16 V"], ["Corrente de saída", "até 200 mA (fonte e dreno)"], ["Limiares", "1/3 e 2/3 de VCC"], ["Frequência máxima", "da ordem de 500 kHz"], ["Encapsulamento", "DIP-8"]],
  tables: [
    { title: "Astável", head: ["Grandeza", "Fórmula"], rows: [["Frequência", "f = 1,44 / ((R1 + 2·R2) · C)"], ["Tempo em alto", "tH = 0,693 · (R1 + R2) · C"], ["Tempo em baixo", "tL = 0,693 · R2 · C"], ["Ciclo de trabalho", "D = (R1 + R2) / (R1 + 2·R2)"]] },
    { title: "Monoestável", head: ["Grandeza", "Fórmula"], rows: [["Largura do pulso", "tw = 1,1 · R · C"], ["Disparo", "borda de descida em TRIG abaixo de VCC/3"]] },
    { title: "Função", head: ["RESET", "TRIG", "THR", "OUT"], rows: [["0", "X", "X", "0"], ["1", "< VCC/3", "X", "1"], ["1", "> VCC/3", "> 2VCC/3", "0"], ["1", "> VCC/3", "< 2VCC/3", "mantém"]] },
  ],
  notes: ["Astável: ligue THR em TRIG, R1 de VCC a DIS, R2 de DIS a THR e C de THR ao terra.", "Monoestável: R de VCC a THR/DIS, C de THR ao terra, disparo em TRIG com um pulso negativo.", "Coloque um capacitor de 10 nF de CTRL ao terra para reduzir ruído.", "Use a saída do 555 como clock dos contadores (74163, 4017, 7490)."],
  model: [...SIM_NOTES, "O componente 'Temporizador 555' do simulador usa VCC como parâmetro e modela comparadores ideais. Ligue o resistor e o capacitor no circuito analógico."],
  diagramTitle: "Diagrama funcional",
  diagram: ((): ReturnType<typeof blocksScene> => {
    const items: Item[] = [
      box(150, 20, 180, 190, "555", "", undefined, false),
      box(190, 40, 100, 34, "Comparador THR", "> 2VCC/3"), box(190, 150, 100, 34, "Comparador TRIG", "< VCC/3"),
      box(190, 92, 100, 40, "Latch SR", "Q"),
      wire([40, 57], [150, 57]), pinLabel(40, 57, "l", 6, "THR"), wire([40, 167], [150, 167]), pinLabel(40, 167, "l", 2, "TRIG"), wire([40, 112], [150, 112]), pinLabel(40, 112, "l", 4, "RESET"),
      wire([330, 112], [420, 112]), pinLabel(420, 112, "r", 3, "OUT"), wire([330, 57], [420, 57]), pinLabel(420, 57, "r", 7, "DIS"),
      txt(240, 232, "VCC (8) · GND (1) · CTRL (5)", "middle", 10),
    ];
    return blocksScene(480, 245, items);
  })(),
  apps: ["Gerador de clock para contadores e máquinas de estado.", "Temporizador de um pulso (monoestável).", "Modulação por largura de pulso."],
});
const d555 = getDef("elec.timer555");
if (d555) d555.datasheet = "555";
void CMOS_SPECS;
