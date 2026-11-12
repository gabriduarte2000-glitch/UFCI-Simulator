// Arduino Uno (ATmega328P): ficha técnica e componente com programas prontos.
// Não é um emulador do AVR. O componente executa um programa pronto escolhido na lista.

import type { PortDef } from "../types";
import { registerComponent } from "../components/registry";
import { type Pin, registerDatasheet } from "./datasheet";
import { blocksScene, box, pinLabel, txt, wire } from "./scene";
import type { Item } from "./datasheet";

const P = (n: number, name: string, dir: Pin["dir"], fn: string): Pin => ({ n, name, dir, fn });
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const ARDUINO_SKETCHES = ["blink", "button", "analog", "thermo", "traffic", "fade"] as const;

registerDatasheet({
  part: "Arduino Uno", alt: "ATmega328P-PU (DIP-28), Arduino Uno R3, Nano (mesmo chip)", title: "Arduino Uno e microcontrolador ATmega328P", family: "CMOS", pkg: "DIP-28",
  description: "Placa com o microcontrolador ATmega328P de 8 bits a 16 MHz. Tem 14 pinos digitais (6 com PWM), 6 entradas analógicas de 10 bits, 32 KB de memória de programa, 2 KB de RAM e 1 KB de EEPROM. É programada em C e C++ pela IDE do Arduino com as funções setup() e loop().",
  pins: [
    P(1, "RESET", "nc", "Reset (PC6). Em nível baixo reinicia o programa"), P(2, "D0", "nc", "Digital 0 e RX da serial (PD0)"), P(3, "D1", "nc", "Digital 1 e TX da serial (PD1)"), P(4, "D2", "in", "Digital 2 (PD2), interrupção externa 0"),
    P(5, "D3", "nc", "Digital 3 com PWM (PD3), interrupção externa 1"), P(6, "D4", "nc", "Digital 4 (PD4)"), P(7, "VCC", "pwr", "Alimentação de 5 V"), P(8, "GND", "pwr", "Terra"),
    P(9, "XTAL1", "nc", "Cristal de 16 MHz"), P(10, "XTAL2", "nc", "Cristal de 16 MHz"), P(11, "D5", "nc", "Digital 5 com PWM (PD5)"), P(12, "D6", "nc", "Digital 6 com PWM (PD6)"),
    P(13, "D7", "nc", "Digital 7 (PD7)"), P(14, "D8", "nc", "Digital 8 (PB0)"), P(15, "D9", "out", "Digital 9 com PWM (PB1)"), P(16, "D10", "out", "Digital 10 com PWM (PB2), SS do SPI"),
    P(17, "D11", "out", "Digital 11 com PWM (PB3), MOSI do SPI"), P(18, "D12", "out", "Digital 12 (PB4), MISO do SPI"), P(19, "D13", "out", "Digital 13 (PB5), SCK do SPI e LED da placa"), P(20, "AVCC", "pwr", "Alimentação do conversor A/D"),
    P(21, "AREF", "nc", "Tensão de referência do conversor A/D"), P(22, "GND", "pwr", "Terra"), P(23, "A0", "in", "Entrada analógica 0 (PC0), 10 bits"), P(24, "A1", "nc", "Entrada analógica 1 (PC1)"),
    P(25, "A2", "nc", "Entrada analógica 2 (PC2)"), P(26, "A3", "nc", "Entrada analógica 3 (PC3)"), P(27, "A4", "nc", "Entrada analógica 4 (PC4) e SDA do I²C"), P(28, "A5", "nc", "Entrada analógica 5 (PC5) e SCL do I²C"),
  ],
  specs: [["Tensão de operação", "5 V (pinos de 0 a 5 V)"], ["Corrente por pino", "20 mA recomendada, 40 mA máxima"], ["Corrente total", "200 mA nos pinos de I/O"], ["Clock", "16 MHz"], ["Memória de programa", "32 KB (0,5 KB do bootloader)"], ["RAM e EEPROM", "2 KB e 1 KB"], ["Conversor A/D", "10 bits, 0 a 1023, referência de 5 V"], ["PWM", "8 bits, cerca de 490 Hz (D5 e D6 cerca de 980 Hz)"]],
  tables: [
    { title: "Funções principais", head: ["Função", "O que faz"], rows: [["pinMode(pino, modo)", "Define o pino como INPUT, OUTPUT ou INPUT_PULLUP"], ["digitalWrite(pino, nível)", "Coloca HIGH (5 V) ou LOW (0 V) na saída"], ["digitalRead(pino)", "Lê HIGH ou LOW"], ["analogRead(pino)", "Lê de 0 a 1023, que corresponde a 0 a 5 V"], ["analogWrite(pino, 0 a 255)", "PWM: tensão média = valor / 255 · 5 V"], ["delay(ms)", "Espera em milissegundos"]] },
    { title: "Programas prontos do simulador", head: ["Programa", "Entradas", "Saídas"], rows: [["Pisca", "nenhuma", "D13 liga e desliga"], ["Botão", "D2", "D13 segue o botão, D12 inverte"], ["Analógico para PWM", "A0", "D9 = A0 e D13 acende acima de 2,5 V"], ["Termostato", "A0", "D12 liga o aquecedor abaixo do limite, com histerese"], ["Semáforo", "nenhuma", "D10 verde, D11 amarelo, D12 vermelho"], ["Fade", "nenhuma", "D9 sobe e desce suavemente"]] },
  ],
  notes: ["Use resistor de 220 Ω a 330 Ω em série com cada LED.", "Botão com INPUT_PULLUP lê LOW quando apertado. No simulador, a entrada D2 vale 1 quando o botão está apertado.", "Nunca ligue um pino de saída direto em um motor ou relé: use um transistor.", "Sensor LM35: 10 mV por °C. Com a referência de 5 V, cada passo do conversor vale 4,9 mV, ou cerca de 0,5 °C."],
  model: ["Não é um emulador do AVR: o componente executa um programa pronto, escolhido na lista, com o comportamento de um sketch equivalente.", "Entradas: D2 (digital, 0 ou 1) e A0 (analógica, em volts, de 0 a 5).", "Saídas: D9 e D10 (PWM, valor médio em volts), D11, D12 e D13 (0 ou 5 V, mostrados como 0 ou 1).", "Pinos marcados como sem conexão existem no chip, mas os programas prontos não os usam.", "Sem atraso de execução do loop. O tempo do programa é o tempo da simulação, em segundos."],
  diagramTitle: "Diagrama funcional",
  diagram: ((): ReturnType<typeof blocksScene> => {
    const items: Item[] = [
      box(140, 14, 200, 170, "ATmega328P", "programa em C/C++"),
      box(160, 54, 160, 28, "CPU AVR 8 bits", "16 MHz"), box(160, 92, 76, 28, "Flash", "32 KB"), box(244, 92, 76, 28, "RAM", "2 KB"), box(160, 130, 160, 28, "Conversor A/D e PWM", "10 bits e 8 bits"),
      wire([30, 66], [140, 66]), pinLabel(30, 66, "l", 4, "D2"), wire([30, 146], [140, 146]), pinLabel(30, 146, "l", 23, "A0"),
      wire([340, 56], [440, 56]), pinLabel(440, 56, "r", 15, "D9"), wire([340, 86], [440, 86]), pinLabel(440, 86, "r", 16, "D10"), wire([340, 116], [440, 116]), pinLabel(440, 116, "r", 17, "D11"), wire([340, 146], [440, 146]), pinLabel(440, 146, "r", 18, "D12"), wire([340, 172], [440, 172]), pinLabel(440, 172, "r", 19, "D13"),
      txt(240, 206, "VCC (7) · GND (8, 22) · cristal (9, 10)", "middle", 10),
    ];
    return blocksScene(480, 220, items);
  })(),
  apps: ["Pisca-pisca e semáforo.", "Leitura de sensores analógicos (LM35, LDR, potenciômetro).", "Controle liga-desliga de temperatura.", "Brilho de LED e velocidade de motor por PWM."],
});

