// Montador dos domínios físicos: mecânico (translação e rotação), elétrico e eletromecânico.
//
// Todos os domínios usam a mesma análise nodal, por analogia (força-corrente):
//   grandeza entre pontos (v):  velocidade (m/s), velocidade angular (rad/s) ou tensão (V)
//   grandeza que passa (i):     força (N), torque (N·m) ou corrente (A)
//   massa, inércia, capacitor   acumulam v (estado)        C·dv/dt = i
//   mola, indutor               acumulam i (estado)        L·di/dt = v   (mola: L = 1/k)
//   amortecedor, resistor       ligam i a v sem estado     i = G·v
//   fonte de força/corrente     impõe i;  fonte de velocidade/tensão impõe v
//   terra / parede / referência fixa: v = 0
//   engrenagem, pinhão e cremalheira: transformador ideal  v2 = n·v1,  i1 = -n·i2
//   motor CC: indutor com queda resistiva e fem, que injeta torque no eixo.
//
// Método: os estados são v das massas/capacitores e i das molas/indutores. Em cada instante
// resolve-se um sistema linear (análise nodal modificada) para achar v nos pontos sem massa e
// as correntes das massas. A matriz só muda quando um parâmetro muda: a fatoração LU é guardada.

import type { CompInfo, PhysBuild, PhysCtx, Unit } from "./internal";
import { bjt, diode, mosfet, opamp, VT, type BjtOut, type BjtP, type DiodeP, type MosP } from "./devices";
import { luFactor, luSolve, SingularMatrixError, type LU } from "./linalg";
import { SolverError } from "./solvers";
import type { Domain } from "./types";

interface Ref {
  /** Índice do ponto mestre, ou -1 para o terra. */
  m: number;
  /** v do ponto = f · v do mestre. */
  f: number;
}
const GND: Ref = { m: -1, f: 1 };

interface Static {
  /** Por rede: ponto mestre (-1 = terra) e fator. */
  groupM: number[];
  factor: number[];
  nMaster: number;
  /** Por rede: nomes dos componentes ligados. */
  names: string[][];
  attached: number[];
}

const VAR_NAME: Record<Domain, string> = { signal: "valor", mech: "velocidade", rot: "velocidade angular", elec: "tensão" };
const VAR_UNIT: Record<Domain, string> = { signal: "", mech: "m/s", rot: "rad/s", elec: "V" };

interface Cap {
  m: number;
  C: number;
  wNum: number;
  xNum: number;
  pos: boolean;
  iw: number;
  ix: number;
}
interface Ind {
  a: Ref;
  b: Ref;
  L: number;
  i0: number;
  ii: number;
}
interface FCap {
  a: Ref;
  b: Ref;
  C: number;
  v0: number;
  iv: number;
}
interface VSrc {
  a: Ref;
  b: Ref;
  inp: number;
}
interface ISrc {
  a: Ref;
  b: Ref;
  inp: number;
  sign: number;
}
interface Motor {
  p: Ref;
  n: Ref;
  s: Ref;
  R: number;
  L: number;
  K: number;
  i0: number;
  ii: number;
}

interface Dio {
  a: Ref;
  b: Ref;
  P: DiodeP;
}
interface Bjt {
  c: Ref;
  b: Ref;
  e: Ref;
  /** +1 NPN, −1 PNP. */
  p: 1 | -1;
  P: BjtP;
}
interface Mos {
  d: Ref;
  g: Ref;
  s: Ref;
  p: 1 | -1;
  P: MosP;
}
interface Opa {
  p: Ref;
  n: Ref;
  o: Ref;
  A: number;
  lo: number;
  hi: number;
  row: number;
}
/** Chave: condutância Gon quando "ligada", Goff quando "desligada". O estado discreto fica em x[iq]. */
interface Swi {
  a: Ref;
  b: Ref;
  Gon: number;
  Goff: number;
  iq: number;
  /** Fecha quando o estado é baixo (transistor de descarga do 555). */
  onLow: boolean;
}
interface PlainSw {
  sw: Swi;
  inp: number;
}
interface Tim {
  thr: Ref;
  trig: Ref;
  vcc: number;
  rst: number;
  q0: number;
  sw: Swi;
}

interface Built {
  key: string;
  nGuards: number;
  guards(x: Float64Array, o: number, sig: Float64Array, g: Float64Array, go: number): void;
  fire(x: Float64Array, o: number, sig: Float64Array, prev: Uint8Array, next: Uint8Array, go: number, init: boolean): void;
  nStates: number;
  x0(): number[];
  inputs: number[];
  aSigs: number[];
  bSigs: number[];
  evalA(x: Float64Array, o: number, sig: Float64Array): void;
  evalB(x: Float64Array, o: number, sig: Float64Array): void;
  der(x: Float64Array, o: number, sig: Float64Array, dx: Float64Array): void;
  feedthroughB: boolean;
  minTs: number;
  bIds: string[];
}

const fail = (error: string, ids: string[] = []) => ({ error, ids });

