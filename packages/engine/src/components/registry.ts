// Registro de componentes. Cada componente é um dado: portas, parâmetros com unidade e limites,
// equação documentada e hipóteses. O editor lê a definição para montar o painel de propriedades.

import type { ComponentInstance, ParamDef, ParamValue, PortDef } from "../types";

export interface ParamReader {
  num(key: string): number;
  bool(key: string): boolean;
  str(key: string): string;
  /** Contador que cresce a cada mudança de parâmetro. Serve para invalidar caches. */
  rev(): number;
}

/**
 * Parte discreta de um bloco: o estado muda só em eventos (cruzamento de limiar de uma guarda).
 * Os estados discretos ficam no vetor x do bloco, com derivada zero.
 */
export interface BlockDiscrete {
  nGuards: number;
  /** g[i] >= 0 significa nível alto. u são as entradas (0 quando sem fio). */
  guards(t: number, x: Float64Array, o: number, u: number[], g: number[]): void;
  /** prev e next têm 0/1 por guarda. Altera x[o + i] no lugar. init: instante inicial, todas as saídas são recalculadas. */
  fire(t: number, x: Float64Array, o: number, u: number[], prev: number[], next: number[], init: boolean): void;
}

/** Implementação numérica de um bloco de sinal (causal). */
export interface BlockImpl {
  nStates: number;
  x0(): number[];
  /** A saída depende da entrada no mesmo instante? Decide a ordem de cálculo e os laços algébricos. */
  feedthrough: boolean;
  /** Escreve as saídas em y. u são as entradas, x o vetor global de estados, o o início dos estados deste bloco. */
  out(t: number, x: Float64Array, o: number, u: number[], y: number[]): void;
  /** Escreve as derivadas em dx[o + i]. */
  der(t: number, x: Float64Array, o: number, u: number[], dx: Float64Array): void;
  /** Instantes de descontinuidade dentro de (t0, tf). */
  breakpoints?(t0: number, tf: number): number[];
  /** Menor escala de tempo característica, para limitar o passo. */
  minTimescale?(): number;
  /** Eventos discretos. A saída deve depender só do estado (feedthrough falso). */
  discrete?: BlockDiscrete;
}

export type CategoryId = "sources" | "math" | "control" | "nonlinear" | "sinks" | "process" | "business" | "notes" | "mech" | "rot" | "elec" | "electromech" | "dgate" | "dseq" | "semi";

export interface ComponentDef {
  type: string;
  label: string;
  category: CategoryId;
  description: string;
  /** Equação do modelo em texto simples. */
  model: string;
  hypotheses: string[];
  ports: PortDef[] | ((p: ParamReader) => PortDef[]);
  params: ParamDef[];
  /** Símbolo usado pelo editor. */
  symbol: string;
  /** Bloco de sinal. */
  block?: (p: ParamReader, id: string) => BlockImpl;
  /** Elemento físico. O tipo diz qual montador do motor trata o componente. */
  physical?: { kind: string };
  /** Valor padrão do rótulo. */
  labelPrefix: string;
}

export const CATEGORIES: { id: CategoryId; label: string; available: boolean }[] = [
  { id: "sources", label: "Fontes de sinal", available: true },
  { id: "math", label: "Operadores", available: true },
  { id: "control", label: "Controle", available: true },
  { id: "nonlinear", label: "Não linearidades", available: true },
  { id: "sinks", label: "Saídas e medição", available: true },
  { id: "process", label: "Processos industriais", available: true },
  { id: "business", label: "Empresarial", available: true },
  { id: "notes", label: "Anotações", available: true },
  { id: "mech", label: "Mecânico, translação", available: true },
  { id: "rot", label: "Mecânico, rotação", available: true },
  { id: "elec", label: "Elétrico", available: true },
  { id: "electromech", label: "Eletromecânico", available: true },
  { id: "semi", label: "Semicondutores e amplificadores", available: true },
  { id: "dgate", label: "Digital: portas e lógica", available: true },
  { id: "dseq", label: "Digital: sequenciais e CIs", available: true },
];

const registry = new Map<string, ComponentDef>();

export function registerComponent(def: ComponentDef): void {
  if (registry.has(def.type)) throw new Error(`Componente duplicado: ${def.type}`);
  registry.set(def.type, def);
}

export function getDef(type: string): ComponentDef | undefined {
  return registry.get(type);
}

export function allDefs(): ComponentDef[] {
  return [...registry.values()];
}

/** Lê os parâmetros de uma instância, usando o valor padrão quando faltar. */
export function makeReader(def: ComponentDef, params: Record<string, ParamValue>, revGetter: () => number): ParamReader {
  const defs = new Map(def.params.map((p) => [p.key, p]));
  const raw = (key: string) => {
    const v = params[key]?.value;
    if (v !== undefined) return v;
    const d = defs.get(key);
    if (!d) throw new Error(`Parâmetro desconhecido: ${def.type}.${key}`);
    return d.default;
  };
  return {
    num: (k) => Number(raw(k)),
    bool: (k) => Boolean(raw(k)),
    str: (k) => String(raw(k)),
    rev: revGetter,
  };
}

export function portsOf(def: ComponentDef, params: Record<string, ParamValue>): PortDef[] {
  if (typeof def.ports !== "function") return def.ports;
  return def.ports(makeReader(def, params, () => 0));
}

/** Parâmetros padrão de um tipo, no formato do arquivo do projeto. */
export function defaultParams(type: string): Record<string, ParamValue> {
  const def = getDef(type);
  if (!def) return {};
  const out: Record<string, ParamValue> = {};
  for (const p of def.params) {
    out[p.key] = { value: p.default, unit: p.unit, origin: "illustrative" };
  }
  return out;
}

export function newComponent(type: string, id: string, label?: string): ComponentInstance {
  const def = getDef(type);
  return {
    id,
    type,
    typeVersion: 1,
    label: label ?? def?.labelPrefix ?? type,
    params: defaultParams(type),
  };
}

/** Converte texto "1 2, 3" em lista de números. Lança Error com mensagem em português. */
export function parseNumberList(text: string, what: string): number[] {
  const parts = text
    .replace(/[\[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter((s) => s.length > 0);
  if (parts.length === 0) throw new Error(`${what}: informe ao menos um número.`);
  return parts.map((s) => {
    const v = Number(s.replace(",", "."));
    if (!Number.isFinite(v)) throw new Error(`${what}: "${s}" não é um número.`);
    return v;
  });
}

/** Converte "0 1; -2 -3" em matriz (linhas separadas por ponto e vírgula ou quebra de linha). */
export function parseMatrix(text: string, what: string): number[][] {
  const rows = text
    .split(/;|\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (rows.length === 0) throw new Error(`${what}: matriz vazia.`);
  const m = rows.map((r) => parseNumberList(r.replace(/,/g, " "), what));
  const w = m[0].length;
  if (m.some((r) => r.length !== w)) throw new Error(`${what}: as linhas têm tamanhos diferentes.`);
  return m;
}
