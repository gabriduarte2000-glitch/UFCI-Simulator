// Lógica combinacional passo a passo: expressão, tabela-verdade, mapa de Karnaugh, minimização (Quine-McCluskey),
// equação final, circuito de portas e leitura de um circuito montado no quadro.

import { build } from "./examples";
import { Simulation } from "./simulation";
import type { ProjectIR } from "./types";
import type { Item, Scene } from "./ics/datasheet";
import { dot, gate, gateOutX, GW, inOffsets, pinLabel, txt, wire } from "./ics/scene";

/** 0, 1 ou 2 (indiferente, X). */
export type Cell = 0 | 1 | 2;
export const MAX_VARS = 5;

const bit = (m: number, n: number, i: number) => (m >> (n - 1 - i)) & 1;

// ------------------------------------------------------------------------------------------------ expressão

type Node = { t: "v"; i: number } | { t: "c"; v: 0 | 1 } | { t: "not"; a: Node } | { t: "and" | "or" | "xor"; a: Node; b: Node };
export type ParsedLogic = { ok: true; vars: string[]; vals: Cell[] } | { ok: false; error: string };

function tokenize(src: string): string[] {
  const out: string[] = [];
  const s = src.replace(/\s+/g, " ");
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === " ") i++;
    else if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      out.push(s.slice(i, j).toUpperCase());
      i = j;
    } else if (c === "0" || c === "1") (out.push(c), i++);
    else if ("+|∨".includes(c)) (out.push("+"), i++);
    else if ("·*&∧.".includes(c)) (out.push("*"), i++);
    else if ("⊕^".includes(c)) (out.push("^"), i++);
    else if ("'’′".includes(c)) (out.push("'"), i++);
    else if ("!~¬".includes(c)) (out.push("!"), i++);
    else if (c === "(" || c === ")") (out.push(c), i++);
    else throw new Error(`Símbolo não reconhecido: “${c}”.`);
  }
  return out;
}