export function buildPhysical(ctx: PhysCtx): PhysBuild {
  const empty: PhysBuild = { units: [], netSignal: new Map() };
  const comps = ctx.comps.filter((c) => c.def.physical);
  if (!comps.length) return empty;
  const nameOf = (ci: CompInfo) => ci.inst.label ?? ci.def.label;

  // ---------- estrutura (não depende dos valores dos parâmetros)
  const nNets = ctx.nNets;
  const attached = new Array<number>(nNets).fill(0);
  const names: string[][] = Array.from({ length: nNets }, () => []);
  const isGround = new Array<boolean>(nNets).fill(false);
  const xfm: { a: number; b: number; n: number }[] = [];
  for (const ci of comps) {
    const kind = ci.def.physical!.kind;
    for (const p of ci.ports) {
      if (p.dir !== "phys") continue;
      const net = ctx.netOf(ci.inst.id, p.name);
      if (net === undefined) continue;
      attached[net]++;
      names[net].push(nameOf(ci));
      if (kind === "gnd") isGround[net] = true;
    }
    if (kind === "xfm") {
      const a = ctx.netOf(ci.inst.id, "a")!;
      const b = ctx.netOf(ci.inst.id, "b")!;
      const n = ci.def.type === "rot.gear" ? 1 / ci.reader.num("N") : ci.reader.num("r");
      xfm.push({ a, b, n });
    }
  }
  let bad = false;
  for (const ci of comps) {
    const kind = ci.def.physical!.kind;
    if (kind === "gnd" || kind === "cap1") continue;
    for (const p of ci.ports) {
      if (p.dir !== "phys") continue;
      if (ci.def.type === "electromech.motor" && p.name === "s") continue; // motor em vazio é válido
      const net = ctx.netOf(ci.inst.id, p.name);
      if (net !== undefined && attached[net] < 2 && !isGround[net]) {
        ctx.diag({ severity: "error", code: "phys-open", message: `A porta "${p.label}" de ${nameOf(ci)} não está ligada a nada. Ligue-a a outro componente ou ao terra.`, componentIds: [ci.inst.id] });
        bad = true;
      }
    }
  }
  if (bad) return empty;

  // Grupos de redes ligadas por transformadores ideais.
  const adj: { to: number; f: number }[][] = Array.from({ length: nNets }, () => []);
  for (const t of xfm) {
    adj[t.a].push({ to: t.b, f: t.n });
    adj[t.b].push({ to: t.a, f: 1 / t.n });
  }
  const factor = new Array<number>(nNets).fill(NaN);
  const group = new Array<number>(nNets).fill(-1);
  let nGroups = 0;
  for (let s = 0; s < nNets; s++) {
    if (group[s] >= 0) continue;
    factor[s] = 1;
    group[s] = nGroups;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of adj[u]) {
        const fv = factor[u] * e.f;
        if (group[e.to] < 0) {
          group[e.to] = nGroups;
          factor[e.to] = fv;
          stack.push(e.to);
        } else if (Math.abs(factor[e.to] - fv) > 1e-9 * Math.max(1, Math.abs(fv))) {
          ctx.diag({ severity: "error", code: "phys-gear-loop", message: "Engrenagens ligadas em laço com relações incompatíveis: o conjunto ficaria travado." });
          return empty;
        }
      }
    }
    nGroups++;
  }
  const groundGroup = new Array<boolean>(nGroups).fill(false);
  for (let n = 0; n < nNets; n++) if (isGround[n]) groundGroup[group[n]] = true;
  const masterOfGroup = new Array<number>(nGroups).fill(-1);
  let nMaster = 0;
  const masterNets: number[][] = [];
  for (let g = 0; g < nGroups; g++) if (!groundGroup[g]) masterOfGroup[g] = nMaster++;
  for (let g = 0; g < nMaster; g++) masterNets.push([]);
  const groupM = group.map((g) => masterOfGroup[g]);
  for (let n = 0; n < nNets; n++) if (groupM[n] >= 0) masterNets[groupM[n]].push(n);
  const st: Static = { groupM, factor, nMaster, names, attached };

  // Sinais de cada rede (valor mostrado nos fios e registrado nos gráficos).
  const netSignal = new Map<number, number>();
  for (let n = 0; n < nNets; n++) {
    if (groupM[n] < 0 || attached[n] < 1) continue;
    const dom = ctx.netDomain(n);
    const who = [...new Set(names[n])].slice(0, 3).join(", ");
    const idx = ctx.alloc({ id: `net${n}`, componentId: null, label: `Ponto de ${who} · ${VAR_NAME[dom]}`, unit: VAR_UNIT[dom], kind: "observable" });
    netSignal.set(n, idx);
  }

  const first = make(ctx, comps, st, netSignal, masterNets);
  if ("error" in first) {
    ctx.diag({ severity: "error", code: "phys-singular", message: first.error, componentIds: first.ids });
    return { units: [], netSignal };
  }
  const slot = { m: first };

  const refresh = (): "ok" | "reset" | { error: string } => {
    const nb = make(ctx, comps, st, netSignal, masterNets);
    if ("error" in nb) return { error: nb.error };
    if (nb.key !== slot.m.key) return "reset";
    slot.m = nb;
    return "ok";
  };

  const A: Unit = {
    id: "physical",
    compIds: comps.map((c) => c.inst.id),
    nStates: first.nStates,
    off: 0,
    inputIdx: first.inputs,
    producedIdx: first.aSigs,
    feedthrough: false,
    x0: () => slot.m.x0(),
    evalOut: (_t, x, sig) => slot.m.evalA(x, A.off, sig),
    evalDer: (_t, x, sig, dx) => slot.m.der(x, A.off, sig, dx),
    minTimescale: () => slot.m.minTs,
    refresh,
    nGuards: first.nGuards,
    guards: (_t, x, sig, g) => slot.m.guards(x, A.off, sig, g, A.guardOff ?? 0),
    fire: (_t, x, sig, prev, next, init) => slot.m.fire(x, A.off, sig, prev, next, A.guardOff ?? 0, init),
  };
  const B: Unit = {
    id: "physical-obs",
    compIds: first.bIds,
    nStates: 0,
    off: 0,
    inputIdx: first.inputs,
    producedIdx: first.bSigs,
    feedthrough: first.feedthroughB,
    x0: () => [],
    evalOut: (_t, x, sig) => slot.m.evalB(x, A.off, sig),
    evalDer: () => {},
    refresh: () => refresh(),
  };
  return { units: [A, B], netSignal };
}

// ------------------------------------------------------------------------------------------------

const GMIN_MOS = 1e-12;
const dioScratch = { i: 0, g: 0 };
const dioI = (v: number, P: DiodeP) => {
  diode(v, P, dioScratch);
  return dioScratch.i;
};
const bjtScratch: BjtOut = { ic: 0, ib: 0, dicVbe: 0, dicVbc: 0, dibVbe: 0, dibVbc: 0 };
const mosScratch = { id: 0, gm: 0, gds: 0 };
/** Corrente de dreno no sentido do dispositivo (positiva em operação normal), para a saída. */
const mosId = (pol: 1 | -1, vd: number, vg: number, vs: number, P: MosP) => {
  const d = pol * vd,
    g = pol * vg,
    s = pol * vs;
  mosfet(g - Math.min(d, s), Math.abs(d - s), P, mosScratch);
  return (d >= s ? 1 : -1) * mosScratch.id;
};

