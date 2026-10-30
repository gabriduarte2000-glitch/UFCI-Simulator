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
import { luFactor, luSolve, SingularMatrixError, type LU } from "./linalg";
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

interface Built {
  key: string;
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
  const nStates = iBase + inds.length + motors.length;

  // ---- matriz da análise nodal modificada
  const K = nW + fcaps.length + vs.length;
  const N = M + K;
  const rowCap = (k: number) => M + k;
  const rowFC = (k: number) => M + nW + k;
  const rowVS = (k: number) => M + nW + fcaps.length + k;
  const A = new Float64Array(N * N);
  const add = (r: number, c: number, v: number) => void (A[r * N + c] += v);
  for (const e of res) {
    const { a, b, G } = e;
    if (a.m >= 0) {
      add(a.m, a.m, G * a.f * a.f);
      if (b.m >= 0) add(a.m, b.m, -G * a.f * b.f);
    }
    if (b.m >= 0) {
      add(b.m, b.m, G * b.f * b.f);
      if (a.m >= 0) add(b.m, a.m, -G * a.f * b.f);
    }
  }
  capList.forEach((c, k) => {
    add(c.m, rowCap(k), 1);
    add(rowCap(k), c.m, 1);
  });
  const stampVC = (row: number, a: Ref, b: Ref) => {
    if (a.m >= 0) {
      add(a.m, row, a.f);
      add(row, a.m, a.f);
    }
    if (b.m >= 0) {
      add(b.m, row, -b.f);
      add(row, b.m, -b.f);
    }
  };
  fcaps.forEach((f, k) => stampVC(rowFC(k), f.a, f.b));
  vs.forEach((v, k) => stampVC(rowVS(k), v.a, v.b));

  let lu: LU | null = null;
  if (N > 0) {
    try {
      lu = luFactor(A, N);
    } catch (e) {
      if (!(e instanceof SingularMatrixError)) throw e;
      const col = e.column;
      if (col < M) {
        const nets = masterNets[col] ?? [];
        const who = [...new Set(nets.flatMap((n) => st.names[n]))].join(", ");
        const d = ctx.netDomain(nets[0] ?? 0);
        const what = d === "elec" ? "a tensão" : d === "rot" ? "a velocidade angular" : "a velocidade";
        const fix = d === "elec" ? "um resistor ou capacitor" : "uma massa/inércia ou um amortecedor";
        return fail(`Não dá para determinar ${what} do ponto onde estão ${who}. Falta ${fix} nesse ponto: molas e indutores sozinhos não fixam o valor.`);
      }
      return fail("As ligações físicas formam um laço impossível: fontes de velocidade/tensão, massas ou capacitores estão em conflito (por exemplo, uma fonte de tensão em paralelo com um capacitor, ou duas fontes no mesmo ponto). Coloque um resistor ou amortecedor no caminho.");
    }
  }

  const rhs = new Float64Array(N);
  const z = new Float64Array(N);
  const Vz = (r: Ref) => (r.m < 0 ? 0 : r.f * z[r.m]);
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
    luSolve(lu!, rhs, z);
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
  const feedthroughB = vs.length > 0 || (isrc.length > 0 && hasUnforced);

  return {
    key: [nW, nX, fcaps.length, inds.length, motors.length, vs.length, isrc.length, M].join(","),
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
