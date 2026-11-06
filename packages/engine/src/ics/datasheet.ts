// Fichas resumidas (datasheets) dos CIs digitais: pinagem, circuito interno, tabelas e especificações.
// Os valores são os típicos de catálogo. Confira sempre o datasheet do fabricante antes de montar de verdade.

export interface Pin {
  n: number;
  /** Nome do pino. Um "!" na frente marca nível ativo baixo (vira barra em cima). */
  name: string;
  dir: "in" | "out" | "pwr" | "nc";
  fn: string;
}

export type Item =
  | { k: "gate"; g: "and" | "or" | "nand" | "nor" | "xor" | "xnor" | "not" | "buf"; x: number; y: number; n?: number }
  | { k: "box"; x: number; y: number; w: number; h: number; t: string; s?: string; clk?: number[]; dash?: boolean; fill?: string }
  | { k: "wire"; p: [number, number][]; arrow?: boolean }
  | { k: "dot"; x: number; y: number }
  | { k: "text"; x: number; y: number; t: string; a?: "start" | "middle" | "end"; size?: number; bold?: boolean; color?: string }
  | { k: "pin"; x: number; y: number; side: "l" | "r" | "t" | "b"; num: number | string; name: string };

export interface Scene {
  w: number;
  h: number;
  items: Item[];
}

export interface FnTable {
  title: string;
  head: string[];
  rows: string[][];
  note?: string;
}

export interface Datasheet {
  part: string;
  /** Equivalentes e variantes (família). */
  alt: string;
  title: string;
  family: "TTL" | "CMOS";
  pkg: string;
  description: string;
  pins: Pin[];
  specs: [string, string][];
  tables: FnTable[];
  notes: string[];
  /** O que o simulador faz e o que simplifica. */
  model: string[];
  diagramTitle: string;
  diagram: Scene | null;
  apps: string[];
}

const sheets = new Map<string, Datasheet>();

export function registerDatasheet(d: Datasheet): void {
  if (sheets.has(d.part)) throw new Error(`Datasheet duplicado: ${d.part}`);
  sheets.set(d.part, d);
}
export const getDatasheet = (part: string): Datasheet | undefined => sheets.get(part);
export const allDatasheets = (): Datasheet[] => [...sheets.values()];

/** "!CLR" → "C̅L̅R̅" (barra sobre as letras). */
export const overbar = (name: string): string => (name.startsWith("!") ? [...name.slice(1)].map((c) => c + "̅").join("") : name);
/** Identificador seguro para uso como nome de porta. */
export const pinId = (name: string): string => name.replace(/^!/, "n").replace(/[^A-Za-z0-9_]/g, "");

// ------------------------------------------------------------------------------------------------ famílias

export const TTL_LS_SPECS: [string, string][] = [
  ["Alimentação (VCC)", "4,75 a 5,25 V (nominal 5 V)"],
  ["Nível alto na entrada (VIH)", "≥ 2,0 V"],
  ["Nível baixo na entrada (VIL)", "≤ 0,8 V"],
  ["Saída em nível alto (VOH)", "≥ 2,7 V (típico 3,4 V)"],
  ["Saída em nível baixo (VOL)", "≤ 0,5 V (típico 0,25 V)"],
  ["Corrente de saída", "IOL = 8 mA, IOH = −0,4 mA"],
];
export const TTL_STD_SPECS: [string, string][] = [
  ["Alimentação (VCC)", "4,75 a 5,25 V (nominal 5 V)"],
  ["Nível alto na entrada (VIH)", "≥ 2,0 V"],
  ["Nível baixo na entrada (VIL)", "≤ 0,8 V"],
  ["Saída em nível alto (VOH)", "≥ 2,4 V (típico 3,4 V)"],
  ["Saída em nível baixo (VOL)", "≤ 0,4 V (típico 0,2 V)"],
  ["Corrente de saída", "IOL = 16 mA, IOH = −0,8 mA"],
];
export const CMOS_SPECS: [string, string][] = [
  ["Alimentação (VDD)", "3 a 15 V (série B, máximo absoluto 18 V)"],
  ["Entrada alta / baixa", "VIH ≥ 3,5 V e VIL ≤ 1,5 V com VDD = 5 V"],
  ["Saída", "Excursão total: VOH ≈ VDD e VOL ≈ 0 V sem carga"],
  ["Corrente de saída", "Ordem de 0,5 mA a 5 V e 1,3 mA a 10 V (série B padrão)"],
  ["Consumo parado", "Microampères (cresce com a frequência de chaveamento)"],
  ["Entradas", "Nunca deixe entrada CMOS solta: ligue em VDD ou GND"],
];

export const SIM_NOTES = [
  "Alimentação (VCC e GND) é implícita: não existem portas de alimentação no bloco.",
  "Sem atraso de propagação: a saída muda no mesmo instante da entrada. Os tempos de setup e hold não são checados.",
  "Nível alto é um sinal maior ou igual a 0,5. As saídas valem 0 ou 1.",
];
