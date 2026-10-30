// Visão matemática: gera, a partir do projeto, as equações do modelo em ordem de dedução.
//   1. leis de cada elemento;  2. conexões (nós) e leis de Kirchhoff;  3. equações nodais e matriz de admitâncias;
//   4. equações dos blocos de sinal;  5. espaço de estados numérico (A, B, C, D);
//   6. função de transferência e equação diferencial entrada-saída;  7. polos, zeros e resposta ao degrau;
//   8. parâmetros de pequenos sinais dos semicondutores no ponto de operação.
// As partes simbólicas (leis dos elementos, KCL, matriz de admitâncias) usam os símbolos do projeto.
// A redução final (espaço de estados, função de transferência) é numérica, por linearização no ponto de operação.

import "./components";
import { getDef, portsOf } from "./components/registry";
import { cabs, carg, cdiv, cmul, cleanRoots, csolve, csub, eigvals, polyEvalC, polyFromRoots, polyRoots, type Cx, type Mat } from "./eig";
import { bjt, mosfet, diode, VT, type BjtOut } from "./devices";
import { Simulation } from "./simulation";
import type { CompiledModel } from "./compile";
import type { ComponentInstance, Domain, PortDef, ProjectIR } from "./types";

// ------------------------------------------------------------------------------------------------ tipos

export type MathBlock =
  | { kind: "text"; text: string }
  | { kind: "tex"; tex: string; caption?: string }
  | { kind: "table"; head: string[]; rows: (string | { tex: string })[][] }
  | { kind: "note"; text: string };

export interface MathSection {
  id: string;
  title: string;
  lead?: string;
  blocks: MathBlock[];
}

export interface MathChoice {
  id: string;
  label: string;
}

export interface MathReport {
  ok: boolean;
  error?: string;
  sections: MathSection[];
  inputs: MathChoice[];
  outputs: MathChoice[];
  input?: string;
  output?: string;
  /** Ordem do sistema linearizado (estados dinâmicos). */
  order: number;
  stable?: boolean;
  /** G(s) = num/den em potências decrescentes de s, depois do cancelamento polo-zero. */
  tf?: { num: number[]; den: number[] };
}

export interface MathOptions {
  /** Id do sinal de entrada (saída de uma fonte). */
  input?: string;
  /** Id do sinal de saída. */
  output?: string;
}

// ------------------------------------------------------------------------------------------------ formatação

const trim = (v: number, d = 4) => String(+v.toPrecision(d)).replace(".", "{,}");

/** Número em TeX, com vírgula decimal e notação científica quando preciso. */
export function tn(v: number, d = 4): string {
  if (!Number.isFinite(v)) return "?";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    let m = v / Math.pow(10, e);
    if (Math.abs(m) >= 9.9995) m /= 10;
    return `${trim(+m.toPrecision(d), d)}\\times 10^{${a >= 1e5 || a < 1e-3 ? e : 0}}`;
  }
  return trim(v, d);
}
/** Número com sinal explícito, para somas. */
const tnSigned = (v: number) => (v < 0 ? `-${tn(-v)}` : `+${tn(v)}`);

const GREEK: Record<string, string> = { tau: "\\tau", lam: "\\lambda", rho: "\\rho", th: "\\theta", w: "\\omega", bf: "\\beta_F", br: "\\beta_R", Vth: "V_{th}", VA: "V_A", Is: "I_s", Tamb: "T_{amb}", Tin: "T_{in}", Tf: "T_f", kout: "k_{out}", UA: "UA", t_step: "t_{deg}", t_start: "t_0", A0: "A_0", vpos: "V_{+}", vneg: "V_{-}", vcc: "V_{cc}", Vz: "V_z", Ron: "R_{on}", Roff: "R_{off}", Ra: "R_a", La: "L_a", x0: "y_0" };

