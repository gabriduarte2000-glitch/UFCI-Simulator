// Tipos internos compartilhados entre o compilador e os montadores de domínio.

import type { ComponentDef, ParamReader } from "./components/registry";
import type { ComponentInstance, Diagnostic, Domain, PortDef, SignalMeta } from "./types";

/** Unidade de cálculo: um bloco, ou um conjunto físico conectado. */
export interface Unit {
  id: string;
  compIds: string[];
  nStates: number;
  /** Início dos estados desta unidade no vetor global. Definido pelo compilador. */
  off: number;
  /** Índices em sig dos sinais de entrada. -1 indica entrada sem fio. */
  inputIdx: number[];
  /** Índices em sig de tudo que esta unidade escreve (saídas e observáveis). */
  producedIdx: number[];
  /** Alguma saída depende de alguma entrada no mesmo instante? */
  feedthrough: boolean;
  x0(): number[];
  /** Calcula saídas e observáveis a partir de t, estados e (se feedthrough) entradas. */
  evalOut(t: number, x: Float64Array, sig: Float64Array): void;
  /** Calcula derivadas dos estados desta unidade. Todos os sinais já estão em sig. */
  evalDer(t: number, x: Float64Array, sig: Float64Array, dx: Float64Array): void;
  breakpoints?(t0: number, tf: number): number[];
  minTimescale?(): number;
  /**
   * Eventos discretos (lógica digital, comparador com histerese, chaves). Os estados discretos ficam
   * no vetor x com derivada zero; só mudam em `fire`. Cada guarda g vale "nível alto" quando g >= 0.
   */
  nGuards?: number;
  /** Início das guardas desta unidade no vetor global. Definido pelo compilador. */
  guardOff?: number;
  guards?(t: number, x: Float64Array, sig: Float64Array, g: Float64Array): void;
  /** Aplica as transições. prev e next são os níveis (0/1) antes e depois, no vetor global. init: ajuste do instante inicial. */
  fire?(t: number, x: Float64Array, sig: Float64Array, prev: Uint8Array, next: Uint8Array, init: boolean): void;
  /**
   * Relê os parâmetros depois de uma mudança ao vivo.
   * Retorna "reset" se a mudança altera o número de estados ou a estrutura.
   */
  refresh?(compId: string): "ok" | "reset" | { error: string };
}

export interface CompInfo {
  inst: ComponentInstance;
  def: ComponentDef;
  reader: ParamReader;
  ports: PortDef[];
}

/** O que o montador físico enxerga do compilador. */
export interface PhysCtx {
  comps: CompInfo[];
  /** Rede (nó) à qual a porta física pertence. */
  netOf(compId: string, port: string): number | undefined;
  netDomain(net: number): Domain;
  nNets: number;
  /** Aloca um sinal observável novo e devolve o índice em sig. */
  alloc(meta: SignalMeta): number;
  /** Índice do sinal que alimenta uma entrada de sinal, ou -1. */
  sigIn(compId: string, port: string): number;
  /** Índice do sinal de uma porta de saída de sinal. */
  sigOut(compId: string, port: string): number;
  setUnit(sigIdx: number, unit: string): void;
  diag(d: Diagnostic): void;
}

export interface PhysBuild {
  units: Unit[];
  /** Sinal observável da variável entre pontos de cada rede (velocidade, tensão). */
  netSignal: Map<number, number>;
}
