// Lê uma máquina de estados síncrona montada no quadro (flip-flops D, T ou JK com portas) e gera a tabela de estados.

import { evalX, leavesOf, showX, type X } from "./logic";
import type { FFKind, SeqSpec } from "./seq";
import type { ProjectIR } from "./types";

export interface FsmState {
  state: number;
  code: string;
  reachable: boolean;
  /** Próximo estado para cada combinação das entradas (índice = valor binário das entradas). */
  next: number[];
}

export interface FsmOutput {
  label: string;
  /** Equação como desenhada, em letras. */
  structure: string;
  moore: boolean;
  /** Moore: valor por estado. Mealy: valor por estado e combinação. */
  byState: (0 | 1)[];
  byStateInput: (0 | 1)[][];
}

export interface FsmEdge {
  from: number;
  to: number;
  label: string;
}

export interface FsmRead {
  ok: true;
  ffKind: FFKind | "misto";
  bits: { name: string; label: string }[];
  inputs: { name: string; label: string }[];
  init: number;
  initCode: string;
  nBits: number;
  states: FsmState[];
  excitation: { label: string; structure: string }[];
  outputs: FsmOutput[];
  edges: FsmEdge[];
  warnings: string[];
  /** Projeto equivalente para o projetista de máquinas de estado (null se não couber). */
  spec: SeqSpec | null;
}
export type FsmResult = FsmRead | { ok: false; error: string };

const FF_TYPES: Record<string, FFKind> = { "dig.dff": "D", "dig.tff": "T", "dig.jkff": "JK" };
const FF_PINS: Record<FFKind, string[]> = { D: ["d"], T: ["t"], JK: ["j", "k"] };
const GATES = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);
const code = (s: number, n: number) => s.toString(2).padStart(n, "0");

