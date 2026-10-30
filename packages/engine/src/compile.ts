// Compilador: transforma o arquivo do projeto em um modelo executável.
// Etapas: validar parâmetros e conexões, montar redes físicas, ordenar os blocos,
// detectar laços algébricos, alocar estados.

import "./components";
import { getDef, makeReader, portsOf, type ComponentDef } from "./components/registry";
import type { CompInfo, PhysCtx, Unit } from "./internal";
import { buildPhysical } from "./physical";
import type { Deriv } from "./solvers";
import type {
  Diagnostic,
  Domain,
  ParamDef,
  PortDef,
  ProjectIR,
  SignalMeta,
} from "./types";

export const DOMAIN_NAME: Record<Domain, string> = {
  signal: "sinal",
  mech: "translação",
  rot: "rotação",
  elec: "elétrica",
};

export interface SetParamResult {
  ok: boolean;
  /** A mudança altera a estrutura. É preciso recompilar e reiniciar. */
  needsReset?: boolean;
  /** A mudança só vale ao reiniciar (condição inicial). */
  appliedNow?: boolean;
  message?: string;
}

export interface CompiledModel {
  nx: number;
  x0(): Float64Array;
  f: Deriv;
  /** Calcula todos os sinais em (t, x). O vetor devolvido é reaproveitado: copie se for guardar. */
  evaluate(t: number, x: Float64Array): Float64Array;
  signals: SignalMeta[];
  /** Sinal que cada conexão carrega (valor mostrado no fio). */
  edgeSignal: Record<string, number | null>;
  breakpoints(t0: number, tf: number): number[];
  suggestedMaxStep(t0: number, tf: number): number;
  setParam(compId: string, key: string, value: number | boolean | string): SetParamResult;
  /** Número de estados de cada componente, para depuração e testes. */
  stateCount(compId: string): number;
}

export interface CompileResult {
  ok: boolean;
  model?: CompiledModel;
  diagnostics: Diagnostic[];
}

/** Verifica se duas portas podem ser ligadas. Devolve a mensagem didática em caso de erro. */
export function checkPortPair(
  a: PortDef,
  aOwner: string,
  b: PortDef,
  bOwner: string,
): { ok: true } | { ok: false; code: string; message: string } {
  const fail = (code: string, message: string) => ({ ok: false as const, code, message });
  if (a.domain === "signal" && b.domain === "signal") {
    if (a.dir === "out" && b.dir === "out")
      return fail("out-out", "Duas saídas não se ligam entre si. Ligue uma saída a uma entrada.");
    if (a.dir === "in" && b.dir === "in")
      return fail("in-in", "Duas entradas não se ligam entre si. Ligue uma saída a uma entrada.");
    return { ok: true };
  }
  if (a.domain === "signal" && b.domain !== "signal") {
    return fail(
      "signal-phys",
      `Este fio leva um número, mas a porta "${b.label}" de ${bOwner} espera uma conexão física (${DOMAIN_NAME[b.domain]}). Use um componente que converta o sinal, como uma fonte comandada por sinal.`,
    );
  }
  if (a.domain !== "signal" && b.domain === "signal") {
    return fail(
      "phys-signal",
      `A porta "${a.label}" de ${aOwner} é física (${DOMAIN_NAME[a.domain]}) e não gera um número. Use um sensor para converter a grandeza em sinal.`,
    );
  }
  if (a.domain !== b.domain) {
    const extra =
      (a.domain === "mech" && b.domain === "rot") || (a.domain === "rot" && b.domain === "mech")
        ? " Translação e rotação não se ligam direto."
        : "";
    return fail(
      "domain-mismatch",
      `As portas são de tipos diferentes: ${DOMAIN_NAME[a.domain]} e ${DOMAIN_NAME[b.domain]}.${extra}`,
    );
  }
  return { ok: true };
}

