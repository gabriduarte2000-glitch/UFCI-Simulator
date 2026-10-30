// Tipos centrais do UFCI Simulator.
// O arquivo do projeto (ProjectIR) é o único contrato entre o editor e o motor.

export const SCHEMA_VERSION = "1.0.0";

/** Tipo de grandeza que passa por uma porta. */
export type Domain = "signal" | "mech" | "rot" | "elec";

/** in/out: sinal com direção. phys: conexão física, sem direção. */
export type PortDir = "in" | "out" | "phys";

export interface PortDef {
  name: string;
  label: string;
  domain: Domain;
  dir: PortDir;
  /** Entrada que pode ficar sem fio. */
  optional?: boolean;
  /** Unidade da grandeza que passa pela porta (exibida em tabelas e instrumentos). */
  unit?: string;
  /** Rótulo curto mostrado no símbolo, ao lado da porta. */
  short?: string;
}

export type ParamKind = "number" | "int" | "bool" | "select" | "text";
export type ParamGroup = "basic" | "initial" | "advanced";
export type ParamOrigin = "illustrative" | "estimated" | "documented";

export interface ParamDef {
  key: string;
  label: string;
  unit?: string;
  kind: ParamKind;
  default: number | boolean | string;
  min?: number;
  max?: number;
  /** Só para kind "select". */
  options?: { value: string; label: string }[];
  group?: ParamGroup;
  hint?: string;
  /** Mudar este parâmetro altera as portas ou a ordem do sistema: exige reiniciar. */
  structural?: boolean;
  /** Valor só vale ao reiniciar (condição inicial). */
  initialOnly?: boolean;
  /** Intervalo do controle deslizante no editor. */
  slider?: { min: number; max: number; step?: number };
}

export interface ParamValue {
  value: number | boolean | string;
  unit?: string;
  origin?: ParamOrigin;
}

export interface ComponentInstance {
  id: string;
  type: string;
  typeVersion?: number;
  label?: string;
  params: Record<string, ParamValue>;
}

export interface Connection {
  id: string;
  from: { component: string; port: string };
  to: { component: string; port: string };
}

export type SolverId = "rk4" | "rk45" | "euler";

export interface SimConfig {
  solver: SolverId;
  t0: number;
  tf: number;
  /** Passo fixo (rk4, euler) e passo máximo sugerido (rk45), em s. */
  h: number;
  rtol: number;
  atol: number;
  /** Passo máximo para o rk45. Se ausente, o motor escolhe. */
  maxStep?: number;
  /** Unidade de tempo mostrada na interface. Não altera o cálculo. */
  timeUnit?: "s" | "min" | "h" | "dia";
}

export interface ProjectIR {
  schemaVersion: string;
  meta: { name: string; createdAt?: string; updatedAt?: string };
  components: ComponentInstance[];
  connections: Connection[];
  simulation: SimConfig;
  /** Posições na tela. Fica separado da parte matemática. */
  layout?: { positions: Record<string, { x: number; y: number }> };
}

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  code: string;
  /** Texto em português simples. */
  message: string;
  /** Detalhe técnico, mostrado em área expansível. */
  detail?: string;
  componentIds?: string[];
  connectionIds?: string[];
}

/** Descreve um sinal registrado pelo motor. */
export interface SignalMeta {
  id: string;
  componentId: string | null;
  label: string;
  unit: string;
  kind: "port" | "observable";
}

export interface ChangeEvent {
  t: number;
  kind: "param" | "reset" | "info";
  componentId?: string;
  key?: string;
  from?: number | boolean | string;
  to?: number | boolean | string;
  note?: string;
}