function make(ctx: PhysCtx, comps: CompInfo[], st: Static, netSignal: Map<number, number>, masterNets: number[][]): Built | { error: string; ids: string[] } {
  const M = st.nMaster;
  const refOf = (id: string, port: string): Ref => {
    const net = ctx.netOf(id, port);
    if (net === undefined) return GND;
    return { m: st.groupM[net], f: st.factor[net] };
  };
  const nameOf = (ci: CompInfo) => ci.inst.label ?? ci.def.label;

  const caps = new Map<number, Cap>();
  const addCap = (r: Ref, C: number, v0: number, x0: number, pos: boolean) => {
    if (r.m < 0) return;
    let c = caps.get(r.m);
    if (!c) {
      c = { m: r.m, C: 0, wNum: 0, xNum: 0, pos: false, iw: 0, ix: 0 };
      caps.set(r.m, c);
    }
    c.C += C * r.f * r.f;
    c.wNum += C * r.f * v0;
    c.xNum += C * r.f * x0;
    c.pos ||= pos;
  };
  const res: { a: Ref; b: Ref; G: number }[] = [];
  const inds: Ind[] = [];
  const fcaps: FCap[] = [];
  const vs: VSrc[] = [];
  const isrc: ISrc[] = [];
  const motors: Motor[] = [];
  const dios: Dio[] = [];
  const bjts: Bjt[] = [];
  const moss: Mos[] = [];
  const ops: Opa[] = [];
  const plainSws: PlainSw[] = [];
  const tims: Tim[] = [];
  const inputs: number[] = [];
  const inputOf = (ci: CompInfo): number | { error: string; ids: string[] } => {
    const idx = ctx.sigIn(ci.inst.id, "u");
    if (idx < 0) return fail(`A entrada "u" de ${nameOf(ci)} está sem conexão.`, [ci.inst.id]);
    inputs.push(idx);
    return idx;
  };

  // Saídas: A usa só estados; B usa também a solução algébrica.
  const outA: { sig: number; f: (x: Float64Array) => number }[] = [];
  const outB: { sig: number; f: (x: Float64Array, V: (r: Ref) => number) => number }[] = [];
  const bIds = new Set<string>();
  const sigOut = (ci: CompInfo, port: string) => ctx.sigOut(ci.inst.id, port);
  const vState = (r: Ref, x: Float64Array): number => {
    if (r.m < 0) return 0;
    const c = caps.get(r.m);
    return c ? r.f * x[c.iw] : NaN;
  };
  const xState = (r: Ref, x: Float64Array): number => {
    if (r.m < 0) return 0;
    const c = caps.get(r.m);
    return c && c.pos ? r.f * x[c.ix] : 0;
  };
  const xInit = (r: Ref): number => {
    if (r.m < 0) return 0;
    const c = caps.get(r.m);
    return c && c.C > 0 ? (r.f * c.xNum) / c.C : 0;
  };

  // ---- 1ª passada: massas, inércias, capacitores aterrados (definem os estados de v)
  for (const ci of comps) {
    const t = ci.def.type;
    const rd = ci.reader;
    if (t === "mech.mass") addCap(refOf(ci.inst.id, "a"), rd.num("m"), rd.num("v0"), rd.num("x0"), true);
    else if (t === "rot.inertia") addCap(refOf(ci.inst.id, "a"), rd.num("J"), rd.num("w0"), rd.num("th0"), true);
    else if (t === "electromech.motor") addCap(refOf(ci.inst.id, "s"), rd.num("J"), rd.num("w0"), rd.num("th0"), true);
    else if (t === "elec.capacitor") {
      const a = refOf(ci.inst.id, "a");
      const b = refOf(ci.inst.id, "b");
      if (a.m < 0 && b.m >= 0) addCap(b, rd.num("C"), -rd.num("v0"), 0, false);
      else if (b.m < 0 && a.m >= 0) addCap(a, rd.num("C"), rd.num("v0"), 0, false);
    }
  }

  // ---- 2ª passada: demais elementos e saídas
  for (const ci of comps) {
    const t = ci.def.type;
    const rd = ci.reader;
    const id = ci.inst.id;
    switch (t) {
      case "mech.mass":
      case "rot.inertia": {
        const a = refOf(id, "a");
        const isM = t === "mech.mass";
        outA.push({ sig: sigOut(ci, isM ? "x" : "th"), f: (x) => xState(a, x) });
        outA.push({ sig: sigOut(ci, isM ? "v" : "w"), f: (x) => vState(a, x) });
        break;
      }
      case "mech.spring":
      case "rot.spring": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        const k = rd.num("k");
        const e = (xInit(b) - xInit(a)) + rd.num("e0");
        const ind: Ind = { a, b, L: 1 / k, i0: -k * e, ii: 0 };
        inds.push(ind);
        outA.push({ sig: sigOut(ci, "F"), f: (x) => -x[ind.ii] });
        break;
      }
      case "elec.inductor": {
        const ind: Ind = { a: refOf(id, "a"), b: refOf(id, "b"), L: rd.num("L"), i0: rd.num("i0"), ii: 0 };
        inds.push(ind);
        outA.push({ sig: sigOut(ci, "i"), f: (x) => x[ind.ii] });
        break;
      }
      case "mech.damper":
      case "rot.damper": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        const c = rd.num(t === "mech.damper" ? "c" : "b");
        res.push({ a, b, G: c });
        outB.push({ sig: sigOut(ci, "F"), f: (_x, V) => c * (V(b) - V(a)) });
        bIds.add(id);
        break;
      }
      case "elec.resistor": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        const G = 1 / rd.num("R");
        res.push({ a, b, G });
        outB.push({ sig: sigOut(ci, "i"), f: (_x, V) => G * (V(a) - V(b)) });
        outB.push({ sig: sigOut(ci, "v"), f: (_x, V) => V(a) - V(b) });
        bIds.add(id);
        break;
      }
      case "elec.capacitor": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        if (a.m < 0 || b.m < 0) {
          outA.push({ sig: sigOut(ci, "v"), f: (x) => (a.m < 0 ? -vState(b, x) : vState(a, x)) });
        } else {
          const fc: FCap = { a, b, C: rd.num("C"), v0: rd.num("v0"), iv: 0 };
          fcaps.push(fc);
          outA.push({ sig: sigOut(ci, "v"), f: (x) => x[fc.iv] });
        }
        break;
      }
      case "elec.voltmeter": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        outB.push({ sig: sigOut(ci, "v"), f: (_x, V) => V(a) - V(b) });
        bIds.add(id);
        break;
      }
      case "mech.force":
      case "rot.torque": {
        const inp = inputOf(ci);
        if (typeof inp !== "number") return inp;
        isrc.push({ a: refOf(id, "a"), b: GND, inp, sign: -1 });
        break;
      }
      case "elec.isource": {
        const inp = inputOf(ci);
        if (typeof inp !== "number") return inp;
        // A corrente u sai do terminal p para o circuito.
        isrc.push({ a: refOf(id, "p"), b: refOf(id, "n"), inp, sign: -1 });
        break;
      }
      case "mech.velocity":
      case "rot.speed": {
        const inp = inputOf(ci);
        if (typeof inp !== "number") return inp;
        vs.push({ a: refOf(id, "a"), b: GND, inp });
        break;
      }
      case "elec.vsource": {
        const inp = inputOf(ci);
        if (typeof inp !== "number") return inp;
        vs.push({ a: refOf(id, "p"), b: refOf(id, "n"), inp });
        break;
      }
      case "electromech.motor": {
        const p = refOf(id, "p");
        const n = refOf(id, "n");
        const s = refOf(id, "s");
        const mo: Motor = { p, n, s, R: rd.num("Ra"), L: rd.num("La"), K: rd.num("K"), i0: 0, ii: 0 };
        motors.push(mo);
        const b = rd.num("b");
        if (b > 0) res.push({ a: s, b: GND, G: b });
        outA.push({ sig: sigOut(ci, "i"), f: (x) => x[mo.ii] });
        outA.push({ sig: sigOut(ci, "tau"), f: (x) => mo.K * x[mo.ii] });
        outA.push({ sig: sigOut(ci, "w"), f: (x) => vState(s, x) });
        outA.push({ sig: sigOut(ci, "th"), f: (x) => xState(s, x) });
        break;
      }
      case "elec.diode":
      case "elec.led":
      case "elec.zener": {
        const a = refOf(id, "a");
        const b = refOf(id, "b");
        const dp: DiodeP = { Is: rd.num("Is"), nVt: rd.num("n") * VT, Vz: t === "elec.zener" ? rd.num("Vz") : 0 };
        dios.push({ a, b, P: dp });
        outB.push({ sig: sigOut(ci, "i"), f: (_x, V) => dioI(V(a) - V(b), dp) });
        outB.push({ sig: sigOut(ci, "v"), f: (_x, V) => V(a) - V(b) });
        bIds.add(id);
        break;
      }
      case "elec.npn":
      case "elec.pnp": {
        const c = refOf(id, "c");
        const b = refOf(id, "b");
        const e = refOf(id, "e");
        const pol: 1 | -1 = t === "elec.npn" ? 1 : -1;
        const bp: BjtP = { Is: rd.num("Is"), bf: rd.num("bf"), br: rd.num("br"), VA: rd.num("VA") };
        bjts.push({ c, b, e, p: pol, P: bp });
        const ev = (V: (r: Ref) => number) => {
          bjt(pol * (V(b) - V(e)), pol * (V(b) - V(c)), bp, bjtScratch);
          return bjtScratch;
        };
        outB.push({ sig: sigOut(ci, "ic"), f: (_x, V) => ev(V).ic });
        outB.push({ sig: sigOut(ci, "ib"), f: (_x, V) => ev(V).ib });
        outB.push({ sig: sigOut(ci, "vbe"), f: (_x, V) => pol * (V(b) - V(e)) });
        outB.push({ sig: sigOut(ci, "vce"), f: (_x, V) => pol * (V(c) - V(e)) });
        bIds.add(id);
        break;
      }
      case "elec.nmos":
      case "elec.pmos": {
        const d = refOf(id, "d");
        const g = refOf(id, "g");
        const s0 = refOf(id, "s");
        const pol: 1 | -1 = t === "elec.nmos" ? 1 : -1;
        const mp: MosP = { K: rd.num("K"), Vth: rd.num("Vth"), lam: rd.num("lam") };
        moss.push({ d, g, s: s0, p: pol, P: mp });
        outB.push({ sig: sigOut(ci, "id"), f: (_x, V) => mosId(pol, V(d), V(g), V(s0), mp) });
        outB.push({ sig: sigOut(ci, "vgs"), f: (_x, V) => pol * (V(g) - V(s0)) });
        outB.push({ sig: sigOut(ci, "vds"), f: (_x, V) => pol * (V(d) - V(s0)) });
        bIds.add(id);
        break;
      }
      case "elec.opamp": {
        const p0 = refOf(id, "p");
        const n0 = refOf(id, "n");
        const o0 = refOf(id, "o");
        const lo = rd.num("vneg"),
          hi = rd.num("vpos");
        if (!(hi > lo)) return fail(`${nameOf(ci)}: a saturação positiva precisa ser maior que a negativa.`, [id]);
        ops.push({ p: p0, n: n0, o: o0, A: rd.num("A0"), lo, hi, row: 0 });
        outB.push({ sig: sigOut(ci, "vo"), f: (_x, V) => V(o0) });
        outB.push({ sig: sigOut(ci, "vd"), f: (_x, V) => V(p0) - V(n0) });
        bIds.add(id);
        break;
      }
      case "elec.switch": {
        const idx = ctx.sigIn(id, "u");
        if (idx < 0) return fail(`A entrada "u" de ${nameOf(ci)} está sem conexão.`, [id]);
        const sw: Swi = { a: refOf(id, "a"), b: refOf(id, "b"), Gon: 1 / rd.num("Ron"), Goff: 1 / rd.num("Roff"), iq: 0, onLow: false };
        plainSws.push({ sw, inp: idx });
        outB.push({ sig: sigOut(ci, "i"), f: (x, V) => (x[sw.iq] > 0.5 ? sw.Gon : sw.Goff) * (V(sw.a) - V(sw.b)) });
        bIds.add(id);
        break;
      }
      case "elec.timer555": {
        const sw: Swi = { a: refOf(id, "dis"), b: GND, Gon: 1 / rd.num("rdis"), Goff: 0, iq: 0, onLow: true };
        tims.push({ thr: refOf(id, "thr"), trig: refOf(id, "trig"), vcc: rd.num("vcc"), rst: ctx.sigIn(id, "rst"), q0: rd.num("q0"), sw });
        outA.push({ sig: sigOut(ci, "out"), f: (x) => x[sw.iq] });
        break;
      }
      default:
        break; // ground, engrenagens: só estrutura
    }
  }

  // ---- índices dos estados
  const capList = [...caps.values()];
  const nW = capList.length;
  let nX = 0;
  capList.forEach((c, k) => {
    c.iw = k;
    if (c.pos) c.ix = nW + nX++;
  });
  fcaps.forEach((f, k) => (f.iv = nW + nX + k));
  const iBase = nW + nX + fcaps.length;
  inds.forEach((d, k) => (d.ii = iBase + k));
  motors.forEach((d, k) => (d.ii = iBase + inds.length + k));
  // Estados discretos (derivada zero): chaves e 555.
  const sw0 = iBase + inds.length + motors.length;
  const allSw: Swi[] = [...plainSws.map((q) => q.sw), ...tims.map((q) => q.sw)];
  allSw.forEach((q, k) => (q.iq = sw0 + k));
  const nStates = sw0 + allSw.length;
  const nGuards = plainSws.length + 3 * tims.length;
  const nonlinear = dios.length + bjts.length + moss.length + ops.length > 0;

  // ---- matriz da análise nodal modificada
  const K = nW + fcaps.length + vs.length + ops.length;
  const N = M + K;
  const rowCap = (k: number) => M + k;
  const rowFC = (k: number) => M + nW + k;
  const rowVS = (k: number) => M + nW + fcaps.length + k;
  const rowOP = (k: number) => M + nW + fcaps.length + vs.length + k;
  ops.forEach((q, k) => (q.row = rowOP(k)));
  const A0 = new Float64Array(N * N);
  const addTo = (Am: Float64Array, r: number, c: number, v: number) => void (Am[r * N + c] += v);
  const stampG = (Am: Float64Array, a: Ref, b: Ref, G: number) => {
    if (a.m >= 0) {
      addTo(Am, a.m, a.m, G * a.f * a.f);
      if (b.m >= 0) addTo(Am, a.m, b.m, -G * a.f * b.f);
    }
    if (b.m >= 0) {
      addTo(Am, b.m, b.m, G * b.f * b.f);
      if (a.m >= 0) addTo(Am, b.m, a.m, -G * a.f * b.f);
    }
  };
  for (const e of res) stampG(A0, e.a, e.b, e.G);
  capList.forEach((c, k) => {
    addTo(A0, c.m, rowCap(k), 1);
    addTo(A0, rowCap(k), c.m, 1);
  });
  const stampVC = (row: number, a: Ref, b: Ref) => {
    if (a.m >= 0) {
      addTo(A0, a.m, row, a.f);
      addTo(A0, row, a.m, a.f);
    }
    if (b.m >= 0) {
      addTo(A0, b.m, row, -b.f);
      addTo(A0, row, b.m, -b.f);
    }
  };
  fcaps.forEach((f, k) => stampVC(rowFC(k), f.a, f.b));
  vs.forEach((v, k) => stampVC(rowVS(k), v.a, v.b));
  // Saída do amp-op: linha de fonte de tensão (a parte não linear entra no resíduo).
  ops.forEach((q) => stampVC(q.row, q.o, GND));

  // Matriz de cada combinação de chaves (cache). Os valores de cada chave vêm do estado discreto.
  const swOn = (q: Swi, x: Float64Array, o: number) => (q.onLow ? x[o + q.iq] < 0.5 : x[o + q.iq] > 0.5);
  const patterns = new Map<number, { A: Float64Array; lu: LU | null }>();
  const patternKey = (x: Float64Array, o: number) => {
    let key = 0;
    for (let k = 0; k < allSw.length; k++) if (swOn(allSw[k], x, o)) key += 2 ** k;
    return key;
  };
  const buildPattern = (key: number) => {
    const Am = Float64Array.from(A0);
    allSw.forEach((q, k) => {
      const G = Math.floor(key / 2 ** k) % 2 === 1 ? q.Gon : q.Goff;
      if (G > 0) stampG(Am, q.a, q.b, G);
    });
    return Am;
  };
  const singularMessage = (col: number): { error: string; ids: string[] } => {
    if (col < M) {
      const nets = masterNets[col] ?? [];
      const who = [...new Set(nets.flatMap((n) => st.names[n]))].join(", ");
      const d = ctx.netDomain(nets[0] ?? 0);
      const what = d === "elec" ? "a tensão" : d === "rot" ? "a velocidade angular" : "a velocidade";
      const fix = d === "elec" ? "um resistor ou capacitor" : "uma massa/inércia ou um amortecedor";
      return fail(`Não dá para determinar ${what} do ponto onde estão ${who}. Falta ${fix} nesse ponto: molas e indutores sozinhos não fixam o valor.`);
    }
    return fail("As ligações físicas formam um laço impossível: fontes de velocidade/tensão, massas ou capacitores estão em conflito (por exemplo, uma fonte de tensão em paralelo com um capacitor, ou duas fontes no mesmo ponto). Coloque um resistor ou amortecedor no caminho.");
  };

  // Verificação de estrutura. Com dispositivos não lineares, cada um entra com uma condutância típica entre seus terminais.
  const checkMatrix = (key: number): { error: string; ids: string[] } | null => {
    const Am = buildPattern(key);
    const G = 1e-3;
    for (const d of dios) stampG(Am, d.a, d.b, G);
    for (const q of bjts) {
      stampG(Am, q.b, q.e, G);
      stampG(Am, q.b, q.c, G);
      stampG(Am, q.c, q.e, G);
    }
    for (const q of moss) {
      stampG(Am, q.d, q.s, G);
    }
    for (const q of ops) {
      if (q.p.m >= 0) addTo(Am, q.row, q.p.m, -q.p.f);
      if (q.n.m >= 0) addTo(Am, q.row, q.n.m, q.n.f);
    }
    try {
      if (N > 0) luFactor(Am, N);
    } catch (e) {
      if (!(e instanceof SingularMatrixError)) throw e;
      return singularMessage(e.column);
    }
    return null;
  };
  // Portas dos MOSFETs só têm acoplamento: o nó da porta precisa de outro componente (resistor, fonte...).
  for (let key = 0; key < 2 ** Math.min(allSw.length, 4); key++) {
    const bad = checkMatrix(allSw.length > 4 ? 0 : key);
    if (bad) return bad;
  }
  const getPattern = (key: number) => {
    let q = patterns.get(key);
    if (!q) {
      const Am = buildPattern(key);
      let lu: LU | null = null;
      if (!nonlinear && N > 0) {
        try {
          lu = luFactor(Am, N);
        } catch (e) {
          if (!(e instanceof SingularMatrixError)) throw e;
          throw new SolverError("no-converge", 0, "Com esta combinação de chaves o circuito não tem solução única.");
        }
      }
      q = { A: Am, lu };
      patterns.set(key, q);
    }
    return q;
  };
  // Pré-fatora a combinação inicial (todas as chaves no estado zero).
  const initKey = (() => {
    let key = 0;
    allSw.forEach((q, k) => {
      if (q.onLow) key += 2 ** k;
    });
    return key;
  })();
  getPattern(initKey);

  const rhs = new Float64Array(N);
  const z = new Float64Array(N);
  const Vz = (r: Ref) => (r.m < 0 ? 0 : r.f * z[r.m]);

  // ---- Newton-Raphson para os dispositivos não lineares
  const Fres = new Float64Array(N);
  const Ftry = new Float64Array(N);
  const Jm = new Float64Array(N * N);
  const dz = new Float64Array(N);
  const zt = new Float64Array(N);
  const zGood = new Float64Array(N);
  const dOut = { i: 0, g: 0 };
  const mOut = { id: 0, gm: 0, gds: 0 };
  const oOut = { v: 0, d: 0 };
  const bOut: BjtOut = { ic: 0, ib: 0, dicVbe: 0, dicVbc: 0, dibVbe: 0, dibVbc: 0 };
  const fAdd = (Fo: Float64Array, r: Ref, i: number) => {
    if (r.m >= 0) Fo[r.m] += r.f * i;
  };
  const jAdd = (Jo: Float64Array, r: Ref, c: Ref, g: number) => {
    if (r.m >= 0 && c.m >= 0) Jo[r.m * N + c.m] += r.f * g * c.f;
  };
  const evalDevices = (zv: Float64Array, Fo: Float64Array, Jo: Float64Array | null) => {
    const Vr = (r: Ref) => (r.m < 0 ? 0 : r.f * zv[r.m]);
    for (const d of dios) {
      diode(Vr(d.a) - Vr(d.b), d.P, dOut);
      fAdd(Fo, d.a, dOut.i);
      fAdd(Fo, d.b, -dOut.i);
      if (Jo) {
        jAdd(Jo, d.a, d.a, dOut.g);
        jAdd(Jo, d.a, d.b, -dOut.g);
        jAdd(Jo, d.b, d.a, -dOut.g);
        jAdd(Jo, d.b, d.b, dOut.g);
      }
    }
    for (const q of bjts) {
      const vb = Vr(q.b),
        ve = Vr(q.e),
        vc = Vr(q.c);
      bjt(q.p * (vb - ve), q.p * (vb - vc), q.P, bOut);
      const ic = q.p * bOut.ic,
        ib = q.p * bOut.ib;
      fAdd(Fo, q.c, ic);
      fAdd(Fo, q.b, ib);
      fAdd(Fo, q.e, -(ic + ib));
      if (Jo) {
        // Derivadas em relação a Vb, Vc, Ve (o fator de polaridade se cancela).
        const cB = bOut.dicVbe + bOut.dicVbc,
          cE = -bOut.dicVbe,
          cC = -bOut.dicVbc;
        const bB = bOut.dibVbe + bOut.dibVbc,
          bE = -bOut.dibVbe,
          bC = -bOut.dibVbc;
        jAdd(Jo, q.c, q.b, cB);
        jAdd(Jo, q.c, q.e, cE);
        jAdd(Jo, q.c, q.c, cC);
        jAdd(Jo, q.b, q.b, bB);
        jAdd(Jo, q.b, q.e, bE);
        jAdd(Jo, q.b, q.c, bC);
        jAdd(Jo, q.e, q.b, -(cB + bB));
        jAdd(Jo, q.e, q.e, -(cE + bE));
        jAdd(Jo, q.e, q.c, -(cC + bC));
      }
    }
    for (const q of moss) {
      const vg = q.p * Vr(q.g),
        vd = q.p * Vr(q.d),
        vs0 = q.p * Vr(q.s);
      // Dreno e fonte são simétricos: o terminal de menor tensão (no sentido do canal) faz o papel de fonte.
      const swap = vd < vs0;
      const vsrc = swap ? vd : vs0;
      mosfet(vg - vsrc, Math.abs(vd - vs0), q.P, mOut);
      // id positivo entra no terminal "dreno efetivo" (o de maior tensão) e sai pelo outro.
      const hi = swap ? q.s : q.d;
      const lo = swap ? q.d : q.s;
      const id = q.p * (mOut.id + GMIN_MOS * Math.abs(vd - vs0));
      const gds = mOut.gds + GMIN_MOS;
      fAdd(Fo, hi, id);
      fAdd(Fo, lo, -id);
      if (Jo) {
        // id(vgs = Vg − Vlo, vds = Vhi − Vlo)
        jAdd(Jo, hi, q.g, mOut.gm);
        jAdd(Jo, hi, hi, gds);
        jAdd(Jo, hi, lo, -mOut.gm - gds);
        jAdd(Jo, lo, q.g, -mOut.gm);
        jAdd(Jo, lo, hi, -gds);
        jAdd(Jo, lo, lo, mOut.gm + gds);
      }
    }
    for (const q of ops) {
      opamp(Vr(q.p) - Vr(q.n), q.A, q.lo, q.hi, oOut);
      Fo[q.row] -= oOut.v;
      if (Jo) {
        if (q.p.m >= 0) Jo[q.row * N + q.p.m] -= oOut.d * q.p.f;
        if (q.n.m >= 0) Jo[q.row * N + q.n.m] += oOut.d * q.n.f;
      }
    }
  };
  let rhsScale = 1;
  const residual = (Am: Float64Array, zv: Float64Array, Fo: Float64Array, Jo: Float64Array | null) => {
    for (let i = 0; i < N; i++) {
      let sum = -rhs[i];
      const row = i * N;
      for (let j = 0; j < N; j++) sum += Am[row + j] * zv[j];
      Fo[i] = sum;
    }
    if (Jo) Jo.set(Am);
    evalDevices(zv, Fo, Jo);
  };
  const maxAbs = (v: Float64Array) => {
    let m = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.abs(v[i]);
      if (a > m || Number.isNaN(a)) m = a;
    }
    return m;
  };
  // Limitação de junção (como o pnjlim do SPICE): a exponencial não pode crescer demais num único passo de Newton.
  const nJ = dios.length * 2 + bjts.length * 2;
  const aOld = new Float64Array(nJ);
  const aNew = new Float64Array(nJ);
  const aCrit = new Float64Array(nJ);
  {
    let k = 0;
    for (const d of dios) {
      aCrit[k++] = Math.log(d.P.nVt / (Math.SQRT2 * d.P.Is));
      aCrit[k++] = Math.log(d.P.nVt / (Math.SQRT2 * 5e-3));
    }
    for (const q of bjts) {
      aCrit[k++] = Math.log(VT / (Math.SQRT2 * q.P.Is));
      aCrit[k++] = Math.log(VT / (Math.SQRT2 * q.P.Is));
    }
  }
  const junctionArgs = (zv: Float64Array, out: Float64Array) => {
    const Vr = (r: Ref) => (r.m < 0 ? 0 : r.f * zv[r.m]);
    let k = 0;
    for (const d of dios) {
      const v = Vr(d.a) - Vr(d.b);
      out[k++] = v / d.P.nVt;
      out[k++] = d.P.Vz > 0 ? -(v + d.P.Vz) / d.P.nVt : -1e9;
    }
    for (const q of bjts) {
      const vb = Vr(q.b);
      out[k++] = (q.p * (vb - Vr(q.e))) / VT;
      out[k++] = (q.p * (vb - Vr(q.c))) / VT;
    }
  };
  const limitArg = (an: number, ao: number, ac: number) => {
    if (an > ac && Math.abs(an - ao) > 2) {
      if (ao > 0) {
        const arg = 1 + (an - ao);
        return arg > 0 ? ao + Math.log(arg) : ac;
      }
      return Math.log(an);
    }
    return an;
  };
  const newton = (Am: Float64Array, safe: boolean) => {
    let rmax = 0;
    for (let i = 0; i < N; i++) rmax = Math.max(rmax, Math.abs(rhs[i]));
    rhsScale = 1 + rmax;
    const maxIt = nJ === 0 && !safe ? 40 : 150;
    for (let it = 0; it < maxIt; it++) {
      residual(Am, z, Fres, Jm);
      const fn = maxAbs(Fres);
      if (!Number.isFinite(fn)) throw new SolverError("non-finite", 0, "O cálculo gerou um valor inválido (NaN ou infinito).");
      if (fn <= 1e-12 * rhsScale && it > 0) return;
      let lu: LU;
      try {
        lu = luFactor(Jm, N);
      } catch (e) {
        if (!(e instanceof SingularMatrixError)) throw e;
        // Dispositivos cortados: reforça a diagonal dos nós e tenta de novo.
        for (let i = 0; i < M; i++) Jm[i * N + i] += 1e-9;
        lu = luFactor(Jm, N);
      }
      luSolve(lu, Fres, dz);
      let lam = 1;
      if (nJ > 0) {
        // Passo completo candidato; limita o crescimento das exponenciais das junções.
        junctionArgs(z, aOld);
        for (let i = 0; i < N; i++) zt[i] = z[i] - dz[i];
        junctionArgs(zt, aNew);
        for (let j = 0; j < nJ; j++) {
          const d = aNew[j] - aOld[j];
          if (d > 2) {
            const lj = (limitArg(aNew[j], aOld[j], aCrit[j]) - aOld[j]) / d;
            if (lj < lam) lam = Math.max(lj, 1e-3);
          }
        }
      } else if (safe) {
        let ok = false;
        for (let k = 0; k < 14; k++) {
          for (let i = 0; i < N; i++) zt[i] = z[i] - lam * dz[i];
          residual(Am, zt, Ftry, null);
          const f2 = maxAbs(Ftry);
          if (f2 <= fn * (1 - 1e-4 * lam) || f2 <= 1e-12 * rhsScale) {
            ok = true;
            break;
          }
          lam *= 0.5;
        }
        // Funções que saturam (amp-op em malha aberta): o passo completo "passa" e o seguinte corrige.
        if (!ok) lam = 1;
      }
      // Sem junções e sem modo seguro: passo de Newton completo (funções que saturam, como o amp-op em malha aberta, pedem isso).
      let stepRel = 0;
      for (let i = 0; i < N; i++) {
        const nz = z[i] - lam * dz[i];
        stepRel = Math.max(stepRel, Math.abs(nz - z[i]) / (1 + Math.abs(z[i])));
        z[i] = nz;
      }
      if (stepRel < 1e-10 && (nJ === 0 || lam > 0.999)) return;
    }
    throw new SolverError("no-converge", 0, "O circuito não convergiu.");
  };

  const solve = (x: Float64Array, o: number, sig: Float64Array) => {
    if (N === 0) return;
    rhs.fill(0);
    const cur = (a: Ref, b: Ref, q: number) => {
      if (a.m >= 0) rhs[a.m] -= a.f * q;
      if (b.m >= 0) rhs[b.m] += b.f * q;
    };
    for (const d of inds) cur(d.a, d.b, x[o + d.ii]);
    for (const s of isrc) cur(s.a, s.b, s.sign * sig[s.inp]);
    for (const m of motors) {
      cur(m.p, m.n, x[o + m.ii]);
      cur(m.s, GND, -m.K * x[o + m.ii]);
    }
    capList.forEach((c, k) => (rhs[rowCap(k)] = x[o + c.iw]));
    fcaps.forEach((f, k) => (rhs[rowFC(k)] = x[o + f.iv]));
    vs.forEach((v, k) => (rhs[rowVS(k)] = sig[v.inp]));
    const pat = getPattern(allSw.length ? patternKey(x, o) : 0);
    if (nonlinear) {
      // Parte da última solução boa. Se um estado de teste absurdo atrapalhar, volta a ela antes de desistir.
      try {
        newton(pat.A, false);
      } catch (e) {
        if (!(e instanceof SolverError)) throw e;
        z.set(zGood);
        try {
          newton(pat.A, true);
        } catch (e2) {
          z.set(zGood);
          throw e2;
        }
      }
      zGood.set(z);
    } else luSolve(pat.lu!, rhs, z);
  };

  // x deslocado: as saídas de A usam índices relativos, então copiamos a janela.
  const win = new Float64Array(nStates);
  const view = (x: Float64Array, o: number) => {
    for (let i = 0; i < nStates; i++) win[i] = x[o + i];
    return win;
  };

  // ---- sinais das redes (observáveis em B)
  const netOuts: { sig: number; ref: Ref }[] = [];
  for (const [net, sig] of netSignal) netOuts.push({ sig, ref: { m: st.groupM[net], f: st.factor[net] } });

  // ---- escala de tempo mínima (limita o passo do RK45)
  let minTs = Infinity;
  const Cmin = Math.min(...capList.map((c) => c.C), ...fcaps.map((f) => f.C));
  const Lmin = Math.min(...inds.map((d) => d.L), ...motors.map((m) => m.L));
  if (Number.isFinite(Cmin) && Number.isFinite(Lmin)) minTs = Math.min(minTs, 0.2 * Math.sqrt(Cmin * Lmin));
  for (const m of motors) if (m.R > 0) minTs = Math.min(minTs, m.L / m.R);
  const Gsum = new Float64Array(M);
  for (const e of res) {
    if (e.a.m >= 0) Gsum[e.a.m] += e.G * e.a.f * e.a.f;
    if (e.b.m >= 0) Gsum[e.b.m] += e.G * e.b.f * e.b.f;
  }
  for (const c of capList) if (Gsum[c.m] > 0) minTs = Math.min(minTs, c.C / Gsum[c.m]);

  const hasUnforced = M > nW;
  const feedthroughB = vs.length > 0 || (isrc.length > 0 && hasUnforced) || (nonlinear && inputs.length > 0);

  return {
    key: [nW, nX, fcaps.length, inds.length, motors.length, vs.length, isrc.length, M, dios.length, bjts.length, moss.length, ops.length, plainSws.length, tims.length].join(","),
    nGuards,
    guards: (x, o, sig, g, go) => {
      let k = 0;
      for (const q of plainSws) g[go + k++] = sig[q.inp] - 0.5;
      if (tims.length) {
        solve(x, o, sig);
        for (const q of tims) {
          g[go + k++] = Vz(q.trig) - q.vcc / 3;
          g[go + k++] = Vz(q.thr) - (2 * q.vcc) / 3;
          g[go + k++] = q.rst >= 0 ? sig[q.rst] - 0.5 : 1;
        }
      }
    },
    fire: (x, o, sig, prev, next, go, init) => {
      void sig;
      let k = go;
      for (const q of plainSws) {
        x[o + q.sw.iq] = next[k] ? 1 : 0;
        k++;
      }
      for (const q of tims) {
        let changed = init;
        for (let i = 0; i < 3; i++) if (prev[k + i] !== next[k + i]) changed = true;
        if (changed) {
          const trigLow = next[k] === 0,
            thrHigh = next[k + 1] === 1,
            rstActive = q.rst >= 0 && next[k + 2] === 0;
          const cur = x[o + q.sw.iq];
          if (rstActive) x[o + q.sw.iq] = 0;
          else if (trigLow) x[o + q.sw.iq] = 1;
          else if (thrHigh) x[o + q.sw.iq] = 0;
          else x[o + q.sw.iq] = init ? q.q0 : cur;
        }
        k += 3;
      }
    },
    nStates,
    inputs: [...new Set(inputs)],
    aSigs: outA.map((o) => o.sig),
    bSigs: [...outB.map((o) => o.sig), ...netOuts.map((o) => o.sig)],
    bIds: [...bIds],
    feedthroughB,
    minTs,
    x0: () => {
      const x = new Array<number>(nStates).fill(0);
      capList.forEach((c) => {
        x[c.iw] = c.wNum / c.C;
        if (c.pos) x[c.ix] = c.xNum / c.C;
      });
      for (const f of fcaps) x[f.iv] = f.v0;
      for (const d of inds) x[d.ii] = d.i0;
      for (const m of motors) x[m.ii] = m.i0;
      return x;
    },
    evalA: (x, o, sig) => {
      const w = view(x, o);
      for (const out of outA) sig[out.sig] = out.f(w);
    },
    evalB: (x, o, sig) => {
      solve(x, o, sig);
      const w = view(x, o);
      for (const out of outB) sig[out.sig] = out.f(w, Vz);
      for (const n of netOuts) sig[n.sig] = Vz(n.ref);
    },
    der: (x, o, sig, dx) => {
      if (nStates === 0) return;
      solve(x, o, sig);
      capList.forEach((c, k) => {
        dx[o + c.iw] = z[rowCap(k)] / c.C;
        if (c.pos) dx[o + c.ix] = x[o + c.iw];
      });
      fcaps.forEach((f, k) => (dx[o + f.iv] = z[rowFC(k)] / f.C));
      for (const d of inds) dx[o + d.ii] = (Vz(d.a) - Vz(d.b)) / d.L;
      for (const m of motors) dx[o + m.ii] = (Vz(m.p) - Vz(m.n) - m.R * x[o + m.ii] - m.K * Vz(m.s)) / m.L;
    },
  };
}