export function validateParam(pd: ParamDef, value: unknown): string | null {
  switch (pd.kind) {
    case "number":
    case "int": {
      if (typeof value !== "number" || !Number.isFinite(value)) return `${pd.label} precisa ser um número.`;
      if (pd.kind === "int" && !Number.isInteger(value)) return `${pd.label} precisa ser um número inteiro.`;
      if (pd.min !== undefined && value < pd.min) return `${pd.label} precisa ser maior ou igual a ${pd.min}.`;
      if (pd.max !== undefined && value > pd.max) return `${pd.label} precisa ser menor ou igual a ${pd.max}.`;
      return null;
    }
    case "bool":
      return typeof value === "boolean" ? null : `${pd.label} precisa ser verdadeiro ou falso.`;
    case "select":
      return pd.options?.some((o) => o.value === value) ? null : `${pd.label}: opção inválida.`;
    case "text":
      return typeof value === "string" ? null : `${pd.label} precisa ser um texto.`;
  }
}

class UnionFind {
  parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

export function compile(project: ProjectIR): CompileResult {
  const diags: Diagnostic[] = [];
  const err = (code: string, message: string, extra: Partial<Diagnostic> = {}) =>
    diags.push({ severity: "error", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<Diagnostic> = {}) =>
    diags.push({ severity: "warning", code, message, ...extra });

  // ---- configuração da simulação
  const sc = project.simulation;
  if (!sc || !["rk4", "rk45", "euler"].includes(sc.solver)) err("sim-solver", "Escolha um método de integração válido.");
  if (sc) {
    if (!(sc.tf > sc.t0)) err("sim-time", "O tempo final precisa ser maior que o tempo inicial.");
    if (!(sc.h > 0)) err("sim-step", "O passo de integração precisa ser maior que zero.");
    if (!(sc.rtol > 0) || !(sc.atol > 0)) err("sim-tol", "As tolerâncias de erro precisam ser maiores que zero.");
    if (sc.h > 0 && sc.tf > sc.t0 && (sc.tf - sc.t0) / sc.h > 5e6)
      err("sim-steps", "Com este passo, a simulação teria mais de 5 milhões de passos. Aumente o passo ou reduza o tempo final.");
  }

  if (project.components.length === 0) {
    err("empty", "O projeto está vazio. Arraste componentes da biblioteca para a área de trabalho.");
    return { ok: false, diagnostics: diags };
  }

  // ---- componentes
  let revCounter = 0;
  const revGetter = () => revCounter;
  const infos: CompInfo[] = [];
  const byId = new Map<string, CompInfo>();
  for (const inst of project.components) {
    if (byId.has(inst.id)) {
      err("dup-id", `Há dois componentes com o mesmo identificador: ${inst.id}.`, { componentIds: [inst.id] });
      continue;
    }
    const def = getDef(inst.type);
    const name = inst.label ?? inst.id;
    if (!def) {
      err("unknown-type", `O componente "${name}" tem um tipo desconhecido (${inst.type}).`, { componentIds: [inst.id] });
      continue;
    }
    const reader = makeReader(def, inst.params ?? {}, revGetter);
    let bad = false;
    for (const pd of def.params) {
      const v = inst.params?.[pd.key]?.value ?? pd.default;
      const msg = validateParam(pd, v);
      if (msg) {
        err("param", `${name}: ${msg}`, { componentIds: [inst.id] });
        bad = true;
      }
    }
    if (bad) continue;
    let ports: PortDef[];
    try {
      ports = portsOf(def, inst.params ?? {});
    } catch (e) {
      err("param", `${name}: ${(e as Error).message}`, { componentIds: [inst.id] });
      continue;
    }
    const info: CompInfo = { inst, def, reader, ports };
    infos.push(info);
    byId.set(inst.id, info);
  }
  const nameOf = (id: string) => byId.get(id)?.inst.label ?? id;

  // ---- sinais de saída das portas
  const signals: SignalMeta[] = [];
  const outSig = new Map<string, number>();
  for (const ci of infos) {
    for (const p of ci.ports) {
      if (p.domain === "signal" && p.dir === "out") {
        outSig.set(`${ci.inst.id}.${p.name}`, signals.length);
        signals.push({
          id: `${ci.inst.id}.${p.name}`,
          componentId: ci.inst.id,
          label: `${ci.inst.label ?? ci.def.label} · ${p.label}`,
          unit: "",
          kind: "port",
        });
      }
    }
  }

  // ---- conexões
  const drivenBy = new Map<string, number>();
  const connSig: Record<string, number | null> = {};
  const physConns: { id: string; a: string; b: string }[] = [];
  const seenConn = new Set<string>();
  for (const c of project.connections) {
    if (seenConn.has(c.id)) {
      err("dup-conn", `Há duas conexões com o mesmo identificador: ${c.id}.`, { connectionIds: [c.id] });
      continue;
    }
    seenConn.add(c.id);
    const ca = byId.get(c.from.component);
    const cb = byId.get(c.to.component);
    if (!ca || !cb) {
      err("conn-missing", "Há uma conexão ligada a um componente que não existe ou que está com erro.", { connectionIds: [c.id] });
      continue;
    }
    let pa = ca.ports.find((p) => p.name === c.from.port);
    let pb = cb.ports.find((p) => p.name === c.to.port);
    if (!pa || !pb) {
      err("conn-port", `A conexão usa uma porta que não existe em ${nameOf(c.from.component)} ou ${nameOf(c.to.component)}.`, { connectionIds: [c.id] });
      continue;
    }
    let from = c.from;
    let to = c.to;
    let ownerA = ca.inst.label ?? ca.def.label;
    let ownerB = cb.inst.label ?? cb.def.label;
    // Normaliza: saída primeiro.
    if (pa.domain === "signal" && pb.domain === "signal" && pa.dir === "in" && pb.dir === "out") {
      [pa, pb] = [pb, pa];
      [from, to] = [to, from];
      [ownerA, ownerB] = [ownerB, ownerA];
    }
    const chk = checkPortPair(pa, ownerA, pb, ownerB);
    if (!chk.ok) {
      err(chk.code, chk.message, { connectionIds: [c.id], componentIds: [from.component, to.component] });
      continue;
    }
    if (pa.domain === "signal") {
      const key = `${to.component}.${to.port}`;
      if (drivenBy.has(key)) {
        err(
          "multi-driver",
          `A entrada "${pb.label}" de ${ownerB} já recebe outro sinal. Uma entrada recebe um sinal só. Use um somador para combinar sinais.`,
          { connectionIds: [c.id], componentIds: [to.component] },
        );
        continue;
      }
      const idx = outSig.get(`${from.component}.${from.port}`)!;
      drivenBy.set(key, idx);
      connSig[c.id] = idx;
    } else {
      physConns.push({ id: c.id, a: `${from.component}.${from.port}`, b: `${to.component}.${to.port}` });
    }
  }

  // ---- redes físicas
  const uf = new UnionFind();
  const physPortId = new Map<string, number>();
  const physPortInfo: { key: string; domain: Domain }[] = [];
  for (const ci of infos)
    for (const p of ci.ports)
      if (p.dir === "phys") {
        physPortId.set(`${ci.inst.id}.${p.name}`, uf.add());
        physPortInfo.push({ key: `${ci.inst.id}.${p.name}`, domain: p.domain });
      }
  for (const pc of physConns) uf.union(physPortId.get(pc.a)!, physPortId.get(pc.b)!);
  const netIdOfRoot = new Map<number, number>();
  const netDomains: Domain[] = [];
  const netByPort = new Map<string, number>();
  for (const pi of physPortInfo) {
    const root = uf.find(physPortId.get(pi.key)!);
    let nid = netIdOfRoot.get(root);
    if (nid === undefined) {
      nid = netDomains.length;
      netIdOfRoot.set(root, nid);
      netDomains.push(pi.domain);
    }
    netByPort.set(pi.key, nid);
  }

  // ---- unidades
  const units: Unit[] = [];
  const unitOfComp = new Map<string, Unit>();
  const blockImpls = new Map<string, { impl: ReturnType<NonNullable<ComponentDef["block"]>> }>();

  for (const ci of infos) {
    if (!ci.def.block) continue;
    const name = ci.inst.label ?? ci.def.label;
    let impl: ReturnType<NonNullable<ComponentDef["block"]>>;
    try {
      impl = ci.def.block(ci.reader, ci.inst.id);
    } catch (e) {
      err("param", `${name}: ${(e as Error).message}`, { componentIds: [ci.inst.id] });
      continue;
    }
    const inPorts = ci.ports.filter((p) => p.dir === "in");
    const outPorts = ci.ports.filter((p) => p.dir === "out");
    const inputIdx = inPorts.map((p) => {
      const idx = drivenBy.get(`${ci.inst.id}.${p.name}`);
      if (idx === undefined) {
        if (!p.optional)
          err("no-input", `A entrada "${p.label}" de ${name} está sem conexão.`, { componentIds: [ci.inst.id] });
        return -1;
      }
      return idx;
    });
    const producedIdx = outPorts.map((p) => outSig.get(`${ci.inst.id}.${p.name}`)!);
    const slot = { impl };
    blockImpls.set(ci.inst.id, slot);
    const u = new Array<number>(inPorts.length).fill(0);
    const y = new Array<number>(outPorts.length).fill(0);
    const unit: Unit = {
      id: ci.inst.id,
      compIds: [ci.inst.id],
      nStates: impl.nStates,
      off: 0,
      inputIdx,
      producedIdx,
      feedthrough: impl.feedthrough && inPorts.length > 0,
      x0: () => slot.impl.x0(),
      evalOut: (t, x, sig) => {
        const im = slot.impl;
        if (im.feedthrough) for (let i = 0; i < u.length; i++) u[i] = inputIdx[i] >= 0 ? sig[inputIdx[i]] : 0;
        else u.fill(0);
        im.out(t, x, unit.off, u, y);
        for (let j = 0; j < producedIdx.length; j++) sig[producedIdx[j]] = y[j];
      },
      evalDer: (t, x, sig, dx) => {
        const im = slot.impl;
        if (im.nStates === 0) return;
        for (let i = 0; i < u.length; i++) u[i] = inputIdx[i] >= 0 ? sig[inputIdx[i]] : 0;
        im.der(t, x, unit.off, u, dx);
      },
      breakpoints: (t0, tf) => slot.impl.breakpoints?.(t0, tf) ?? [],
      minTimescale: () => slot.impl.minTimescale?.() ?? Infinity,
      refresh: () => {
        let next: typeof impl;
        try {
          next = ci.def.block!(ci.reader, ci.inst.id);
        } catch (e) {
          return { error: `${name}: ${(e as Error).message}` };
        }
        if (next.nStates !== slot.impl.nStates || (next.feedthrough && inPorts.length > 0) !== unit.feedthrough) return "reset";
        slot.impl = next;
        return "ok";
      },
    };
    units.push(unit);
    unitOfComp.set(ci.inst.id, unit);
    if (ci.def.type === "sink.scope" && inputIdx.every((i) => i < 0))
      warn("scope-empty", `${name} não tem nenhum sinal ligado.`, { componentIds: [ci.inst.id] });
  }

  // ---- domínios físicos
  const physIn = (compId: string, port: string) => drivenBy.get(`${compId}.${port}`) ?? -1;
  let netSignal = new Map<number, number>();
  const hasPhysical = infos.some((c) => c.def.physical);
  if (hasPhysical) {
    const ctx: PhysCtx = {
      comps: infos,
      netOf: (c, p) => netByPort.get(`${c}.${p}`),
      netDomain: (n) => netDomains[n],
      nNets: netDomains.length,
      alloc: (meta) => {
        signals.push(meta);
        return signals.length - 1;
      },
      sigIn: physIn,
      sigOut: (c, p) => outSig.get(`${c}.${p}`) ?? -1,
      setUnit: (i, unit) => void (signals[i].unit = unit),
      diag: (d) => diags.push(d),
    };
    const pb = buildPhysical(ctx);
    for (const u of pb.units) {
      units.push(u);
      for (const id of u.compIds) unitOfComp.set(id, u);
    }
    netSignal = pb.netSignal;
  }

  for (const pc of physConns) {
    const net = netByPort.get(pc.a);
    connSig[pc.id] = net !== undefined ? (netSignal.get(net) ?? null) : null;
  }

  if (diags.some((d) => d.severity === "error")) return { ok: false, diagnostics: diags };

  // ---- ordem de cálculo e laços algébricos
  const producer = new Map<number, number>();
  units.forEach((u, i) => u.producedIdx.forEach((s) => producer.set(s, i)));
  const deps: Set<number>[] = units.map(() => new Set<number>());
  units.forEach((u, i) => {
    if (!u.feedthrough) return;
    for (const s of u.inputIdx) {
      if (s < 0) continue;
      const p = producer.get(s);
      if (p !== undefined) deps[i].add(p);
    }
  });
  const indeg = deps.map((d) => d.size);
  const users: number[][] = units.map(() => []);
  deps.forEach((d, i) => d.forEach((p) => users[p].push(i)));
  const queue: number[] = [];
  indeg.forEach((d, i) => d === 0 && queue.push(i));
  const order: number[] = [];
  while (queue.length) {
    const i = queue.shift()!;
    order.push(i);
    for (const j of users[i]) if (--indeg[j] === 0) queue.push(j);
  }
  if (order.length < units.length) {
    const stuck = new Set(units.map((_, i) => i).filter((i) => !order.includes(i)));
    // Extrai um ciclo seguindo dependências dentro do conjunto preso.
    let cur = [...stuck][0];
    const seen: number[] = [];
    while (!seen.includes(cur)) {
      seen.push(cur);
      cur = [...deps[cur]].find((p) => stuck.has(p))!;
    }
    const cyc = seen.slice(seen.indexOf(cur));
    const ids = cyc.flatMap((i) => units[i].compIds);
    err(
      "algebraic-loop",
      `Estes componentes formam um laço sem integrador: ${ids.map(nameOf).join(" → ")}. A saída de um depende dela mesma no mesmo instante. Coloque um integrador, um filtro ou um atraso no caminho.`,
      { componentIds: ids },
    );
    return { ok: false, diagnostics: diags };
  }
  const ordered = order.map((i) => units[i]);

  // ---- estados
  let nx = 0;
  for (const u of ordered) {
    u.off = nx;
    nx += u.nStates;
  }
  const sig = new Float64Array(signals.length);

  const evalAll = (t: number, x: Float64Array) => {
    for (const u of ordered) u.evalOut(t, x, sig);
  };
  const f: Deriv = (t, x, dx) => {
    evalAll(t, x);
    dx.fill(0);
    for (const u of ordered) if (u.nStates > 0) u.evalDer(t, x, sig, dx);
  };

  const model: CompiledModel = {
    nx,
    x0: () => {
      const x = new Float64Array(nx);
      for (const u of ordered) {
        const v = u.x0();
        for (let i = 0; i < v.length; i++) x[u.off + i] = v[i];
      }
      return x;
    },
    f,
    evaluate: (t, x) => {
      evalAll(t, x);
      return sig;
    },
    signals,
    edgeSignal: connSig,
    breakpoints: (t0, tf) => {
      const all = ordered.flatMap((u) => u.breakpoints?.(t0, tf) ?? []).filter((b) => b > t0 && b < tf);
      all.sort((a, b) => a - b);
      const out: number[] = [];
      for (const b of all) if (out.length === 0 || b - out[out.length - 1] > 1e-12 * Math.max(1, Math.abs(b))) out.push(b);
      return out;
    },
    suggestedMaxStep: (t0, tf) => {
      let h = project.simulation.maxStep ?? (tf - t0) / 500;
      for (const u of ordered) h = Math.min(h, u.minTimescale?.() ?? Infinity);
      return h;
    },
    stateCount: (id) => unitOfComp.get(id)?.nStates ?? 0,
    setParam: (compId, key, value) => {
      const ci = byId.get(compId);
      if (!ci) return { ok: false, message: "Componente não encontrado." };
      const pd = ci.def.params.find((p) => p.key === key);
      if (!pd) return { ok: false, message: "Parâmetro não encontrado." };
      const msg = validateParam(pd, value);
      if (msg) return { ok: false, message: `${ci.inst.label ?? ci.def.label}: ${msg}` };
      const prev = ci.inst.params[key];
      const restore = () => {
        if (prev === undefined) delete ci.inst.params[key];
        else ci.inst.params[key] = prev;
        revCounter++;
      };
      if (pd.structural) return { ok: true, needsReset: true };
      ci.inst.params[key] = { ...(prev ?? { unit: pd.unit }), value };
      revCounter++;
      const unit = unitOfComp.get(compId);
      const res = unit?.refresh?.(compId) ?? "ok";
      if (res === "ok") return { ok: true, appliedNow: !pd.initialOnly };
      restore();
      unit?.refresh?.(compId);
      if (res === "reset") return { ok: true, needsReset: true };
      return { ok: false, message: res.error };
    },
  };
  return { ok: true, model, diagnostics: diags };
}