function parseTokens(tk: string[], vars: string[], grow: boolean): Node {
  let p = 0;
  const peek = () => tk[p];
  const isVar = (t?: string) => !!t && /^[A-Z][0-9]*$/.test(t);
  const startsPrimary = (t?: string) => !!t && (isVar(t) || t === "0" || t === "1" || t === "(" || t === "!");
  function orE(): Node {
    let a = xorE();
    while (peek() === "+") (p++, (a = { t: "or", a, b: xorE() }));
    return a;
  }
  function xorE(): Node {
    let a = andE();
    while (peek() === "^") (p++, (a = { t: "xor", a, b: andE() }));
    return a;
  }
  function andE(): Node {
    let a = unary();
    while (peek() === "*" || startsPrimary(peek())) {
      if (peek() === "*") p++;
      a = { t: "and", a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (peek() === "!") {
      p++;
      return { t: "not", a: unary() };
    }
    let a = primary();
    while (peek() === "'") (p++, (a = { t: "not", a }));
    return a;
  }
  function primary(): Node {
    const t = peek();
    if (t === undefined) throw new Error("A expressão terminou antes do esperado.");
    if (t === "(") {
      p++;
      const e = orE();
      if (peek() !== ")") throw new Error("Falta fechar um parêntese.");
      p++;
      return e;
    }
    if (t === "0" || t === "1") return (p++, { t: "c", v: t === "1" ? 1 : 0 });
    if (isVar(t)) {
      p++;
      let i = vars.indexOf(t);
      if (i < 0) {
        if (!grow) throw new Error(`A variável ${t} não está na lista de entradas.`);
        vars.push(t);
        i = vars.length - 1;
      }
      return { t: "v", i };
    }
    throw new Error(`Símbolo inesperado: “${t}”.`);
  }
  const e = orE();
  if (p < tk.length) throw new Error(`Sobrou texto: “${tk.slice(p).join(" ")}”.`);
  return e;
}

const evalNode = (n: Node, x: number[]): number =>
  n.t === "v" ? x[n.i] : n.t === "c" ? n.v : n.t === "not" ? 1 - evalNode(n.a, x) : n.t === "and" ? evalNode(n.a, x) & evalNode(n.b, x) : n.t === "or" ? evalNode(n.a, x) | evalNode(n.b, x) : evalNode(n.a, x) ^ evalNode(n.b, x);

/** Lê uma equação lógica como "S = A'B + AC" e devolve a tabela-verdade. Se `vars` vier vazio, usa as letras em ordem alfabética. */
export function parseLogic(text: string, vars?: string[]): ParsedLogic {
  try {
    let src = text.trim();
    const eq = src.indexOf("=");
    if (eq >= 0) src = src.slice(eq + 1);
    if (!src.trim()) return { ok: false, error: "Digite a equação." };
    const tk = tokenize(src);
    let names: string[];
    if (vars && vars.length) names = vars.map((v) => v.toUpperCase());
    else {
      names = [...new Set(tk.filter((t) => /^[A-Z][0-9]*$/.test(t)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    }
    if (names.length > MAX_VARS) return { ok: false, error: `Use no máximo ${MAX_VARS} variáveis.` };
    const ast = parseTokens(tk, names, false);
    const n = names.length;
    const vals: Cell[] = [];
    for (let m = 0; m < 1 << n; m++) vals.push(evalNode(ast, names.map((_, i) => bit(m, n, i))) as Cell);
    return { ok: true, vars: names, vals };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------------------------------------ mapa de Karnaugh

export interface KMap {
  /** Variáveis nas linhas e nas colunas, na ordem dos bits. */
  rowVars: string[];
  colVars: string[];
  rowCodes: string[];
  colCodes: string[];
  /** Mapas extras (n = 5 usa dois mapas, com a variável de menor peso... a primeira variável = 0 e 1). */
  planeVar?: string;
  /** cells[plano][linha][coluna] = índice do mintermo. */
  cells: number[][][];
}

const GRAY2 = ["0", "1"];
const GRAY4 = ["00", "01", "11", "10"];

export function kmapLayout(vars: string[]): KMap {
  const n = vars.length;
  if (n < 2 || n > MAX_VARS) throw new Error("O mapa de Karnaugh vai de 2 a 5 variáveis.");
  const g = (k: number) => (k === 1 ? GRAY2 : GRAY4);
  const plane = n === 5 ? 1 : 0;
  const rn = n === 2 ? 1 : n === 3 ? 1 : 2; // variáveis nas linhas
  const body = n - plane;
  const rowVars = vars.slice(plane, plane + rn);
  const colVars = vars.slice(plane + rn);
  void body;
  const rowCodes = g(rn);
  const colCodes = g(colVars.length);
  const planes = plane ? [0, 1] : [0];
  const cells = planes.map((pl) =>
    rowCodes.map((rc) =>
      colCodes.map((cc) => {
        const bits = `${plane ? pl : ""}${rc}${cc}`;
        return parseInt(bits, 2);
      }),
    ),
  );
  return { rowVars, colVars, rowCodes, colCodes, planeVar: plane ? vars[0] : undefined, cells };
}

// ------------------------------------------------------------------------------------------------ minimização

export interface Implicant {
  /** Valor dos bits (nos que não foram eliminados). */
  value: number;
  /** Bits eliminados (1 = variável sai do termo). */
  dash: number;
  /** Mintermos cobertos (incluindo indiferentes). */
  cover: number[];
}

function primes(n: number, on: number[], dc: number[]): Implicant[] {
  const all = [...new Set([...on, ...dc])];
  let cur = new Map<string, { v: number; d: number }>(all.map((m) => [`${m}-0`, { v: m, d: 0 }]));
  const out: { v: number; d: number }[] = [];
  while (cur.size) {
    const items = [...cur.values()];
    const used = new Set<string>();
    const next = new Map<string, { v: number; d: number }>();
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i],
          b = items[j];
        if (a.d !== b.d) continue;
        const diff = (a.v ^ b.v) & ~a.d;
        if (diff && (diff & (diff - 1)) === 0) {
          used.add(`${a.v}-${a.d}`);
          used.add(`${b.v}-${b.d}`);
          const d = a.d | diff;
          const v = a.v & ~diff;
          next.set(`${v}-${d}`, { v, d });
        }
      }
    for (const it of items) if (!used.has(`${it.v}-${it.d}`)) out.push(it);
    cur = next;
  }
  return out.map(({ v, d }) => ({ value: v, dash: d, cover: all.filter((m) => (m & ~d) === v).sort((a, b) => a - b) }));
}

const popcount = (x: number) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

/** Escolhe as essenciais e, para o resto, o menor conjunto (menos termos, depois menos letras). */
function choose(n: number, on: number[], ps: Implicant[]): { essential: Implicant[]; chosen: Implicant[] } {
  const essential: Implicant[] = [];
  for (const m of on) {
    const c = ps.filter((p) => p.cover.includes(m));
    if (c.length === 1 && !essential.includes(c[0])) essential.push(c[0]);
  }
  const covered = new Set(essential.flatMap((p) => p.cover));
  const left = on.filter((m) => !covered.has(m));
  let best: Implicant[] | null = null;
  const cost = (set: Implicant[]) => set.length * 100 + set.reduce((s, p) => s + (n - popcount(p.dash)), 0);
  const rest = ps.filter((p) => !essential.includes(p));
  const go = (need: number[], pick: Implicant[]) => {
    if (best && cost(pick) >= cost(best)) return;
    if (!need.length) {
      best = [...pick];
      return;
    }
    const m = need.reduce((a, b) => (rest.filter((p) => p.cover.includes(a)).length <= rest.filter((p) => p.cover.includes(b)).length ? a : b));
    for (const p of rest.filter((q) => q.cover.includes(m))) go(need.filter((x) => !p.cover.includes(x)), [...pick, p]);
  };
  go(left, []);
  const extra: Implicant[] = best ?? [];
  const chosen = [...essential, ...extra].sort((a, b) => a.cover[0] - b.cover[0]);
  return { essential, chosen };
}

export interface Literal {
  name: string;
  neg: boolean;
}
export interface Group {
  imp: Implicant;
  essential: boolean;
  /** Mintermos de 1 (e X) no grupo. */
  cells: number[];
  /** Por variável: "sai" (muda dentro do grupo), "0" ou "1". */
  status: ("sai" | "0" | "1")[];
  literals: Literal[];
  /** Texto do termo (produto) ou do fator (soma). */
  text: string;
  tex: string;
  why: string;
}

export interface Minimized {
  kind: "sop" | "pos";
  groups: Group[];
  /** Equação final em texto e em TeX. */
  text: string;
  tex: string;
  /** Constante quando não há grupos (0 ou 1). */
  constant: 0 | 1 | null;
  primeCount: number;
  literalCount: number;
}

const texVar = (n: string) => n.replace(/(\d+)$/, "_{$1}");
const lit = (l: Literal) => (l.neg ? `${l.name}'` : l.name);
const litTex = (l: Literal) => (l.neg ? `\\overline{${texVar(l.name)}}` : texVar(l.name));

function describe(imp: Implicant, vars: string[], kind: "sop" | "pos"): Pick<Group, "status" | "literals" | "text" | "tex" | "why"> {
  const n = vars.length;
  const status: Group["status"] = [];
  const literals: Literal[] = [];
  const why: string[] = [];
  vars.forEach((v, i) => {
    const bitI = n - 1 - i;
    if ((imp.dash >> bitI) & 1) {
      status.push("sai");
      why.push(`${v} muda (vale 0 e 1 dentro do grupo): ${v} sai`);
    } else {
      const val = (imp.value >> bitI) & 1;
      status.push(val ? "1" : "0");
      // SOP: valor 1 → variável direta; 0 → complementada. POS (grupo de zeros): valor 1 → complementada no fator.
      const neg = kind === "sop" ? val === 0 : val === 1;
      literals.push({ name: v, neg });
      why.push(kind === "sop" ? `${v} vale ${val} em todo o grupo: entra como ${neg ? v + "'" : v}` : `${v} vale ${val} em todo o grupo de zeros: no fator entra como ${neg ? v + "'" : v}`);
    }
  });
  if (kind === "sop") {
    const text = literals.length ? literals.map(lit).join("") : "1";
    const tex = literals.length ? literals.map(litTex).join("\\,") : "1";
    return { status, literals, text, tex, why: why.join("; ") + "." };
  }
  const text = literals.length ? `(${literals.map(lit).join(" + ")})` : "(0)";
  const tex = literals.length ? `(${literals.map(litTex).join(" + ")})` : "(0)";
  return { status, literals, text, tex, why: why.join("; ") + "." };
}

export function minimize(vars: string[], vals: Cell[], kind: "sop" | "pos" = "sop"): Minimized {
  const n = vars.length;
  const care = kind === "sop" ? 1 : 0;
  const on = vals.map((v, m) => (v === care ? m : -1)).filter((m) => m >= 0);
  const dc = vals.map((v, m) => (v === 2 ? m : -1)).filter((m) => m >= 0);
  if (on.length === 0) return { kind, groups: [], text: kind === "sop" ? "0" : "1", tex: kind === "sop" ? "0" : "1", constant: kind === "sop" ? 0 : 1, primeCount: 0, literalCount: 0 };
  if (on.length + dc.length === 1 << n && on.length > 0) {
    // tudo cobre: constante
    return { kind, groups: [], text: kind === "sop" ? "1" : "0", tex: kind === "sop" ? "1" : "0", constant: kind === "sop" ? 1 : 0, primeCount: 1, literalCount: 0 };
  }
  const ps = primes(n, on, dc);
  const { essential, chosen } = choose(n, on, ps);
  const groups: Group[] = chosen.map((imp) => ({ imp, essential: essential.includes(imp), cells: imp.cover, ...describe(imp, vars, kind) }));
  const text = kind === "sop" ? groups.map((g) => g.text).join(" + ") : groups.map((g) => g.text).join(" · ");
  const tex = kind === "sop" ? groups.map((g) => g.tex).join(" + ") : groups.map((g) => g.tex).join("\\,");
  return { kind, groups, text, tex, constant: null, primeCount: ps.length, literalCount: groups.reduce((s, g) => s + g.literals.length, 0) };
}

/** Avalia a equação mínima em todas as linhas e confere com a tabela (indiferentes valem qualquer coisa). */
export function verifyMin(vars: string[], vals: Cell[], m: Minimized): { ok: boolean; bad: number[] } {
  const n = vars.length;
  const bad: number[] = [];
  for (let row = 0; row < 1 << n; row++) {
    let y: number;
    if (m.constant !== null) y = m.constant;
    else if (m.kind === "sop") y = m.groups.some((g) => g.literals.every((l) => bit(row, n, vars.indexOf(l.name)) === (l.neg ? 0 : 1))) ? 1 : 0;
    else y = m.groups.every((g) => g.literals.some((l) => bit(row, n, vars.indexOf(l.name)) === (l.neg ? 0 : 1))) ? 1 : 0;
    if (vals[row] !== 2 && vals[row] !== y) bad.push(row);
  }
  return { ok: bad.length === 0, bad };
}

// ------------------------------------------------------------------------------------------------ formas canônicas

export function canonical(vars: string[], vals: Cell[]): { sum: number[]; prod: number[]; dc: number[]; sumText: string; prodText: string } {
  const sum = vals.flatMap((v, m) => (v === 1 ? [m] : []));
  const prod = vals.flatMap((v, m) => (v === 0 ? [m] : []));
  const dc = vals.flatMap((v, m) => (v === 2 ? [m] : []));
  const mt = (m: number) => vars.map((v, i) => (bit(m, vars.length, i) ? v : v + "'")).join("");
  const mx = (m: number) => "(" + vars.map((v, i) => (bit(m, vars.length, i) ? v + "'" : v)).join(" + ") + ")";
  return { sum, prod, dc, sumText: sum.length ? sum.map(mt).join(" + ") : "0", prodText: prod.length ? prod.map(mx).join("") : "1" };
}

// ------------------------------------------------------------------------------------------------ circuito de portas

/** Desenho do circuito AND-OR (soma de produtos), com barramentos de cada variável e do seu complemento. */
export function sopScene(vars: string[], m: Minimized, outName = "S"): Scene {
  const items: Item[] = [];
  const n = vars.length;
  const top = 22;
  const busX0 = 120;
  const step = 20;
  const terms = m.groups;
  const rowH = 58;
  const hdr = n * 40;
  const H = top + hdr + Math.max(1, terms.length) * rowH + 30;
  const bus: Record<string, number> = {};
  vars.forEach((v, i) => {
    const x = busX0 + i * 2 * step;
    bus[v] = x;
    bus[v + "'"] = x + step;
  });
  const busEnd = busX0 + n * 2 * step;
  vars.forEach((v, i) => {
    const yt = top + i * 40;
    const yn = yt + 20;
    items.push(txt(8, yt + 4, v, "start", 11, true));
    items.push(wire([26, yt], [bus[v], yt], [bus[v], H - 12]));
    items.push(dot(bus[v], yt));
    items.push(dot(30, yt), wire([30, yt], [30, yn], [44, yn]));
    items.push(gate(44, yn, "not", 1));
    items.push(wire([gateOutX(44, "not"), yn], [bus[v + "'"], yn], [bus[v + "'"], H - 12]));
    items.push(dot(bus[v + "'"], yn));
  });
  if (m.constant !== null) {
    items.push(txt(busEnd + 40, H / 2, `${outName} = ${m.constant}`, "start", 12, true));
    return { w: busEnd + 160, h: Math.max(H, 80), items };
  }
  const gx = busEnd + 26;
  const andOut: { x: number; y: number }[] = [];
  terms.forEach((g, r) => {
    const y = top + hdr + 34 + r * rowH;
    const ls = g.literals.map((l) => (l.neg ? l.name + "'" : l.name));
    if (ls.length === 1) {
      const bx = bus[ls[0]];
      items.push(dot(bx, y), wire([bx, y], [gx + GW + 14, y]));
      andOut.push({ x: gx + GW + 14, y });
      return;
    }
    items.push(gate(gx, y, "and", ls.length));
    const offs = inOffsets(ls.length);
    ls.forEach((l, k) => {
      const bx = bus[l];
      items.push(dot(bx, y + offs[k]), wire([bx, y + offs[k]], [gx, y + offs[k]]));
    });
    items.push(wire([gx + GW, y], [gx + GW + 14, y]));
    items.push(txt(gx + GW / 2, y - 22, g.text, "middle", 9));
    andOut.push({ x: gx + GW + 14, y });
  });
  if (terms.length === 1) {
    const o = andOut[0];
    items.push(wire([o.x, o.y], [o.x + 40, o.y]), pinLabel(o.x + 40, o.y, "r", "", outName));
    return { w: o.x + 120, h: H, items };
  }
  const ox = gx + GW + 60;
  const oy = top + hdr + 34 + ((terms.length - 1) * rowH) / 2;
  items.push(gate(ox, oy, "or", terms.length));
  const offs = inOffsets(terms.length);
  const spread = terms.length > 4 ? (terms.length - 1) * 8 : 0;
  void spread;
  andOut.forEach((o, k) => {
    const iy = oy + (offs[k] * Math.min(1, 3 / Math.max(1, terms.length - 1) + 0.4));
    items.push(wire([o.x, o.y], [o.x + 22, o.y], [o.x + 22, iy], [ox, iy]));
  });
  items.push(wire([ox + GW, oy], [ox + GW + 40, oy]), pinLabel(ox + GW + 40, oy, "r", "", outName));
  return { w: ox + GW + 130, h: H, items };
}

/** Monta no quadro: chaves para as variáveis, inversores, portas E, uma porta OU e um LED por saída. */
export function buildLogicCircuit(name: string, vars: string[], outs: { name: string; min: Minimized }[]): ProjectIR {
  type Comp = { id: string; type: string; label?: string; params?: Record<string, number | string | boolean>; pos: [number, number] };
  const comps: Comp[] = [];
  const conns: [string, string, string, string][] = [];
  vars.forEach((v, i) => comps.push({ id: `in_${i}`, type: "dig.switch", label: v, params: { on: false }, pos: [0, i * 90] }));
  const notId: Record<string, string> = {};
  const src = (l: Literal): [string, string] => {
    const i = vars.indexOf(l.name);
    if (!l.neg) return [`in_${i}`, "y"];
    if (!notId[l.name]) {
      notId[l.name] = `not_${i}`;
      comps.push({ id: notId[l.name], type: "dig.not", label: `${l.name}'`, pos: [220, i * 90 + 20] });
      conns.push([`in_${i}`, "y", notId[l.name], "a"]);
    }
    return [notId[l.name], "y"];
  };
  const letters = "abcdefgh";
  let row = 0;
  outs.forEach((o, oi) => {
    const m = o.min;
    const y0 = row * 80;
    if (m.constant !== null) {
      comps.push({ id: `k${oi}`, type: "dig.switch", label: `${o.name} = ${m.constant}`, params: { on: m.constant === 1 }, pos: [520, y0] });
      comps.push({ id: `led${oi}`, type: "dig.led", label: o.name, params: { color: "green" }, pos: [820, y0] });
      conns.push([`k${oi}`, "y", `led${oi}`, "a"]);
      row++;
      return;
    }
    const termOut: [string, string][] = [];
    m.groups.forEach((g, ti) => {
      const y = (row + ti) * 80;
      if (g.literals.length === 1) {
        termOut.push(src(g.literals[0]));
        return;
      }
      const id = `and${oi}_${ti}`;
      comps.push({ id, type: "dig.and", label: `${o.name}: ${g.text}`, params: { n: Math.min(8, g.literals.length) }, pos: [420, y] });
      g.literals.slice(0, 8).forEach((l, k) => conns.push([...src(l), id, letters[k]] as [string, string, string, string]));
      termOut.push([id, "y"]);
    });
    const ly = row * 80 + ((m.groups.length - 1) * 80) / 2;
    let last: [string, string];
    if (termOut.length === 1) last = termOut[0];
    else {
      const id = `or${oi}`;
      comps.push({ id, type: "dig.or", label: `${o.name} (soma dos termos)`, params: { n: Math.min(8, termOut.length) }, pos: [640, ly] });
      termOut.slice(0, 8).forEach((t, k) => conns.push([t[0], t[1], id, letters[k]]));
      last = [id, "y"];
    }
    comps.push({ id: `led${oi}`, type: "dig.led", label: o.name, params: { color: "green" }, pos: [860, ly] });
    conns.push([last[0], last[1], `led${oi}`, "a"]);
    row += Math.max(1, m.groups.length);
  });
  return build(name, comps, conns, { tf: 5, solver: "rk4", h: 0.01 });
}

// ------------------------------------------------------------------------------------------------ ler um circuito montado

export interface LogicIO {
  inputs: { id: string; label: string }[];
  outputs: { signal: string; label: string; led: boolean }[];
  /** Componentes lógicos usados no quadro, por tipo. */
  parts: { label: string; n: number }[];
  warnings: string[];
}

export function logicIO(ir: ProjectIR, labelOf: (type: string) => string): LogicIO {
  const inputs = ir.components.filter((c) => c.type === "dig.switch").map((c) => ({ id: c.id, label: c.label || c.id }));
  const outputs: LogicIO["outputs"] = [];
  const byId = new Map(ir.components.map((c) => [c.id, c]));
  for (const c of ir.components) {
    if (c.type === "dig.led") {
      const w = ir.connections.find((k) => k.to.component === c.id && k.to.port === "a");
      if (w) outputs.push({ signal: `${w.from.component}.${w.from.port}`, label: c.label || c.id, led: true });
    }
  }
  const skip = new Set(["dig.switch", "dig.clock", "dig.led", "dig.display7"]);
  for (const c of ir.components) {
    if ((c.type.startsWith("dig.") && !skip.has(c.type)) || c.type.startsWith("ic.")) {
      const outPorts = [...new Set(ir.connections.filter((k) => k.from.component === c.id).map((k) => k.from.port))];
      for (const p of outPorts) {
        const s = `${c.id}.${p}`;
        if (!outputs.some((o) => o.signal === s)) outputs.push({ signal: s, label: `${c.label || c.id} · ${p}`, led: false });
      }
    }
  }
  const counts = new Map<string, number>();
  for (const c of ir.components) if (c.type.startsWith("dig.") || c.type.startsWith("ic.")) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const parts = [...counts].filter(([t]) => !["dig.switch", "dig.led"].includes(t)).map(([t, n]) => ({ label: labelOf(t), n }));
  const warnings: string[] = [];
  if (ir.components.some((c) => c.type === "dig.clock" || c.type === "elec.timer555")) warnings.push("O quadro tem clock: a tabela vale para o circuito combinacional, com o clock parado no estado inicial.");
  if (ir.components.some((c) => ["dig.dff", "dig.jkff", "dig.tff", "dig.counter", "dig.shiftreg", "dig.srlatch", "dig.dlatch", "dig.ton"].includes(c.type) || (c.type.startsWith("ic.") && /^ic\.(74(7[4-9]|1[1-9]\d|16\d|19\d|90|93|23)|40(13|17|27)|45\d\d)/.test(c.type)))) warnings.push("Há elementos com memória (flip-flops, contadores, TON). A tabela mostra só o comportamento no instante inicial.");
  void byId;
  return { inputs, outputs, parts, warnings };
}

/** Roda o circuito para cada combinação das chaves e lê o nível da saída. */
export function circuitTable(ir: ProjectIR, inputIds: string[], signal: string): Cell[] {
  const n = inputIds.length;
  const out: Cell[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const p = structuredClone(ir) as ProjectIR;
    p.simulation = { ...p.simulation, solver: "rk4", t0: 0, tf: 0.02, h: 0.005 };
    inputIds.forEach((id, i) => {
      const c = p.components.find((x) => x.id === id);
      if (c) c.params.on = { ...c.params.on, value: bit(m, n, i) === 1 };
    });
    const sim = new Simulation(p);
    sim.runToEnd();
    const j = sim.signals.findIndex((s) => s.id === signal);
    if (j < 0) throw new Error(`Sinal ${signal} não encontrado.`);
    const col = sim.series.colView(j);
    out.push(col[col.length - 1] >= 0.5 ? 1 : 0);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ equações lidas da estrutura do circuito

type X = { t: "leaf"; key: string } | { t: "const"; v: 0 | 1 } | { t: "not"; a: X } | { t: "gate"; op: "and" | "or" | "nand" | "nor" | "xor" | "xnor"; args: X[] };

export interface Leaf {
  /** Letra usada nas equações (A, B, C...). */
  name: string;
  /** Sinal da simulação (componente.porta). */
  signal: string;
  /** Nome do componente e tipo, para legenda. */
  label: string;
  kind: "chave" | "clock" | "memória" | "bloco";
}

export interface ReadOutput {
  label: string;
  signal: string;
  /** Equação como o circuito foi desenhado (sem reduzir). */
  structure: string;
  /** Variáveis de que a saída depende (letras, ordem alfabética) e tabela. */
  vars: string[];
  vals: Cell[];
  tooMany: boolean;
  /** Por linha da tabela: a combinação aparece na simulação? null quando não dá para afirmar (há chave de entrada na função). */
  observed: boolean[] | null;
}

export interface PhaseRow {
  t0: number;
  t1: number;
  /** Nível de cada coluna (folhas e saídas). 2 = pisca durante a fase. */
  levels: (0 | 1 | 2)[];
}

export interface ReadCircuit {
  leaves: Leaf[];
  outputs: ReadOutput[];
  /** Colunas da tabela de fases: nomes das folhas seguidos dos nomes das saídas. */
  phaseCols: string[];
  phases: PhaseRow[];
  phasesCut: boolean;
  timeUnit: string;
  warnings: string[];
}

const GATE_OPS = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);

function evalX(x: X, a: Record<string, number>): number {
  switch (x.t) {
    case "leaf":
      return a[x.key] ?? 0;
    case "const":
      return x.v;
    case "not":
      return 1 - evalX(x.a, a);
    case "gate": {
      const b = x.args.map((y) => evalX(y, a));
      const all = b.every((v) => v === 1);
      const any = b.some((v) => v === 1);
      const par = b.reduce((s, v) => s ^ v, 0);
      return x.op === "and" ? +all : x.op === "or" ? +any : x.op === "nand" ? +!all : x.op === "nor" ? +!any : x.op === "xor" ? par : 1 - par;
    }
  }
}

function leavesOf(x: X, out = new Set<string>()): Set<string> {
  if (x.t === "leaf") out.add(x.key);
  else if (x.t === "not") leavesOf(x.a, out);
  else if (x.t === "gate") x.args.forEach((y) => leavesOf(y, out));
  return out;
}

function showX(x: X, nm: (k: string) => string, prec = 0): string {
  const wrap = (s: string, p: number) => (p < prec ? `(${s})` : s);
  switch (x.t) {
    case "leaf":
      return nm(x.key);
    case "const":
      return String(x.v);
    case "not":
      return x.a.t === "leaf" ? `${nm(x.a.key)}'` : `${showX(x.a, nm, 4)}'`.replace(/^([^(].*)'$/, "($1)'");
    case "gate": {
      const sub = (p: number) => x.args.map((y) => showX(y, nm, p));
      if (x.op === "and") return wrap(sub(3).join(""), 3);
      if (x.op === "or") return wrap(sub(1).join(" + "), 1);
      if (x.op === "xor") return wrap(sub(2).join(" ⊕ "), 2);
      if (x.op === "nand") return `(${sub(3).join("")})'`;
      if (x.op === "nor") return `(${sub(1).join(" + ")})'`;
      return `(${sub(2).join(" ⊕ ")})'`;
    }
  }
}

/**
 * Lê a lógica do quadro: portas viram a equação; chaves, clock, flip-flops, temporizadores e CIs viram variáveis
 * (a saída deles é tratada como entrada da parte combinacional). Também roda a simulação e monta a tabela de fases.
 */
export function readCircuit(ir: ProjectIR): ReadCircuit {
  const comp = new Map(ir.components.map((c) => [c.id, c]));
  const warnings: string[] = [];
  const driver = new Map<string, { c: string; p: string }>();
  for (const k of ir.connections) driver.set(`${k.to.component}.${k.to.port}`, { c: k.from.component, p: k.from.port });
  const leafInfo = new Map<string, { label: string; kind: Leaf["kind"] }>();

  const nameOfSource = (id: string, port: string) => {
    const c = comp.get(id)!;
    const base = c.label || id;
    const def = getDefLazy(c.type);
    const nOut = def ? portCount(def, c) : 1;
    return nOut > 1 ? `${base} · ${port}` : base;
  };
  const kindOf = (type: string): Leaf["kind"] => (type === "dig.switch" ? "chave" : type === "dig.clock" || type === "elec.timer555" ? "clock" : /^dig\.(dff|jkff|tff|srlatch|dlatch|counter|shiftreg|ton)$/.test(type) || type.startsWith("ic.") ? "memória" : "bloco");

  const build = (id: string, port: string, seen: Set<string>): X => {
    const c = comp.get(id);
    if (!c) return { t: "const", v: 0 };
    const key = `${id}.${port}`;
    const kind = c.type.startsWith("dig.") ? c.type.slice(4) : "";
    if ((GATE_OPS.has(kind) || kind === "not" || kind === "buf") && port === "y" && !seen.has(id)) {
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
    if (!leafInfo.has(key)) leafInfo.set(key, { label: nameOfSource(id, port), kind: kindOf(c.type) });
    return { t: "leaf", key };
  };

  // Saídas: LEDs; se não houver, portas cuja saída não alimenta outra porta.
  type Out = { label: string; x: X; signal: string };
  const outs: Out[] = [];
  for (const c of ir.components) {
    if (c.type !== "dig.led") continue;
    const d = driver.get(`${c.id}.a`);
    if (d) outs.push({ label: c.label || c.id, x: build(d.c, d.p, new Set()), signal: `${d.c}.${d.p}` });
  }
  if (!outs.length) {
    const feeds = new Set(ir.connections.map((k) => k.from.component));
    for (const c of ir.components) {
      if (/^dig\.(and|or|nand|nor|xor|xnor|not)$/.test(c.type) && !feeds.has(c.id)) outs.push({ label: c.label || c.id, x: build(c.id, "y", new Set()), signal: `${c.id}.y` });
    }
  }
  if (!outs.length) warnings.push("Não achei saída. Ligue um LED à porta que dá o resultado.");

  // Letras para as folhas, na ordem do rótulo.
  const keys = [...leafInfo.keys()].sort((a, b) => leafInfo.get(a)!.label.localeCompare(leafInfo.get(b)!.label, "pt", { numeric: true }));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const leaves: Leaf[] = keys.map((k, i) => ({ name: i < 26 ? letters[i] : `X${i}`, signal: k, label: leafInfo.get(k)!.label, kind: leafInfo.get(k)!.kind }));
  const nameOf = (k: string) => leaves.find((l) => l.signal === k)!.name;

  const outputs: ReadOutput[] = outs.map((o) => {
    const sup = [...leavesOf(o.x)].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en", { numeric: true }));
    const tooMany = sup.length > MAX_VARS;
    const vals: Cell[] = [];
    if (!tooMany && sup.length > 0)
      for (let m = 0; m < 1 << sup.length; m++) {
        const a: Record<string, number> = {};
        sup.forEach((k, i) => (a[k] = bit(m, sup.length, i)));
        vals.push(evalX(o.x, a) as Cell);
      }
    return { label: o.label, signal: o.signal, structure: showX(o.x, nameOf), vars: sup.map(nameOf), vals, tooMany, observed: null };
  });

  if (leaves.some((l) => l.kind === "memória" || l.kind === "clock")) warnings.push("Temporizadores, clock e flip-flops entram como variáveis: a equação vale para a parte combinacional entre eles. A tabela de fases abaixo mostra o que acontece no tempo.");

  // Tabela de fases por simulação.
  let phases: PhaseRow[] = [];
  let phasesCut = false;
  const phaseCols: string[] = [];
  try {
    const sim = new Simulation(ir);
    sim.runToEnd();
    const idx = (s: string) => sim.signals.findIndex((x) => x.id === s);
    const clockKeys = new Set(leaves.filter((l) => l.kind === "clock").map((l) => l.signal));
    const cols = [
      ...leaves.map((l) => ({ name: l.name, j: idx(l.signal), fast: clockKeys.has(l.signal) })),
      ...outputs.map((o, oi) => ({ name: o.label, j: idx(o.signal), fast: [...leavesOf(outs[oi].x)].some((k) => clockKeys.has(k)) })),
    ].filter((c) => c.j >= 0);
    cols.forEach((c) => phaseCols.push(c.name));
    const tv = sim.series.timeView();
    const cv = cols.map((c) => sim.series.colView(c.j));
    // Colunas rápidas (clock e saídas que dependem dele) não separam fases: viram "pisca" quando mudam dentro da fase.
    const fast = cols.map((c) => c.fast);
    const keyAt = (i: number) => cv.map((col, ci) => (fast[ci] ? "-" : col[i] >= 0.5 ? "1" : "0")).join("");
    let start = 0;
    const flush = (end: number, tEnd: number) => {
      const lv = cv.map((col, ci) => {
        if (!fast[ci]) return (col[start] >= 0.5 ? 1 : 0) as 0 | 1 | 2;
        let a0 = 0,
          a1 = 0;
        for (let i = start; i <= end; i++) col[i] >= 0.5 ? a1++ : a0++;
        return (a0 && a1 ? 2 : a1 ? 1 : 0) as 0 | 1 | 2;
      });
      phases.push({ t0: tv[start], t1: tEnd, levels: lv });
    };
    for (let i = 1; i <= tv.length; i++) {
      if (i === tv.length || keyAt(i) !== keyAt(start)) {
        const tEnd = i === tv.length ? tv[tv.length - 1] : tv[i];
        if (tEnd - tv[start] > 1e-9) flush(i - 1, tEnd);
        start = i;
      }
    }
    // Combinações que aparecem durante a simulação (só vale quando nenhuma chave de entrada manda na saída).
    for (const o of outputs) {
      if (o.tooMany || o.vars.length === 0) continue;
      const ls = o.vars.map((n) => leaves.find((l) => l.name === n)!);
      const js = ls.map((l) => idx(l.signal));
      if (ls.some((l) => l.kind === "chave") || js.some((j) => j < 0)) continue;
      const cols2 = js.map((j) => sim.series.colView(j));
      const seen = new Array<boolean>(1 << ls.length).fill(false);
      for (let i = 0; i < tv.length; i++) {
        let m = 0;
        cols2.forEach((col) => (m = (m << 1) | (col[i] >= 0.5 ? 1 : 0)));
        seen[m] = true;
      }
      o.observed = seen;
    }
    if (phases.length > 60) {
      phases = phases.slice(0, 60);
      phasesCut = true;
    }
  } catch {
    warnings.push("Não consegui simular para montar a tabela de fases.");
  }
  return { leaves, outputs, phaseCols, phases, phasesCut, timeUnit: ir.simulation.timeUnit ?? "s", warnings };
}

import { getDef as getDefLazy } from "./components/registry";
function portCount(def: NonNullable<ReturnType<typeof getDefLazy>>, c: { params: Record<string, { value?: unknown }> }): number {
  try {
    const ports = typeof def.ports === "function" ? def.ports({ num: (k: string) => Number(c.params[k]?.value ?? 2) } as never) : def.ports;
    return ports.filter((p) => p.dir === "out" || (p as { kind?: string }).kind === "out").length || 1;
  } catch {
    return 1;
  }
}