export function readStateMachine(ir: ProjectIR): FsmResult {
  const comp = new Map(ir.components.map((c) => [c.id, c]));
  const ffs = ir.components.filter((c) => c.type in FF_TYPES).sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id, "pt", { numeric: true }));
  if (!ffs.length) return { ok: false, error: "Não há flip-flop (D, T ou JK) no quadro. Monte um contador ou uma máquina de estados, ou use o projeto em \"Da conta para o circuito\"." };
  if (ffs.length > 4) return { ok: false, error: "Mais de 4 flip-flops: a tabela teria mais de 16 estados." };
  const driver = new Map<string, { c: string; p: string }>();
  for (const k of ir.connections) driver.set(`${k.to.component}.${k.to.port}`, { c: k.from.component, p: k.from.port });

  const clockSrc = new Set(ffs.map((f) => { const d = driver.get(`${f.id}.clk`); return d ? `${d.c}.${d.p}` : "-"; }));
  if (clockSrc.size > 1) return { ok: false, error: "Os flip-flops não usam o mesmo clock (contador assíncrono). A tabela de estados só vale para circuito síncrono, com todos no mesmo clock." };

  const warnings: string[] = [];
  const bitIndex = new Map(ffs.map((f, i) => [f.id, i]));
  const bitNames = ffs.map((_, i) => "ABCD"[i]);
  const switches: string[] = [];
  let bad = "";
  const leafSig = (c: string, p: string) => `${c}.${p}`;

  const build = (id: string, port: string, seen: Set<string>): X => {
    const c = comp.get(id);
    if (!c) return { t: "const", v: 0 };
    if (bitIndex.has(id)) {
      const q: X = { t: "leaf", key: `${id}.q` };
      return port === "qn" ? { t: "not", a: q } : q;
    }
    const kind = c.type.startsWith("dig.") ? c.type.slice(4) : "";
    if ((GATES.has(kind) || kind === "not" || kind === "buf") && port === "y" && !seen.has(id)) {
      const s = new Set(seen).add(id);
      const ports = kind === "not" || kind === "buf" ? ["a"] : "abcdefgh".slice(0, Number(c.params.n?.value ?? 2)).split("");
      const args: X[] = ports.map((p) => {
        const d = driver.get(`${id}.${p}`);
        return d ? build(d.c, d.p, s) : { t: "const", v: 0 };
      });
      if (kind === "not") return { t: "not", a: args[0] };
      if (kind === "buf") return args[0];
      return { t: "gate", op: kind as "and", args };
    }
    if (c.type === "dig.switch" && /\(fixo\)$/.test(c.label ?? "")) return { t: "const", v: c.params.on?.value ? 1 : 0 };
    if (c.type === "dig.switch") {
      if (!switches.includes(id)) switches.push(id);
      return { t: "leaf", key: leafSig(id, port) };
    }
    bad = `O circuito usa “${c.label || id}” (${c.type}), que não é chave, porta nem flip-flop. Não consigo tratar como entrada.`;
    return { t: "const", v: 0 };
  };

  const kinds = ffs.map((f) => FF_TYPES[f.type]);
  const pins: X[][] = ffs.map((f, i) => FF_PINS[kinds[i]].map((p) => {
    const d = driver.get(`${f.id}.${p}`);
    return d ? build(d.c, d.p, new Set()) : { t: "const", v: 0 };
  }));

  // Saídas: LEDs ligados a funções do estado (os que mostram só um bit de estado são indicadores e ficam de fora).
  const ledX: { label: string; x: X }[] = [];
  for (const c of ir.components) {
    if (c.type !== "dig.led") continue;
    const d = driver.get(`${c.id}.a`);
    if (!d) continue;
    const x = build(d.c, d.p, new Set());
    const direct = x.t === "leaf" || (x.t === "not" && x.a.t === "leaf");
    if (direct && [...leavesOf(x)].every((k) => k.endsWith(".q"))) continue;
    ledX.push({ label: c.label || c.id, x });
  }
  if (bad) return { ok: false, error: bad };
  if (switches.length > 3) return { ok: false, error: "Mais de 3 chaves de entrada. Reduza as entradas para ler a máquina." };

  const inputNames = switches.map((_, i) => "XYZ"[i]);
  const nBits = ffs.length;
  const nIn = switches.length;
  const combos = 1 << nIn;
  const nameOf = (k: string) => {
    const [id] = k.split(".");
    if (bitIndex.has(id)) return bitNames[bitIndex.get(id)!];
    return inputNames[switches.indexOf(id)];
  };
  const assign = (s: number, c: number) => {
    const a: Record<string, number> = {};
    ffs.forEach((f, i) => (a[`${f.id}.q`] = (s >> (nBits - 1 - i)) & 1));
    switches.forEach((id, i) => (a[`${id}.y`] = (c >> (nIn - 1 - i)) & 1));
    return a;
  };
  const nextState = (s: number, c: number) => {
    const a = assign(s, c);
    let out = 0;
    ffs.forEach((_, i) => {
      const q = (s >> (nBits - 1 - i)) & 1;
      const v = pins[i].map((x) => evalX(x, a));
      const nb = kinds[i] === "D" ? v[0] : kinds[i] === "T" ? q ^ v[0] : v[0] && v[1] ? 1 - q : v[0] ? 1 : v[1] ? 0 : q;
      out = (out << 1) | nb;
    });
    return out;
  };

  const init = ffs.reduce((s, f, i) => s | ((Number(f.params.q0?.value ?? 0) ? 1 : 0) << (nBits - 1 - i)), 0);
  const total = 1 << nBits;
  const states: FsmState[] = Array.from({ length: total }, (_, s) => ({ state: s, code: code(s, nBits), reachable: false, next: Array.from({ length: combos }, (_, c) => nextState(s, c)) }));
  const queue = [init];
  states[init].reachable = true;
  while (queue.length) {
    const s = queue.shift()!;
    for (const t of states[s].next) if (!states[t].reachable) (states[t].reachable = true, queue.push(t));
  }

  const outputs: FsmOutput[] = [];
  for (const o of ledX) {
    const ls = [...leavesOf(o.x)];
    if (ls.some((k) => !k.endsWith(".q") && !switches.some((id) => k.startsWith(id + ".")))) continue;
    const moore = ls.every((k) => k.endsWith(".q"));
    const byStateInput = states.map((st) => Array.from({ length: combos }, (_, c) => evalX(o.x, assign(st.state, c)) as 0 | 1));
    outputs.push({ label: o.label, structure: showX(o.x, nameOf), moore, byState: byStateInput.map((r) => r[0]), byStateInput });
  }

  const excitation = ffs.flatMap((f, i) => FF_PINS[kinds[i]].map((p, k) => ({ label: `${p.toUpperCase()}${bitNames[i]}`, structure: showX(pins[i][k], nameOf) })));

  const edges: FsmEdge[] = [];
  for (const st of states) {
    if (!st.reachable) continue;
    const m = new Map<number, string[]>();
    st.next.forEach((t, c) => m.set(t, [...(m.get(t) ?? []), nIn ? code(c, nIn) : ""]));
    for (const [t, cs] of m) edges.push({ from: st.state, to: t, label: nIn ? (cs.length === combos ? "qualquer" : cs.map((x) => `${inputNames.join("")}=${x}`).join(", ")) : "" });
  }

  const ffKind: FFKind | "misto" = new Set(kinds).size === 1 ? kinds[0] : "misto";
  const maxR = Math.max(...states.filter((s) => s.reachable).map((s) => s.state));
  let spec: SeqSpec | null = null;
  if (nIn <= 2 && maxR >= 1 && nBits + nIn <= 5) {
    const nS = maxR + 1;
    spec = {
      nStates: nS,
      inputs: inputNames.slice(0, nIn),
      ff: ffKind === "misto" ? "D" : ffKind,
      next: states.slice(0, nS).map((s) => s.next.map((t) => (t < nS ? t : s.state))),
      outputs: outputs.filter((o) => o.moore).map((o) => ({ name: o.label.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "Z", byState: o.byState.slice(0, nS) })),
    };
  }
  if (ffKind === "misto") warnings.push("O circuito mistura tipos de flip-flop. A tabela vale, mas o projetista usa D ao refazer.");
  warnings.push("Entradas assíncronas de set e reset dos flip-flops não entram na tabela. O estado inicial vem do valor inicial de Q de cada flip-flop.");
  return {
    ok: true,
    ffKind,
    bits: ffs.map((f, i) => ({ name: bitNames[i], label: f.label || f.id })),
    inputs: switches.map((id, i) => ({ name: inputNames[i], label: comp.get(id)?.label || id })),
    init,
    initCode: code(init, nBits),
    nBits,
    states,
    excitation,
    outputs,
    edges,
    warnings,
    spec,
  };
}