const escTex = (s: string) => s.replace(/[\\{}#%&$~^_]/g, (c) => ({ "\\": "\\textbackslash ", "~": "\\textasciitilde ", "^": "\\textasciicircum " } as Record<string, string>)[c] ?? `\\${c}`);

function shortName(c: ComponentInstance): string {
  const def = getDef(c.type);
  const raw = c.label ?? def?.label ?? c.id;
  return raw.length > 10 || /[()·/]/.test(raw) ? c.id : raw;
}
/** Subscrito TeX do componente. */
const sub = (c: ComponentInstance) => `\\text{${escTex(shortName(c))}}`;

/** Símbolo de um parâmetro do componente: K_{Ganho}. */
const psym = (c: ComponentInstance, key: string) => {
  const base = GREEK[key] ?? (key.length > 1 ? `\\mathrm{${key}}` : key);
  return `${base.includes("_") ? `{${base}}` : base}_{${sub(c)}}`;
};

function pnum(c: ComponentInstance, key: string): number {
  const v = c.params[key]?.value;
  return typeof v === "number" ? v : NaN;
}

// ------------------------------------------------------------------------------------------------ leis dos elementos

type LawFn = (c: ComponentInstance) => string[];
const P = (c: ComponentInstance, k: string) => psym(c, k);
const R = String.raw;

const LAWS: Record<string, LawFn> = {
  "signal.constant": (c) => [R`y = ${P(c, "value")}`],
  "signal.manual": (c) => [R`y = ${P(c, "value")}\quad\text{(ajustável)}`],
  "signal.step": (c) => [R`y(t)=\begin{cases}${P(c, "v0")}, & t<${P(c, "t_step")}\\ ${P(c, "v1")}, & t\ge ${P(c, "t_step")}\end{cases}`],
  "signal.ramp": (c) => [R`y(t)=${P(c, "v0")}+${P(c, "slope")}\,\max(0,\;t-${P(c, "t_start")})`],
  "signal.sine": (c) => [R`y(t)=${P(c, "amp")}\,\sin\!\left(2\pi\,${P(c, "freq")}\,t+${P(c, "phase")}\right)+${P(c, "offset")}`],
  "signal.pulse": (c) => [R`y(t)=\begin{cases}${P(c, "hi")}, & \text{na fração }${P(c, "duty")}\%\text{ do período }${P(c, "period")}\\ ${P(c, "lo")}, & \text{no resto}\end{cases}`],
  "math.sum": (c) => {
    const s = String(c.params.signs?.value ?? "+-");
    return [R`y=${[...s].map((ch, i) => `${ch === "-" ? "-" : i ? "+" : ""}u_{${i + 1}}`).join("")}`];
  },
  "math.gain": (c) => [R`y=${P(c, "K")}\,u`],
  "math.integrator": (c) => [R`y(t)=${P(c, "x0")}+\int_{t_0}^{t}u(\tau)\,d\tau\qquad\Longleftrightarrow\qquad \dot y=u`],
  "math.derivative": (c) => [R`\frac{Y(s)}{U(s)}=\frac{${P(c, "N")}\,s}{s+${P(c, "N")}}`],
  "math.abs": () => [R`y=|u|`],
  "math.sqrt": () => [R`y=\sqrt{\max(0,u)}`],
  "math.product": () => [R`y=\dfrac{u_1\,u_2}{u_3}\quad\text{(conforme as operações)}`],
  "control.tf": (c) => [R`G(s)=\frac{${polyTexText(String(c.params.num?.value ?? "1"))}}{${polyTexText(String(c.params.den?.value ?? "1 1"))}}`],
  "control.ss": () => [R`\dot{\mathbf{x}}=\mathbf{A}\mathbf{x}+\mathbf{B}u,\qquad y=\mathbf{C}\mathbf{x}+\mathbf{D}u`],
  "control.pid": (c) => [R`C(s)=${P(c, "Kp")}+\frac{${P(c, "Ki")}}{s}+\frac{${P(c, "Kd")}\,${P(c, "N")}\,s}{s+${P(c, "N")}}`],
  "control.lag": (c) => [R`${P(c, "tau")}\,\dot y+y=${P(c, "K")}\,u`],
  "control.deadtime": (c) => [R`y(t)=u(t-${P(c, "T")})\quad\text{(Padé de ordem ${pnum(c, "n")})}`],
  "nonlinear.saturation": (c) => [R`y=\min\!\big(${P(c, "hi")},\,\max(${P(c, "lo")},\,u)\big)`],
  "nonlinear.deadzone": (c) => [R`y=\begin{cases}u-${P(c, "hi")}, & u>${P(c, "hi")}\\ 0, & ${P(c, "lo")}\le u\le ${P(c, "hi")}\\ u-${P(c, "lo")}, & u<${P(c, "lo")}\end{cases}`],
  "nonlinear.integrator_lim": (c) => [R`\dot x=u,\qquad ${P(c, "lo")}\le x\le ${P(c, "hi")}`],
  "process.tank": (c) => [R`${P(c, "A")}\,\frac{dh}{dt}=q_{in}-${P(c, "kout")}\sqrt{h}-q_{ext}`],
  "process.valve": (c) => [R`\tau\,\dot p+p=\text{cmd},\qquad q=Q_{max}\,f(p/100)`],
  "process.pump": () => [R`\tau\,\dot n+n=\text{cmd},\qquad q=Q_{max}\,\frac{n}{100}`],
  "process.heater": () => [R`\tau\,\dot n+n=\text{cmd},\qquad P=P_{max}\,\frac{n}{100}`],
  "process.heated_tank": (c) => [R`\rho c_p\,${P(c, "V")}\,\dot T=\rho c_p\,F\,(T_{in}-T)+P-${P(c, "UA")}\,(T-${P(c, "Tamb")})`],
  "process.boiler": () => [R`m\,c_p\,\dot T=P+\dot m\,c_p\,(T_f-T)-UA\,(T-T_{amb})`, R`\dot m_{tanque}=\dot m_{água}-\dot m_{vapor}`],
  "mech.mass": (c) => [R`${P(c, "m")}\,\dot v=\sum F,\qquad \dot x=v`],
  "mech.spring": (c) => [R`F=${P(c, "k")}\,(x_b-x_a)`],
  "mech.damper": (c) => [R`F=${P(c, "c")}\,(v_b-v_a)`],
  "mech.force": () => [R`F=u(t)`],
  "mech.velocity": () => [R`v=u(t)`],
  "mech.rack": (c) => [R`v=${P(c, "r")}\,\omega,\qquad F=\tau/${P(c, "r")}`],
  "rot.inertia": (c) => [R`${P(c, "J")}\,\dot\omega=\sum\tau,\qquad \dot\theta=\omega`],
  "rot.spring": (c) => [R`\tau=${P(c, "k")}\,(\theta_b-\theta_a)`],
  "rot.damper": (c) => [R`\tau=${P(c, "b")}\,(\omega_b-\omega_a)`],
  "rot.torque": () => [R`\tau=u(t)`],
  "rot.speed": () => [R`\omega=u(t)`],
  "rot.gear": (c) => [R`\omega_b=\omega_a/${P(c, "N")},\qquad \tau_b=${P(c, "N")}\,\tau_a`],
  "elec.resistor": (c) => [R`v_a-v_b=${P(c, "R")}\,i`],
  "elec.capacitor": (c) => [R`i=${P(c, "C")}\,\frac{d(v_a-v_b)}{dt}`],
  "elec.inductor": (c) => [R`v_a-v_b=${P(c, "L")}\,\frac{di}{dt}`],
  "elec.vsource": () => [R`v_p-v_n=u(t)`],
  "elec.isource": () => [R`i=u(t)`],
  "elec.voltmeter": () => [R`v=v_a-v_b\quad\text{(corrente nula)}`],
  "electromech.motor": (c) => [R`${P(c, "La")}\,\frac{di}{dt}=v-${P(c, "Ra")}\,i-${P(c, "K")}\,\omega`, R`${P(c, "J")}\,\dot\omega=${P(c, "K")}\,i-${P(c, "b")}\,\omega-\tau_{carga}`],
  "elec.diode": (c) => [R`i=${P(c, "Is")}\left(e^{v/(${P(c, "n")}V_T)}-1\right)`],
  "elec.led": (c) => [R`i=${P(c, "Is")}\left(e^{v/(${P(c, "n")}V_T)}-1\right)`],
  "elec.zener": (c) => [R`i=${P(c, "Is")}\left(e^{v/(${P(c, "n")}V_T)}-1\right)-I_{zt}\,e^{-(v+${P(c, "Vz")})/V_T}`],
  "elec.npn": (c) => [
    R`i_C=${P(c, "Is")}\left(e^{v_{BE}/V_T}-e^{v_{BC}/V_T}\right)\left(1+\frac{v_{CE}}{${P(c, "VA")}}\right)-\frac{${P(c, "Is")}}{${P(c, "br")}}\left(e^{v_{BC}/V_T}-1\right)`,
    R`i_B=\frac{${P(c, "Is")}}{${P(c, "bf")}}\left(e^{v_{BE}/V_T}-1\right)+\frac{${P(c, "Is")}}{${P(c, "br")}}\left(e^{v_{BC}/V_T}-1\right),\qquad i_E=-(i_C+i_B)`,
  ],
  "elec.pnp": (c) => (LAWS["elec.npn"](c) as string[]).concat([R`\text{(PNP: tensões e correntes com sinal invertido)}`]),
  "elec.nmos": (c) => [R`i_D=\begin{cases}0, & v_{GS}\le ${P(c, "Vth")}\\ ${P(c, "K")}\left[(v_{GS}-${P(c, "Vth")})v_{DS}-\tfrac{v_{DS}^2}{2}\right](1+${P(c, "lam")}v_{DS}), & v_{DS}<v_{GS}-${P(c, "Vth")}\\ \tfrac{${P(c, "K")}}{2}(v_{GS}-${P(c, "Vth")})^2(1+${P(c, "lam")}v_{DS}), & \text{saturação}\end{cases}`],
  "elec.pmos": (c) => (LAWS["elec.nmos"](c) as string[]).concat([R`\text{(canal P: tensões e correntes com sinal invertido)}`]),
  "elec.opamp": (c) => [R`v_o=V_m+V_s\,g\!\left(\frac{${P(c, "A0")}\,(v_+-v_-)}{V_s}\right),\qquad g(u)=\frac{u}{(1+|u|^8)^{1/8}}`, R`V_m=\frac{${P(c, "vpos")}+${P(c, "vneg")}}{2},\quad V_s=\frac{${P(c, "vpos")}-${P(c, "vneg")}}{2}`],
  "elec.switch": (c) => [R`R=\begin{cases}${P(c, "Ron")}, & u\ge 0{,}5\\ ${P(c, "Roff")}, & u<0{,}5\end{cases}`],
  "dig.comparator": (c) => [R`y=\begin{cases}1,& u\ge ${P(c, "th")}+${P(c, "hyst")}/2\\ 0,& u\le ${P(c, "th")}-${P(c, "hyst")}/2\\ y^-,& \text{entre os dois (mantém)}\end{cases}`],
};

/** Polinômio em s a partir de "1 3 2": s^2 + 3s + 2. */
function polyTexText(text: string): string {
  const v = text
    .replace(/[\[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => Number(s.replace(",", ".")));
  if (!v.length || v.some((x) => !Number.isFinite(x))) return "?";
  return polyTex(v, "s");
}

/** Polinômio (maior potência primeiro) em TeX. */
export function polyTex(coef: number[], v = "s", d = 4): string {
  const n = coef.length - 1;
  const mx = Math.max(...coef.map(Math.abs), 0);
  let out = "";
  coef.forEach((c, i) => {
    if (Math.abs(c) <= 1e-12 * mx || c === 0) return;
    const pw = n - i;
    const a = Math.abs(c);
    const sgn = c < 0 ? "-" : out ? "+" : "";
    const coefTex = pw > 0 && Math.abs(a - 1) < 1e-9 ? "" : tn(a, d);
    const vt = pw === 0 ? "" : pw === 1 ? v : `${v}^{${pw}}`;
    out += `${sgn}${coefTex}${coefTex && vt ? "\\," : ""}${vt}`;
  });
  return out || "0";
}

// ------------------------------------------------------------------------------------------------ redes

interface Net {
  id: number;
  domain: Domain;
  ground: boolean;
  members: { c: ComponentInstance; port: string }[];
  /** Símbolo da variável de esforço (tensão, velocidade). */
  sym: string;
}

const KIND = (c: ComponentInstance) => getDef(c.type)?.physical?.kind;

function buildNets(ir: ProjectIR): { nets: Net[]; netOf: Map<string, number> } {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = a;
    while (parent.get(x) !== r) {
      const nx = parent.get(x)!;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  const byId = new Map(ir.components.map((c) => [c.id, c]));
  const portsByComp = new Map<string, PortDef[]>();
  for (const c of ir.components) {
    const def = getDef(c.type);
    if (!def?.physical) continue;
    const ports = portsOf(def, c.params).filter((p) => p.dir === "phys");
    portsByComp.set(c.id, ports);
    const byNode = new Map<string, string>();
    for (const p of ports) {
      const key = `${c.id}.${p.name}`;
      if (!parent.has(key)) parent.set(key, key);
      if (p.node) {
        const k = byNode.get(p.node);
        if (k) union(k, key);
        else byNode.set(p.node, key);
      }
    }
  }
  for (const w of ir.connections) {
    const pa = portsByComp.get(w.from.component)?.find((p) => p.name === w.from.port);
    const pb = portsByComp.get(w.to.component)?.find((p) => p.name === w.to.port);
    if (pa && pb) union(`${w.from.component}.${w.from.port}`, `${w.to.component}.${w.to.port}`);
  }
  const roots = new Map<string, Net>();
  const nets: Net[] = [];
  const netOf = new Map<string, number>();
  for (const [cid, ports] of portsByComp) {
    const c = byId.get(cid)!;
    for (const p of ports) {
      const r = find(`${cid}.${p.name}`);
      let n = roots.get(r);
      if (!n) {
        n = { id: nets.length, domain: p.domain, ground: false, members: [], sym: "" };
        roots.set(r, n);
        nets.push(n);
      }
      n.members.push({ c, port: p.name });
      if (KIND(c) === "gnd") n.ground = true;
      netOf.set(`${cid}.${p.name}`, n.id);
    }
  }
  const count: Record<string, number> = {};
  for (const n of nets) {
    if (n.ground) {
      n.sym = n.domain === "rot" ? "\\omega_{0}" : "v_{0}";
      continue;
    }
    count[n.domain] = (count[n.domain] ?? 0) + 1;
    n.sym = n.domain === "rot" ? `\\omega_{${count[n.domain]}}` : `v_{${count[n.domain]}}`;
  }
  return { nets, netOf };
}

const DOM_NAME: Record<Domain, string> = { elec: "elétrico", mech: "de translação", rot: "de rotação", signal: "de sinal" };

// ------------------------------------------------------------------------------------------------ KCL e nodal

interface Elem {
  c: ComponentInstance;
  kind: string;
  a?: number;
  b?: number;
  /** Termo (corrente que sai do nó a, em direção ao nó b). */
  term: string;
  adm?: string;
}

function nodalSections(ir: ProjectIR, nets: Net[], netOf: Map<string, number>): MathSection[] {
  const sections: MathSection[] = [];
  const phys = ir.components.filter((c) => getDef(c.type)?.physical && KIND(c) !== "gnd");
  if (!nets.length || !phys.length) return sections;
  const free = nets.filter((n) => !n.ground);

  // --- incidência
  const head = ["Componente", ...nets.map((n) => (n.ground ? "Referência (0)" : `Nó ${n.sym.replace(/[^0-9]/g, "")}`))];
  const rows: string[][] = phys.map((c) => {
    const row = [shortName(c) + ` (${getDef(c.type)?.label ?? c.type})`];
    for (const n of nets) {
      const ps = n.members.filter((m) => m.c.id === c.id).map((m) => m.port);
      row.push(ps.length ? ps.join(", ") : "·");
    }
    return row;
  });
  const dom = [...new Set(nets.map((n) => n.domain))].map((d) => DOM_NAME[d]).join(" e ");
  sections.push({
    id: "conexoes",
    title: "Conexões e nós",
    lead: `Cada fio une portas físicas no mesmo nó. O sistema ${dom} tem ${free.length} nó(s) livre(s) e um nó de referência. A tabela mostra em qual nó cada porta está ligada.`,
    blocks: [
      { kind: "table", head, rows },
      {
        kind: "tex",
        tex: free.map((n) => n.sym).join(",\\;") + (free.length ? "\\quad\\text{são as variáveis de nó (tensão ou velocidade em relação à referência)}" : ""),
      },
    ],
  });

  // --- elementos
  const elems: Elem[] = [];
  const extraLaws: string[] = [];
  const rhs = new Map<number, string[]>();
  const addRhs = (net: number | undefined, t: string) => {
    if (net === undefined) return;
    if (!rhs.has(net)) rhs.set(net, []);
    rhs.get(net)!.push(t);
  };
  const vs: { c: ComponentInstance; p: number; n: number; idx: number }[] = [];
  const nid = (c: ComponentInstance, port: string) => netOf.get(`${c.id}.${port}`);
  const v = (n: number | undefined) => (n === undefined ? "?" : nets[n].sym);
  const dv = (a: number | undefined, b: number | undefined) => `(${v(a)}-${v(b)})`;

  for (const c of phys) {
    const k = KIND(c);
    const a = nid(c, "a"),
      b = nid(c, "b");
    const t = c.type;
    const el = (term: string, adm: string): Elem => ({ c, kind: k ?? "", a, b, term, adm });
    if (k === "res") {
      const key = t === "elec.resistor" ? "R" : t === "mech.damper" ? "c" : "b";
      const sym = psym(c, key);
      elems.push(el(t === "elec.resistor" ? `\\frac{${dv(a, b)}}{${sym}}` : `${sym}${dv(a, b)}`, t === "elec.resistor" ? `\\frac{1}{${sym}}` : sym));
    } else if (k === "cap2") {
      const sym = psym(c, "C");
      elems.push(el(`${sym}\\,\\frac{d}{dt}${dv(a, b)}`, `s${sym}`));
    } else if (k === "cap1") {
      const sym = psym(c, t === "mech.mass" ? "m" : "J");
      elems.push({ c, kind: k, a, term: `${sym}\\,\\dot{${v(a)}}`, adm: `s${sym}` });
    } else if (k === "ind") {
      const isL = t === "elec.inductor";
      const sym = psym(c, isL ? "L" : "k");
      const name = isL ? `i_{${sub(c)}}` : `F_{${sub(c)}}`;
      elems.push(el(name, isL ? `\\frac{1}{s${sym}}` : `\\frac{${sym}}{s}`));
      extraLaws.push(isL ? `${sym}\\,\\dot{${name}}=${dv(a, b)}` : `\\dot{${name}}=${sym}${dv(a, b)}`);
    } else if (k === "vsrc") {
      const p = nid(c, t === "elec.vsource" ? "p" : "a"),
        n = nid(c, t === "elec.vsource" ? "n" : "b");
      const idx = vs.length;
      vs.push({ c, p: p ?? 0, n: n ?? 0, idx });
      elems.push({ c, kind: k, a: p, b: n, term: `i_{V${vs.length}}` });
      extraLaws.push(`${v(p)}-${v(n)}=u_{${sub(c)}}(t)`);
    } else if (k === "isrc") {
      const p = nid(c, "p") ?? nid(c, "a");
      const n = nid(c, "n") ?? nid(c, "b");
      addRhs(p, `u_{${sub(c)}}`);
      if (n !== undefined) addRhs(n, `-u_{${sub(c)}}`);
      elems.push({ c, kind: k, a: p, b: n, term: "" });
    } else if (k === "vmeter") {
      continue;
    } else {
      // elementos não lineares ou de acoplamento: uma corrente (ou força) incógnita por porta
      const ports = (portsOf(getDef(t)!, c.params).filter((p) => p.dir === "phys") as PortDef[]).map((p) => p.name);
      for (const pn of ports) {
        const nn = nid(c, pn);
        elems.push({ c, kind: k ?? "x", a: nn, term: `i_{${sub(c)},${pn}}` });
      }
    }
  }

  // --- KCL por nó
  const kcl: string[] = [];
  const nodal: string[] = [];
  for (const n of free) {
    const kt: string[] = [];
    const nt: string[] = [];
    for (const e of elems) {
      if (e.kind === "isrc") continue;
      const here = e.a === n.id,
        there = e.b === n.id;
      if (!here && !there) continue;
      if (e.kind === "x" || (e.kind !== "cap1" && e.kind !== "res" && e.kind !== "cap2" && e.kind !== "ind" && e.kind !== "vsrc")) {
        kt.push(e.term);
        nt.push(e.term);
        continue;
      }
      if (e.kind === "cap1") {
        kt.push(e.term);
        nt.push(e.term);
        continue;
      }
      const sign = here ? "+" : "-";
      if (e.kind === "vsrc") {
        kt.push(`${sign}${e.term}`);
        nt.push(`${sign}${e.term}`);
      } else {
        kt.push(`${sign}i_{${sub(e.c)}}`);
        nt.push(`${sign}${e.term}`);
      }
    }
    const fmtSum = (arr: string[]) => (arr.length ? arr.join(" ").replace(/^\+/, "") : "0");
    const r = rhs.get(n.id);
    const right = r?.length ? r.join(" ").replace(/^\+/, "") : "0";
    const word = n.domain === "elec" ? "corrente" : n.domain === "mech" ? "força" : "torque";
    void word;
    kcl.push(`\\textbf{${n.sym.replace(/[^0-9]/g, "") ? "nó " + n.sym.replace(/[^0-9]/g, "") : "nó"}:}\\quad ${fmtSum(kt)} = ${right}`);
    nodal.push(`${fmtSum(nt)} = ${right}`);
  }
  const lawLabels = `Cada elemento de dois terminais tem uma corrente (ou força) i definida do terminal a para o b. Num nó, a soma de tudo que sai é igual ao que as fontes injetam.`;
  sections.push({
    id: "kirchhoff",
    title: "Leis de Kirchhoff nos nós",
    lead: `${lawLabels} Esta é a lei das correntes (KCL), e para sistemas mecânicos é a soma das forças (a analogia força-corrente).`,
    blocks: [
      { kind: "tex", tex: "\\sum_{\\text{elementos no nó}} i_{\\text{sai}} = \\sum i_{\\text{fontes}}", caption: "Forma geral" },
      ...kcl.map((t): MathBlock => ({ kind: "tex", tex: t })),
    ],
  });
  sections.push({
    id: "nodal",
    title: "Equações nodais",
    lead: "Trocando cada corrente pela lei do elemento, sobram equações só nas variáveis de nó. Elementos sem lei simples (transistores, diodos, amp-op) ficam com a corrente como incógnita; a lei deles está em \"Leis dos elementos\".",
    blocks: [
      ...nodal.map((t, i): MathBlock => ({ kind: "tex", tex: `\\text{nó }${i + 1}:\\quad ${t}` })),
      ...(extraLaws.length ? ([{ kind: "text", text: "Equações adicionais dos elementos:" }, ...extraLaws.map((t): MathBlock => ({ kind: "tex", tex: t }))] as MathBlock[]) : []),
    ],
  });

  // --- matriz de admitâncias no domínio de Laplace (só elementos lineares)
  const linear = elems.every((e) => ["res", "cap1", "cap2", "ind", "vsrc", "isrc"].includes(e.kind));
  const N = free.length;
  if (N >= 1 && N <= 7) {
    const idxOf = new Map(free.map((n, i) => [n.id, i]));
    const Y: string[][][] = Array.from({ length: N }, () => Array.from({ length: N }, () => [] as string[]));
    for (const e of elems) {
      if (!e.adm) continue;
      const ia = e.a === undefined ? undefined : idxOf.get(e.a);
      const ib = e.b === undefined ? undefined : idxOf.get(e.b);
      if (ia !== undefined) Y[ia][ia].push(e.adm);
      if (ib !== undefined) Y[ib][ib].push(e.adm);
      if (ia !== undefined && ib !== undefined) {
        Y[ia][ib].push(`-${e.adm}`);
        Y[ib][ia].push(`-${e.adm}`);
      }
    }
    const cell = (l: string[]) => (l.length ? l.map((t, i) => (i === 0 || t.startsWith("-") ? t : `+${t}`)).join("") : "0");
    // MNA: linhas e colunas das fontes de tensão
    const M = N + vs.length;
    const rowsTex: string[] = [];
    for (let i = 0; i < M; i++) {
      const r: string[] = [];
      for (let j = 0; j < M; j++) {
        if (i < N && j < N) r.push(cell(Y[i][j]));
        else if (i < N && j >= N) {
          const s = vs[j - N];
          r.push(idxOf.get(s.p) === i ? "1" : idxOf.get(s.n) === i ? "-1" : "0");
        } else if (i >= N && j < N) {
          const s = vs[i - N];
          r.push(idxOf.get(s.p) === j ? "1" : idxOf.get(s.n) === j ? "-1" : "0");
        } else r.push("0");
      }
      rowsTex.push(r.join(" & "));
    }
    const unknowns = [...free.map((n) => n.sym), ...vs.map((_, i) => `i_{V${i + 1}}`)];
    const rhsT = [...free.map((n) => (rhs.get(n.id)?.length ? rhs.get(n.id)!.join("").replace(/^\+/, "") : "0")), ...vs.map((s) => `u_{${sub(s.c)}}`)];
    const mat = `\\begin{bmatrix}${rowsTex.join("\\\\")}\\end{bmatrix}`;
    const vec = (a: string[]) => `\\begin{bmatrix}${a.join("\\\\")}\\end{bmatrix}`;
    sections.push({
      id: "mna",
      title: "Matriz de admitâncias (análise nodal modificada)",
      lead: linear
        ? "No domínio de Laplace, cada elemento vira uma admitância: R → 1/R, C → sC, L → 1/(sL), massa → sm, mola → k/s, amortecedor → c. As fontes de tensão acrescentam uma linha e uma coluna. O sistema é Y(s)·x = b."
        : "Só os elementos lineares entram nesta matriz. Os não lineares (diodo, transistor, amp-op, chave, 555, motor) aparecem como correntes incógnitas nas equações nodais.",
      blocks: [
        { kind: "tex", tex: `${mat}${vec(unknowns)}=${vec(rhsT)}` },
        { kind: "tex", tex: "\\mathbf{Y}(s)\\,\\mathbf{x}=\\mathbf{b}\\;\\Longrightarrow\\;\\mathbf{x}=\\mathbf{Y}(s)^{-1}\\mathbf{b}", caption: "Solução formal" },
      ],
    });
  }
  return sections;
}

// ------------------------------------------------------------------------------------------------ análise numérica

function matTex(m: number[][], tolRel = 1e-9): string {
  const mx = Math.max(0, ...m.flat().map(Math.abs));
  const rows = m.map((r) => r.map((v) => (Math.abs(v) <= tolRel * mx ? "0" : tn(v, 4))).join(" & "));
  return `\\begin{bmatrix}${rows.join("\\\\")}\\end{bmatrix}`;
}

interface Lin {
  A: Mat;
  B: number[][];
  C: number[][];
  D: number[][];
  keep: number[];
}

function jacobians(model: CompiledModel, t: number, x: Float64Array, inputs: number[], outs: number[]): Lin {
  const n = x.length;
  const m = inputs.length;
  const p = outs.length;
  const xs = Float64Array.from(x);
  const fa = new Float64Array(n),
    fb = new Float64Array(n);
  const readOut = () => {
    const sg = model.evaluate(t, xs);
    return outs.map((i) => sg[i]);
  };
  const full = (A: Mat, B: Mat, C: Mat, D: Mat): Lin => ({ A, B, C, D, keep: [] });
  const A: Mat = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const B: Mat = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  const C: Mat = Array.from({ length: p }, () => new Array<number>(n).fill(0));
  const D: Mat = Array.from({ length: p }, () => new Array<number>(m).fill(0));
  for (let k = 0; k < n; k++) {
    const d = 1e-6 * Math.max(1, Math.abs(x[k]));
    xs[k] = x[k] + d;
    model.f(t, xs, fa);
    const yp = readOut();
    xs[k] = x[k] - d;
    model.f(t, xs, fb);
    const ym = readOut();
    xs[k] = x[k];
    for (let i = 0; i < n; i++) {
      const v = (fa[i] - fb[i]) / (2 * d);
      if (!Number.isFinite(v)) throw new Error("A linearização falhou: o circuito não convergiu perto do ponto de operação.");
      A[i][k] = v;
    }
    for (let i = 0; i < p; i++) C[i][k] = (yp[i] - ym[i]) / (2 * d);
  }
  const base = model.evaluate(t, xs);
  for (let j = 0; j < m; j++) {
    const s = inputs[j];
    const u0 = base[s];
    const d = 1e-6 * Math.max(1, Math.abs(u0));
    const keep = model.overrides.get(s);
    model.overrides.set(s, u0 + d);
    model.f(t, xs, fa);
    const yp = readOut();
    model.overrides.set(s, u0 - d);
    model.f(t, xs, fb);
    const ym = readOut();
    if (keep === undefined) model.overrides.delete(s);
    else model.overrides.set(s, keep);
    for (let i = 0; i < n; i++) B[i][j] = (fa[i] - fb[i]) / (2 * d);
    for (let i = 0; i < p; i++) D[i][j] = (yp[i] - ym[i]) / (2 * d);
  }
  return full(A, B, C, D);
}

/** Resolve (sI − A) x = B para um s complexo e devolve C x + D. */
function gAt(A: Mat, b: number[], c: number[], d: number, s: Cx): Cx | null {
  const n = A.length;
  const M: Cx[][] = A.map((r, i) => r.map((v, j) => [(i === j ? s[0] : 0) - v, i === j ? s[1] : 0] as Cx));
  const x = csolve(M, b.map((v) => [v, 0] as Cx));
  if (!x) return null;
  let acc: Cx = [d, 0];
  for (let i = 0; i < n; i++) acc = [acc[0] + c[i] * x[i][0], acc[1] + c[i] * x[i][1]];
  return acc;
}

const tcx = (z: Cx, d = 4) => (Math.abs(z[1]) < 1e-12 * Math.max(1e-300, Math.abs(z[0])) ? tn(z[0], d) : `${tn(z[0], d)}${tnSigned(z[1])}\\,j`);

// ------------------------------------------------------------------------------------------------ relatório

export function analyzeMath(ir: ProjectIR, opts: MathOptions = {}): MathReport {
  const empty = (error: string): MathReport => ({ ok: false, error, sections: [], inputs: [], outputs: [], order: 0 });
  const sim = new Simulation(ir, { keepSeries: false });
  if (!sim.compiled) {
    const first = sim.diagnostics.find((d) => d.severity === "error");
    return empty(first?.message ?? "O projeto tem erros. Corrija a montagem antes de abrir a visão matemática.");
  }
  const model = sim.model;
  const proj = sim.project;
  const sections: MathSection[] = [];

  // ---- fontes e saídas candidatas
  const units = model.unitInfo();
  const byId = new Map(proj.components.map((c) => [c.id, c]));
  const srcSigs: { sig: number; c: ComponentInstance }[] = [];
  for (const u of units) {
    const c = byId.get(u.compIds[0]);
    if (!c || u.compIds.length !== 1) continue;
    const def = getDef(c.type);
    if (def?.category !== "sources" || u.producedIdx.length < 1) continue;
    srcSigs.push({ sig: u.producedIdx[0], c });
  }
  const srcSet = new Set(srcSigs.map((s) => s.sig));
  const sigIndex = new Map(model.signals.map((s, i) => [s.id, i]));
  const inputsList: MathChoice[] = srcSigs.map((s) => ({ id: model.signals[s.sig].id, label: shortName(s.c) }));
  // saídas: primeiro os sinais ligados a um osciloscópio, depois os demais
  const scopeSigs: number[] = [];
  for (const w of proj.connections) {
    const to = byId.get(w.to.component);
    if (to?.type === "sink.scope") {
      const si = model.edgeSignal[w.id];
      if (si !== null && si !== undefined && !scopeSigs.includes(si)) scopeSigs.push(si);
    }
  }
  const outIdxAll = model.signals.map((_, i) => i).filter((i) => !srcSet.has(i) && model.signals[i].componentId && byId.get(model.signals[i].componentId!)?.type !== "sink.scope");
  const outputsList: MathChoice[] = [...new Set([...scopeSigs, ...outIdxAll])].map((i) => ({ id: model.signals[i].id, label: model.signals[i].label }));

  // ---- ponto de operação: fontes paradas no valor de t0, simula até o fim
  const t0 = proj.simulation.t0;
  const x0 = model.x0();
  const sg0 = model.evaluate(t0, x0);
  const held = new Map<number, number>();
  for (const s of srcSigs) held.set(s.sig, sg0[s.sig]);
  for (const [k, v] of held) model.overrides.set(k, v);
  let opNote = "";
  try {
    sim.advanceTo(proj.simulation.tf);
    if (sim.status === "error") opNote = "A simulação do ponto de operação terminou com erro; a análise usa o estado em que parou.";
  } catch {
    opNote = "A simulação do ponto de operação falhou; a análise usa o estado inicial.";
  }
  const xop = Float64Array.from(sim.x.length === model.nx ? sim.x : x0);
  const tOp = proj.simulation.tf;
  const sgOp = Float64Array.from(model.evaluate(tOp, xop));

  // ---- 1. resumo
  const phys = proj.components.filter((c) => getDef(c.type)?.physical);
  const blocks = proj.components.filter((c) => !getDef(c.type)?.physical && c.type !== "note.text" && c.type !== "sink.scope");
  const nonlin = proj.components.filter((c) => /^elec\.(diode|led|zener|npn|pnp|nmos|pmos|opamp|switch|timer555)$/.test(c.type) || /^nonlinear\./.test(c.type));
  const digital = proj.components.filter((c) => c.type.startsWith("dig.") || c.type === "elec.timer555");
  const summary: MathBlock[] = [
    {
      kind: "table",
      head: ["Item", "Quantidade"],
      rows: [
        ["Componentes físicos (elétricos, mecânicos)", String(phys.length)],
        ["Blocos de sinal (controle, matemática, processo)", String(blocks.length)],
        ["Elementos não lineares", String(nonlin.length)],
        ["Componentes digitais (eventos discretos)", String(digital.length)],
        ["Estados do modelo", String(model.nx)],
      ],
    },
  ];
  if (nonlin.length) summary.push({ kind: "note", text: "Há elementos não lineares. As matrizes A, B, C e D abaixo são a linearização no ponto de operação e valem para pequenas variações em torno dele." });
  if (digital.length) summary.push({ kind: "note", text: "Há lógica digital. Os estados discretos (bits, flip-flops) ficam congelados na linearização; só a parte contínua entra nas matrizes." });
  summary.push({
    kind: "text",
    text: `Ponto de operação: as fontes são mantidas no valor de t = ${tn(t0).replace(/\{,\}/g, ",")} s e o circuito é simulado até t = ${tOp} s. ${opNote}`.trim(),
  });
  sections.push({ id: "resumo", title: "Resumo do modelo", lead: "O que o circuito montado contém e como a análise foi feita.", blocks: summary });

  // ---- 2. leis dos elementos
  const lawBlocks: MathBlock[] = [];
  for (const c of proj.components) {
    const def = getDef(c.type);
    if (!def || c.type === "note.text" || c.type === "sink.scope") continue;
    const lawFn = LAWS[c.type];
    const header = `${shortName(c)}  ·  ${def.label}`;
    lawBlocks.push({ kind: "text", text: header });
    if (lawFn) for (const t of lawFn(c)) lawBlocks.push({ kind: "tex", tex: t });
    else lawBlocks.push({ kind: "note", text: def.model });
    const vals = def.params
      .filter((p) => p.group !== "initial" && p.kind === "number")
      .map((p) => {
        const v = pnum(c, p.key);
        return Number.isFinite(v) ? `${psym(c, p.key)}=${tn(v)}${p.unit ? `\\;\\text{${escTex(p.unit)}}` : ""}` : "";
      })
      .filter(Boolean);
    if (vals.length) lawBlocks.push({ kind: "tex", tex: vals.join(",\\quad "), caption: "Valores" });
  }
  sections.push({ id: "leis", title: "Leis dos elementos", lead: "A equação que cada componente obedece, com os parâmetros do projeto em símbolos e seus valores logo abaixo.", blocks: lawBlocks });

  // ---- 3. redes
  const { nets, netOf } = buildNets(proj);
  sections.push(...nodalSections(proj, nets, netOf));

  // ---- 4. blocos de sinal em ordem de execução
  const sigBlocks: MathBlock[] = [];
  const symOfSig = (i: number) => {
    const s = model.signals[i];
    return `y_{\\text{${escTex(s.label.length > 22 ? s.id : s.label)}}}`;
  };
  for (const u of units) {
    if (u.compIds.length !== 1) continue;
    const c = byId.get(u.compIds[0]);
    if (!c) continue;
    const def = getDef(c.type);
    if (!def || def.physical || c.type === "note.text" || c.type === "sink.scope") continue;
    if (def.category === "sources" && u.inputIdx.length === 0) continue;
    const ports = portsOf(def, c.params);
    const ins = ports.filter((p) => p.dir === "in");
    const outs = ports.filter((p) => p.dir === "out");
    if (!ins.length || !outs.length) continue;
    const inNames = ins.map((p, i) => `${p.name}=${u.inputIdx[i] >= 0 ? symOfSig(u.inputIdx[i]) : "\\text{sem fio}"}`);
    const outName = outs
      .map((p) => {
        const si = sigIndex.get(`${c.id}.${p.name}`);
        return si === undefined ? "" : symOfSig(si);
      })
      .filter(Boolean)[0];
    sigBlocks.push({ kind: "text", text: `${shortName(c)}  ·  ${def.label}` });
    const lawFn = LAWS[c.type];
    if (lawFn) for (const t of lawFn(c)) sigBlocks.push({ kind: "tex", tex: t });
    else sigBlocks.push({ kind: "note", text: def.model });
    sigBlocks.push({ kind: "tex", tex: `${outName ?? "y"}\\;\\leftarrow\\;f\\big(${inNames.join(",\\;")}\\big)`, caption: "Ligação no diagrama" });
  }
  if (sigBlocks.length)
    sections.push({
      id: "blocos",
      title: "Blocos de sinal, em ordem de execução",
      lead: "O motor calcula os blocos nesta ordem a cada instante: cada saída depende só de entradas já calculadas (ou de estados).",
      blocks: sigBlocks,
    });

  // ---- 5. espaço de estados
  const inputsSig = srcSigs.map((s) => s.sig);
  const chosenInput = opts.input && sigIndex.has(opts.input) && srcSet.has(sigIndex.get(opts.input)!) ? opts.input : undefined;
  let outIdx: number | undefined = opts.output !== undefined && sigIndex.has(opts.output) ? sigIndex.get(opts.output) : undefined;
  if (outIdx === undefined) outIdx = scopeSigs.find((i) => !srcSet.has(i)) ?? outIdxAll[0];
  let order = 0;
  let stable: boolean | undefined;
  let tfOut: { num: number[]; den: number[] } | undefined;
  let chosenOut: string | undefined = outIdx !== undefined ? model.signals[outIdx].id : undefined;
  let chosenIn: string | undefined = chosenInput;

  if (model.nx === 0) {
    sections.push({
      id: "estado",
      title: "Espaço de estados",
      lead: "Este projeto não tem estados dinâmicos: todas as saídas são funções algébricas das entradas.",
      blocks: [{ kind: "note", text: "Adicione capacitor, indutor, massa, integrador ou outro elemento com memória para ver as equações de estado." }],
    });
  } else {
    let lin: Lin | null = null;
    let err = "";
    try {
      const allOuts = outIdx !== undefined ? [outIdx] : [];
      lin = jacobians(model, tOp, xop, inputsSig, allOuts);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    if (!lin) {
      sections.push({ id: "estado", title: "Espaço de estados", blocks: [{ kind: "note", text: err || "Não foi possível linearizar." }] });
    } else {
      // estados inertes (discretos ou sem influência) saem da dinâmica
      const n0 = model.nx;
      const rowMax = (i: number) => Math.max(...lin!.A[i].map(Math.abs), ...lin!.B[i].map(Math.abs));
      const colMax = (k: number) => Math.max(...lin!.A.map((r) => Math.abs(r[k])));
      const gmax = Math.max(1e-300, ...lin.A.flat().map(Math.abs), ...lin.B.flat().map(Math.abs));
      const keep: number[] = [];
      for (let i = 0; i < n0; i++) if (rowMax(i) > 1e-9 * gmax || colMax(i) > 1e-9 * gmax) keep.push(i);
      const A = keep.map((i) => keep.map((k) => lin!.A[i][k]));
      const B = keep.map((i) => lin!.B[i].slice());
      const C = lin.C.map((r) => keep.map((k) => r[k]));
      const D = lin.D;
      order = keep.length;

      // nomes dos estados por perturbação
      const names = stateNames(model, byId, tOp, xop, keep, units);
      const used = new Set<number>();
      const inputNames = inputsSig.map((s) => model.signals[s].label);
      // entrada escolhida: a primeira fonte que influencia algo
      let jIn = chosenInput ? inputsSig.indexOf(sigIndex.get(chosenInput)!) : -1;
      if (jIn < 0) {
        const order = inputsSig.map((_, j) => j).sort((p, q) => Number(srcSigs[p].c.type === "signal.constant") - Number(srcSigs[q].c.type === "signal.constant"));
        const infl = order.find((j) => B.some((r) => Math.abs(r[j]) > 1e-9 * gmax) || Math.abs(D[0]?.[j] ?? 0) > 1e-9 * gmax);
        jIn = infl !== undefined ? infl : inputsSig.length ? 0 : -1;
      }
      chosenIn = jIn >= 0 ? model.signals[inputsSig[jIn]].id : undefined;
      void used;

      const blocksSS: MathBlock[] = [];
      blocksSS.push({
        kind: "table",
        head: ["Estado", "Significado", "Valor no ponto de operação"],
        rows: keep.map((k, i) => [{ tex: `x_{${i + 1}}` }, names[i], { tex: tn(xop[k]) }]),
      });
      if (inputsSig.length)
        blocksSS.push({
          kind: "table",
          head: ["Entrada", "Fonte", "Valor mantido"],
          rows: inputsSig.map((s, j) => [{ tex: `u_{${j + 1}}` }, inputNames[j], { tex: tn(held.get(s) ?? 0) }]),
        });
      const nmx = keep.length;
      if (nmx > 0) {
        blocksSS.push({ kind: "tex", tex: `\\dot{\\mathbf{x}}=\\mathbf{A}\\,\\mathbf{x}+\\mathbf{B}\\,\\mathbf{u}` , caption: "Equação de estado (derivadas dos estados)" });
        blocksSS.push({ kind: "tex", tex: `\\mathbf{A}=${matTex(A)}`, caption: nmx > 8 ? "Matriz A (role para os lados)" : "Matriz A: como cada estado influencia a derivada dos outros" });
        if (inputsSig.length) blocksSS.push({ kind: "tex", tex: `\\mathbf{B}=${matTex(B)}`, caption: "Matriz B: como cada entrada empurra os estados" });
        if (outIdx !== undefined) {
          blocksSS.push({ kind: "tex", tex: `y=\\mathbf{C}\\,\\mathbf{x}+\\mathbf{D}\\,\\mathbf{u}`, caption: `Saída escolhida: ${model.signals[outIdx].label}` });
          blocksSS.push({ kind: "tex", tex: `\\mathbf{C}=${matTex(C)},\\qquad \\mathbf{D}=${matTex(D)}` });
        }
        // equações escalares
        const eqs = keep.map((_, i) => {
          const terms: string[] = [];
          keep.forEach((__, j) => {
            const v = A[i][j];
            if (Math.abs(v) > 1e-9 * gmax) terms.push(`${tnSigned(v)}\\,x_{${j + 1}}`);
          });
          inputsSig.forEach((_, j) => {
            const v = B[i][j];
            if (Math.abs(v) > 1e-9 * gmax) terms.push(`${tnSigned(v)}\\,u_{${j + 1}}`);
          });
          return `\\dot x_{${i + 1}}=${terms.length ? terms.join(" ").replace(/^\+/, "") : "0"}`;
        });
        blocksSS.push({ kind: "text", text: "Escrito equação por equação (derivadas):" });
        eqs.forEach((t) => blocksSS.push({ kind: "tex", tex: t }));
        blocksSS.push({
          kind: "tex",
          tex: `\\mathbf{x}(t)=e^{\\mathbf{A}(t-t_0)}\\mathbf{x}(t_0)+\\int_{t_0}^{t}e^{\\mathbf{A}(t-\\tau)}\\,\\mathbf{B}\\,\\mathbf{u}(\\tau)\\,d\\tau`,
          caption: "Solução geral (integral de convolução)",
        });
      }
      sections.push({
        id: "estado",
        title: "Espaço de estados (linearizado)",
        lead: "Cada estado é uma grandeza com memória (tensão de capacitor, corrente de indutor, velocidade...). As matrizes saem da derivada numérica do modelo completo no ponto de operação.",
        blocks: blocksSS,
      });

      // ---- 6/7. função de transferência
      if (nmx > 0 && nmx <= 40 && outIdx !== undefined && jIn >= 0) {
        const b = B.map((r) => r[jIn]);
        const c = C[0];
        const d = D[0][jIn];
        const tfSec = transferSection(A, b, c, d, nmx);
        sections.push(...tfSec.sections);
        stable = tfSec.stable;
        tfOut = tfSec.tf;
      } else if (nmx > 40) {
        sections.push({ id: "tf", title: "Função de transferência", blocks: [{ kind: "note", text: "O sistema tem mais de 40 estados. A análise de polos e zeros foi omitida para manter a página rápida." }] });
      } else if (jIn < 0) {
        sections.push({ id: "tf", title: "Função de transferência", blocks: [{ kind: "note", text: "O projeto não tem fonte de entrada. Adicione um degrau, senoide ou controle manual." }] });
      }
    }
  }

  // ---- 8. pequenos sinais
  const ss = smallSignal(proj, sigIndex, sgOp);
  if (ss) sections.push(ss);

  // ---- 9. ponto de operação
  const opRows: (string | { tex: string })[][] = [];
  model.signals.forEach((s, i) => {
    if (!s.componentId || byId.get(s.componentId)?.type === "sink.scope") return;
    const v = sgOp[i];
    if (!Number.isFinite(v)) return;
    opRows.push([s.label, { tex: `${tn(v)}${s.unit ? `\\;\\text{${escTex(s.unit)}}` : ""}` }]);
  });
  if (opRows.length) sections.push({ id: "op", title: "Valores no ponto de operação", lead: "Todas as grandezas do circuito no instante final da simulação com as fontes paradas.", blocks: [{ kind: "table", head: ["Grandeza", "Valor"], rows: opRows.slice(0, 120) }] });

  return { ok: true, sections, inputs: inputsList, outputs: outputsList, input: chosenIn, output: chosenOut, order, stable, tf: tfOut };
}

/** Dá um nome a cada estado: procura o sinal que acompanha o estado um para um. */
function stateNames(model: CompiledModel, byId: Map<string, ComponentInstance>, t: number, x: Float64Array, keep: number[], units: ReturnType<CompiledModel["unitInfo"]>): string[] {
  const xs = Float64Array.from(x);
  const base = Float64Array.from(model.evaluate(t, xs));
  const stateful = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return 0;
    const k = KIND(c);
    if (k === "cap1" || k === "cap2" || k === "ind" || k === "motor") return 3;
    if (/^(process|control|math\.integrator|business|nonlinear\.integrator)/.test(c.type)) return 3;
    return k === "res" || k === "vsrc" ? 0 : 1;
  };
  return keep.map((k, i) => {
    const d = 1e-4 * Math.max(1, Math.abs(x[k]));
    xs[k] = x[k] + d;
    const pert = model.evaluate(t, xs);
    let best = -1,
      bestScore = -1,
      bestSign = 1;
    for (let j = 0; j < base.length; j++) {
      const r = (pert[j] - base[j]) / d;
      if (Math.abs(Math.abs(r) - 1) < 1e-3) {
        const sc = stateful(model.signals[j].componentId) + (r > 0 ? 0.5 : 0);
        if (sc > bestScore) (bestScore = sc), (best = j), (bestSign = r > 0 ? 1 : -1);
      }
    }
    xs[k] = x[k];
    if (best >= 0 && bestScore >= 1) {
      const s = model.signals[best];
      return `${bestSign < 0 ? "−" : ""}${s.label}${s.unit ? ` (${s.unit})` : ""}`;
    }
    const u = units.find((q) => k >= q.off && k < q.off + q.nStates);
    const c = u ? byId.get(u.compIds[0]) : undefined;
    return c ? `Estado interno de ${shortName(c)}` : `Estado ${i + 1}`;
  });
}

function transferSection(A: Mat, b: number[], c: number[], d: number, n: number): { sections: MathSection[]; stable?: boolean; tf?: { num: number[]; den: number[] } } {
  const sections: MathSection[] = [];
  let poles: Cx[];
  try {
    poles = cleanRoots(eigvals(A));
  } catch {
    return { sections: [{ id: "tf", title: "Função de transferência", blocks: [{ kind: "note", text: "Não foi possível calcular os polos (o método de autovalores não convergiu)." }] }] };
  }
  const nz = poles.filter((p) => cabs(p) > 1e-12);
  const sigma = nz.length ? Math.exp(nz.reduce((a, p) => a + Math.log(cabs(p)), 0) / nz.length) : 1;
  const pc = polyFromRoots(poles);
  // numerador por interpolação: N(s) = G(s)·p(s) em n+1 pontos de uma circunferência que não passe por polos
  const K = n + 1;
  const TH0 = 0.3711;
  let radius = sigma * 1.7321;
  let Nk: Cx[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    let clash = false;
    for (let k = 0; k < K && !clash; k++) {
      const th = TH0 + (2 * Math.PI * k) / K;
      for (const p of poles) if (Math.hypot(p[0] - radius * Math.cos(th), p[1] - radius * Math.sin(th)) < 1e-3 * radius) clash = true;
    }
    if (!clash) break;
    radius *= 1.31;
  }
  for (let k = 0; k < K; k++) {
    const th = TH0 + (2 * Math.PI * k) / K;
    const s: Cx = [radius * Math.cos(th), radius * Math.sin(th)];
    const g = gAt(A, b, c, d, s);
    if (!g) return { sections: [{ id: "tf", title: "Função de transferência", blocks: [{ kind: "note", text: "A matriz (sI − A) ficou singular num ponto de amostragem. Não foi possível obter a função de transferência." }] }] };
    Nk.push(cmul(g, polyEvalC(pc, s)));
  }
  const coefAsc: number[] = [];
  for (let j = 0; j <= n; j++) {
    let re = 0,
      im = 0;
    for (let k = 0; k < K; k++) {
      const th = (-2 * Math.PI * j * k) / K;
      re += Nk[k][0] * Math.cos(th) - Nk[k][1] * Math.sin(th);
      im += Nk[k][0] * Math.sin(th) + Nk[k][1] * Math.cos(th);
    }
    re /= K;
    im /= K;
    // desfaz a fase TH0 (e^{-i j TH0}) e a escala do raio
    const ph = -j * TH0;
    coefAsc.push((re * Math.cos(ph) - im * Math.sin(ph)) / Math.pow(radius, j));
  }
  const scaled = coefAsc.map((v, j) => Math.abs(v) * Math.pow(radius, j));
  const mxs = Math.max(...scaled, 1e-300);
  const numAsc = coefAsc.map((v, j) => (scaled[j] <= 1e-9 * mxs ? 0 : v));
  let desc = numAsc.slice().reverse();
  while (desc.length > 1 && desc[0] === 0) desc = desc.slice(1);
  const hasNum = desc.some((v) => v !== 0);
  let zeros: Cx[] = [];
  let gain = 0;
  if (hasNum) {
    gain = desc[0];
    try {
      zeros = cleanRoots(polyRoots(desc));
    } catch {
      zeros = [];
    }
  }
  // cancelamento polo-zero
  let pr = poles.slice();
  let zr = zeros.slice();
  const cancelled: string[] = [];
  for (let i = zr.length - 1; i >= 0; i--) {
    const z = zr[i];
    let hit = -1;
    for (let j = 0; j < pr.length; j++) {
      if (Math.hypot(pr[j][0] - z[0], pr[j][1] - z[1]) <= 1e-5 * Math.max(cabs(z), cabs(pr[j])) + 1e-8 * sigma) {
        hit = j;
        break;
      }
    }
    if (hit >= 0) {
      cancelled.push(tcx(z));
      pr.splice(hit, 1);
      zr.splice(i, 1);
    }
  }
  const snap = (rs: Cx[]) => rs.map((z): Cx => (cabs(z) < 1e-6 * sigma ? [0, 0] : z));
  pr = snap(cleanRoots(pr));
  zr = snap(cleanRoots(zr));
  const Dp = polyFromRoots(pr);
  const Np = hasNum ? polyFromRoots(zr).map((v) => v * gain) : [0];

  const blocks: MathBlock[] = [];
  blocks.push({ kind: "tex", tex: `G(s)=\\frac{Y(s)}{U(s)}=\\mathbf{C}\\,(s\\mathbf{I}-\\mathbf{A})^{-1}\\mathbf{B}+\\mathbf{D}`, caption: "Definição a partir do espaço de estados" });
  if (!hasNum) {
    blocks.push({ kind: "note", text: "A saída escolhida não depende da entrada escolhida (G(s) = 0). Escolha outra combinação." });
    return { sections: [{ id: "tf", title: "Função de transferência", blocks }] };
  }
  blocks.push({ kind: "tex", tex: `G(s)=\\frac{${polyTex(Np)}}{${polyTex(Dp)}}`, caption: "Forma polinomial" });
  const factors = (rs: Cx[]) => {
    const out: string[] = [];
    const real = rs.filter((z) => z[1] === 0).sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < real.length; ) {
      let k = 1;
      while (i + k < real.length && Math.abs(real[i + k][0] - real[i][0]) <= 1e-6 * Math.max(sigma, Math.abs(real[i][0]))) k++;
      const base = Math.abs(real[i][0]) < 1e-12 ? "s" : `(s${tnSigned(-real[i][0])})`;
      out.push(k > 1 ? `${base}^{${k}}` : base);
      i += k;
    }
    for (const z of rs) if (z[1] > 0) out.push(`(${polyTex([1, -2 * z[0], z[0] * z[0] + z[1] * z[1]])})`);
    return out.join("");
  };
  const fz = factors(zr);
  const fp = factors(pr);
  blocks.push({ kind: "tex", tex: `G(s)=${tn(gain)}\\,\\frac{${fz || "1"}}{${fp || "1"}}`, caption: "Forma fatorada (zeros no numerador, polos no denominador)" });
  if (cancelled.length) blocks.push({ kind: "note", text: `Foram cancelados ${cancelled.length} par(es) polo-zero (estados que não aparecem entre esta entrada e esta saída).` });
  // ganho CC
  let g0: number | null = null;
  const gz = gAt(A, b, c, d, [0, 0]);
  if (gz && Number.isFinite(gz[0])) g0 = Math.abs(gz[0]) < 1e-7 * Math.max(Math.abs(gain), Math.abs(d), 1e-300) ? 0 : gz[0];
  if (g0 !== null) blocks.push({ kind: "tex", tex: `G(0)=-\\mathbf{C}\\mathbf{A}^{-1}\\mathbf{B}+\\mathbf{D}=${tn(g0)}`, caption: "Ganho em regime (frequência zero)" });
  else blocks.push({ kind: "note", text: "Há um polo em s = 0 (integrador): não existe ganho de regime." });
  if (Math.abs(d) > 1e-9 * Math.max(Math.abs(gain), 1e-300)) blocks.push({ kind: "tex", tex: `G(\\infty)=\\mathbf{D}=${tn(d)}`, caption: "Ganho em frequência infinita (a saída segue a entrada sem atraso)" });
  sections.push({ id: "tf", title: "Função de transferência", lead: "Combinando as equações de estado, a relação entre uma entrada e uma saída vira uma razão de polinômios em s.", blocks });

  // equação diferencial entrada-saída
  const ode = (coef: number[], v: string) => {
    const m = coef.length - 1;
    const mx = Math.max(...coef.map(Math.abs));
    const parts: string[] = [];
    coef.forEach((cf, i) => {
      if (Math.abs(cf) <= 1e-12 * mx || cf === 0) return;
      const k = m - i;
      const der = k === 0 ? v : k === 1 ? `\\dot ${v}` : k === 2 ? `\\ddot ${v}` : `${v}^{(${k})}`;
      const a = Math.abs(cf);
      const co = Math.abs(a - 1) < 1e-9 && k > 0 ? "" : tn(a);
      parts.push(`${cf < 0 ? "-" : parts.length ? "+" : ""}${co}${co ? "\\," : ""}${der}`);
    });
    return parts.join("") || "0";
  };
  sections.push({
    id: "ode",
    title: "Equação diferencial entrada-saída",
    lead: "Cada potência de s vira uma derivada no tempo: s → d/dt. É a mesma informação da função de transferência escrita em derivadas.",
    blocks: [
      { kind: "tex", tex: `${ode(Dp, "y")}=${ode(Np, "u")}` },
      { kind: "tex", tex: `Y(s)\\,\\big(${polyTex(Dp)}\\big)=U(s)\\,\\big(${polyTex(Np)}\\big)`, caption: "No domínio de Laplace" },
    ],
  });

  // polos e zeros
  const rows: (string | { tex: string })[][] = [];
  const kinds = (p: Cx) => {
    const m = cabs(p);
    if (m < 1e-9 * sigma) return "integrador (s = 0)";
    if (p[1] === 0) return p[0] < 0 ? "real, estável" : "real, instável";
    return p[0] < 0 ? "par complexo, estável" : p[0] === 0 ? "par imaginário puro (oscila sem amortecer)" : "par complexo, instável";
  };
  let np = 0;
  pr.forEach((p) => {
    if (p[1] < 0) return;
    np++;
    const i = np - 1;
    const m = cabs(p);
    const extra =
      p[1] > 0
        ? `\\omega_n=${tn(m)},\\; \\zeta=${tn(-p[0] / m)},\\; \\omega_d=${tn(p[1])}`
        : Math.abs(p[0]) > 1e-12
          ? `\\tau=${tn(-1 / p[0])}\\text{ s}`
          : "";
    rows.push([{ tex: `p_{${i + 1}}=${tcx(p)}${p[1] > 0 ? `\\;(\\pm)` : ""}` }, kinds(p), { tex: extra }]);
  });
  let nzc = 0;
  zr.forEach((z) => {
    if (z[1] < 0) return;
    const i = nzc++;
    rows.push([{ tex: `z_{${i + 1}}=${tcx(z)}${z[1] > 0 ? `\\;(\\pm)` : ""}` }, z[1] === 0 ? (z[0] > 0 ? "zero no semiplano direito (fase não mínima)" : "zero real") : "par de zeros complexos", { tex: "" }]);
  });
  const isStable = pr.every((p) => p[0] < -1e-9 * sigma);
  const marginal = !isStable && pr.every((p) => p[0] <= 1e-9 * sigma);
  const verdict = isStable ? "Estável: todos os polos têm parte real negativa. A resposta ao degrau converge." : marginal ? "Marginalmente estável: há polo sobre o eixo imaginário (integrador ou oscilação sem amortecimento)." : "Instável: há polo com parte real positiva. A resposta cresce sem limite.";
  const pb: MathBlock[] = [
    { kind: "tex", tex: `D(s)=${polyTex(Dp)}=0`, caption: "Equação característica (os polos são suas raízes)" },
    { kind: "table", head: ["Raiz", "Tipo", "Grandezas"], rows },
    { kind: "note", text: verdict },
  ];
  const sl = pr.filter((p) => p[0] < 0 && cabs(p) > 1e-12);
  if (sl.length) {
    const slow = Math.min(...sl.map((p) => -p[0]));
    pb.push({ kind: "tex", tex: `t_{\\text{acomodação}}\\approx\\frac{4}{${tn(slow)}}=${tn(4 / slow)}\\text{ s}`, caption: "Tempo de acomodação (2%), pelo polo mais lento" });
  }
  sections.push({ id: "polos", title: "Polos, zeros e estabilidade", lead: "Os polos são os autovalores de A. Eles ditam a forma da resposta: e^(pt) para polos reais, senoides amortecidas para pares complexos.", blocks: pb });

  // resposta ao degrau analítica
  const sep = pr.every((p, i) => pr.every((q, j) => i === j || cabs(csub(p, q)) > 1e-6 * Math.max(sigma, cabs(p))));
  const noOrigin = pr.every((p) => cabs(p) > 1e-9 * sigma);
  if (isStable || marginal || !isStable) {
    const sb: MathBlock[] = [];
    if (sep && noOrigin && g0 !== null && Number.isFinite(g0)) {
      const terms: string[] = [];
      const gainK = gain;
      for (let i = 0; i < pr.length; i++) {
        const p = pr[i];
        let num: Cx = [gainK, 0];
        for (const z of zr) num = cmul(num, csub(p, z));
        let den: Cx = [1, 0];
        for (let j = 0; j < pr.length; j++) if (j !== i) den = cmul(den, csub(p, pr[j]));
        const res = cdiv(num, den);
        const cc = cdiv(res, p);
        if (p[1] < 0) continue;
        if (p[1] === 0) terms.push(`${tnSigned(cc[0])}\\,e^{${tn(p[0])}\\,t}`);
        else terms.push(`${tnSigned(2 * cabs(cc))}\\,e^{${tn(p[0])}\\,t}\\cos\\!\\big(${tn(p[1])}\\,t${tnSigned(carg(cc))}\\big)`);
      }
      sb.push({ kind: "tex", tex: `Y(s)=\\frac{G(s)}{s}\\;\\Longrightarrow\\;y(t)=\\mathcal{L}^{-1}\\!\\left\\{\\frac{G(s)}{s}\\right\\}`, caption: "Entrada degrau unitário (frações parciais)" });
      sb.push({ kind: "tex", tex: `y(t)=${tn(g0)}${terms.join("")}\\qquad(t\\ge 0)` });
      sb.push({ kind: "note", text: "O primeiro termo é o valor final. Cada exponencial ou senoide amortecida vem de um polo. Vale para o degrau aplicado em t = 0 com o sistema em repouso." });
    } else {
      sb.push({ kind: "note", text: "A forma analítica foi omitida: o sistema tem polos repetidos ou um integrador, casos que pedem outra decomposição. Use a página Gráficos para a resposta numérica." });
    }
    sections.push({ id: "degrau", title: "Resposta ao degrau (forma analítica)", lead: "A integral de convolução resolvida: transformada inversa de Laplace de G(s)/s.", blocks: sb });
  }
  return { sections, stable: isStable, tf: { num: Np, den: Dp } };
}

// ------------------------------------------------------------------------------------------------ pequenos sinais

function smallSignal(ir: ProjectIR, sigIndex: Map<string, number>, sg: Float64Array): MathSection | null {
  const blocks: MathBlock[] = [];
  const get = (c: ComponentInstance, port: string) => {
    const i = sigIndex.get(`${c.id}.${port}`);
    return i === undefined ? NaN : sg[i];
  };
  const out: BjtOut = { ic: 0, ib: 0, dicVbe: 0, dicVbc: 0, dibVbe: 0, dibVbc: 0 };
  for (const c of ir.components) {
    const nm = shortName(c);
    if (c.type === "elec.diode" || c.type === "elec.led" || c.type === "elec.zener") {
      const v = get(c, "v"),
        i = get(c, "i");
      if (!Number.isFinite(v)) continue;
      const o = { i: 0, g: 0 };
      diode(v, { Is: pnum(c, "Is"), nVt: pnum(c, "n") * VT, Vz: c.type === "elec.zener" ? pnum(c, "Vz") : 0 }, o);
      blocks.push({ kind: "text", text: `${nm}  ·  ${getDef(c.type)?.label}` });
      blocks.push({ kind: "tex", tex: `V_D=${tn(v)}\\text{ V},\\quad I_D=${tn(i)}\\text{ A}\\;\\Rightarrow\\; g_d=\\frac{\\partial i}{\\partial v}=${tn(o.g)}\\text{ S},\\quad r_d=\\frac{1}{g_d}=${tn(1 / o.g)}\\;\\Omega` });
    } else if (c.type === "elec.npn" || c.type === "elec.pnp") {
      const vbe = get(c, "vbe"),
        vce = get(c, "vce");
      if (!Number.isFinite(vbe)) continue;
      bjt(vbe, vbe - vce, { Is: pnum(c, "Is"), bf: pnum(c, "bf"), br: pnum(c, "br"), VA: pnum(c, "VA") }, out);
      const gm = out.dicVbe,
        gpi = out.dibVbe,
        go = -out.dicVbc;
      blocks.push({ kind: "text", text: `${nm}  ·  ${getDef(c.type)?.label}` });
      blocks.push({ kind: "tex", tex: `I_C=${tn(out.ic)}\\text{ A},\\quad V_{BE}=${tn(vbe)}\\text{ V},\\quad V_{CE}=${tn(vce)}\\text{ V}` });
      blocks.push({ kind: "tex", tex: `g_m=\\frac{\\partial i_C}{\\partial v_{BE}}\\approx\\frac{I_C}{V_T}=${tn(gm)}\\text{ S},\\quad r_\\pi=\\frac{1}{g_\\pi}=${tn(1 / gpi)}\\;\\Omega,\\quad r_o=\\frac{1}{g_o}=${go > 1e-15 ? tn(1 / go) : "\\infty"}\\;\\Omega` });
      blocks.push({ kind: "tex", tex: `\\beta_0=g_m\\,r_\\pi=${tn(gm / gpi)}`, caption: "Modelo híbrido-π: i_c = g_m·v_be + v_ce/r_o,  i_b = v_be/r_π" });
    } else if (c.type === "elec.nmos" || c.type === "elec.pmos") {
      const vgs = get(c, "vgs"),
        vds = get(c, "vds");
      if (!Number.isFinite(vgs)) continue;
      const mo = { id: 0, gm: 0, gds: 0 };
      const K = pnum(c, "K"),
        Vth = pnum(c, "Vth"),
        lam = pnum(c, "lam");
      mosfet(vgs, vds, { K, Vth, lam }, mo);
      const vov = vgs - Vth;
      const region = vov <= 0 ? "corte" : vds < vov ? "triodo" : "saturação";
      blocks.push({ kind: "text", text: `${nm}  ·  ${getDef(c.type)?.label}` });
      blocks.push({ kind: "tex", tex: `V_{GS}=${tn(vgs)}\\text{ V},\\quad V_{DS}=${tn(vds)}\\text{ V},\\quad I_D=${tn(mo.id)}\\text{ A}\\quad\\text{(região de ${region})}` });
      blocks.push({ kind: "tex", tex: `g_m=\\frac{\\partial i_D}{\\partial v_{GS}}=${tn(mo.gm)}\\text{ S},\\quad g_{ds}=\\frac{\\partial i_D}{\\partial v_{DS}}=${tn(mo.gds)}\\text{ S}\\;\\Rightarrow\\; r_o=${mo.gds > 1e-15 ? tn(1 / mo.gds) : "\\infty"}\\;\\Omega` });
    }
  }
  if (!blocks.length) return null;
  return { id: "pequenos-sinais", title: "Pequenos sinais dos semicondutores", lead: "No ponto de operação, cada dispositivo não linear se comporta como resistências e fontes controladas. São estes valores que entram nas matrizes A, B, C e D.", blocks };
}