const inP = (name: string, label: string, short: string, unit: string): PortDef => ({ name, label, short, unit, domain: "signal", dir: "in", optional: true });
const outP = (name: string, label: string, short: string, unit: string): PortDef => ({ name, label, short, unit, domain: "signal", dir: "out" });

registerComponent({
  type: "ic.arduino",
  label: "Arduino Uno (ATmega328P) · programas prontos",
  category: "icmcu",
  labelPrefix: "Arduino",
  symbol: "ic:Arduino Uno",
  description: "Arduino Uno com um programa pronto à escolha: pisca, botão, analógico para PWM, termostato, semáforo ou fade. Entradas D2 e A0. Saídas D9 a D13.",
  model: "Executa o sketch escolhido. Pisca: D13 = onda quadrada de período T. Analógico: D9 = A0, D13 = (A0 > 2,5 V). Termostato: D12 liga se A0 < sp − h/2 e desliga se A0 > sp + h/2.",
  hypotheses: ["Não emula o processador AVR: cada programa é um modelo do sketch equivalente.", "O loop não tem atraso de execução.", "Tempo da simulação em segundos."],
  keywords: "arduino uno nano atmega328 atmega328p microcontrolador mcu sketch avr placa pwm analogwrite digitalwrite pisca led",
  datasheet: "Arduino Uno",
  ports: [
    inP("A0", "Entrada analógica A0 (0 a 5 V)", "A0", "V"),
    inP("D2", "Entrada digital D2 (botão: 1 = apertado)", "D2", ""),
    outP("D9", "Saída D9 (PWM, valor médio)", "D9", "V"),
    outP("D10", "Saída D10 (PWM, valor médio)", "D10", "V"),
    outP("D11", "Saída D11", "D11", ""),
    outP("D12", "Saída D12", "D12", ""),
    outP("D13", "Saída D13 (LED da placa)", "D13", ""),
  ],
  params: [
    { key: "sketch", label: "Programa", kind: "select", options: [{ value: "blink", label: "Pisca (D13)" }, { value: "button", label: "Botão (D2 para D13)" }, { value: "analog", label: "Analógico para PWM (A0 para D9)" }, { value: "thermo", label: "Termostato (A0 para D12)" }, { value: "traffic", label: "Semáforo (D10, D11, D12)" }, { value: "fade", label: "Fade (D9)" }], default: "blink", group: "basic" },
    { key: "T", label: "Período (pisca e fade)", unit: "s", kind: "number", default: 1, min: 0.01, group: "basic" },
    { key: "sp", label: "Termostato: valor de referência", unit: "V", kind: "number", default: 2.5, group: "basic", hint: "Com um LM35, 10 mV por °C: 0,5 V = 50 °C." },
    { key: "hyst", label: "Termostato: histerese", unit: "V", kind: "number", default: 0.1, min: 0, group: "basic" },
    { key: "tg", label: "Semáforo: tempo do verde", unit: "s", kind: "number", default: 5, min: 0.1, group: "basic" },
    { key: "ty", label: "Semáforo: tempo do amarelo", unit: "s", kind: "number", default: 2, min: 0.1, group: "basic" },
    { key: "tr", label: "Semáforo: tempo do vermelho", unit: "s", kind: "number", default: 5, min: 0.1, group: "basic" },
  ],
  block: (p) => {
    const sk = String(p.str("sketch"));
    const T = Math.max(p.num("T"), 1e-3),
      sp = p.num("sp"),
      h = p.num("hyst");
    const tg = p.num("tg"),
      ty = p.num("ty"),
      tr = p.num("tr");
    const cyc = tg + ty + tr;
    const base = { nStates: 1, x0: () => [0], der: () => {}, feedthrough: true } as const;
    const outs = (t: number, x: Float64Array, o: number, u: number[], y: number[]) => {
      y.fill(0);
      const A0 = clamp(u[0] ?? 0, 0, 5);
      const bt = (u[1] ?? 0) >= 0.5 ? 1 : 0;
      if (sk === "blink") y[4] = Math.floor((t / (T / 2)) + 1e-9) % 2 === 0 ? 1 : 0;
      else if (sk === "button") {
        y[4] = bt;
        y[3] = 1 - bt;
      } else if (sk === "analog") {
        y[0] = Math.round((A0 / 5) * 255) / 255 * 5;
        y[4] = A0 > 2.5 ? 1 : 0;
      } else if (sk === "thermo") {
        y[3] = x[o];
        y[4] = x[o];
      } else if (sk === "traffic") {
        const c = t % cyc;
        if (c < tg) y[1] = 1;
        else if (c < tg + ty) y[2] = 1;
        else y[3] = 1;
      } else if (sk === "fade") {
        y[0] = 5 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / T));
        y[4] = Math.floor((t / (T / 2)) + 1e-9) % 2 === 0 ? 1 : 0;
      }
    };
    if (sk === "thermo") {
      return {
        ...base,
        feedthrough: false,
        x0: () => [0],
        out: outs,
        discrete: {
          nGuards: 2,
          guards: (_t, _x, _o, u, g) => {
            g[0] = (u[0] ?? 0) - (sp + h / 2);
            g[1] = (u[0] ?? 0) - (sp - h / 2);
          },
          fire: (_t, x, o, u, _prev, next, init) => {
            if (init) x[o] = (u[0] ?? 0) < sp ? 1 : 0;
            else if (next[0]) x[o] = 0;
            else if (!next[1]) x[o] = 1;
          },
        },
      };
    }
    return {
      ...base,
      out: outs,
      breakpoints: (t0, tf) => {
        const pts: number[] = [];
        const add = (period: number, offs: number[]) => {
          for (let k = Math.floor(t0 / period); k * period < tf; k++) for (const o of offs) { const v = k * period + o; if (v > t0 && v < tf) pts.push(v); }
        };
        if (sk === "blink" || sk === "fade") add(T / 2, [0]);
        if (sk === "traffic") add(cyc, [0, tg, tg + ty]);
        return pts;
      },
      minTimescale: () => (sk === "fade" ? T / 40 : sk === "blink" ? T / 4 : Infinity),
    };
  },
});
