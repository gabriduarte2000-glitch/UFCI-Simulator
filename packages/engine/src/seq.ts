// Lógica sequencial passo a passo: tabela de estados, tabela de excitação dos flip-flops, Karnaugh e circuito.

import { build } from "./examples";
import { minimize, verifyMin, type Cell, type Literal, type Minimized, MAX_VARS } from "./logic";
import type { ProjectIR } from "./types";

export type FFKind = "D" | "T" | "JK";

export interface SeqSpec {
  /** Número de estados (2 a 16). O estado inicial é o 0. */
  nStates: number;
  /** Nomes das entradas (0 a 2), ex.: ["X"]. */
  inputs: string[];
  ff: FFKind;
  /** next[estado][combinação das entradas] = próximo estado. */
  next: number[][];
  /** Saídas de Moore: nome e valor por estado. */
  outputs: { name: string; byState: (0 | 1)[] }[];
}

export interface SeqFn {
  label: string;
  vars: string[];
  vals: Cell[];
  min: Minimized;
}

export interface SeqResult {
  ok: true;
  nBits: number;
  /** Nomes dos bits de estado, do mais ao menos significativo. */
  bits: string[];
  /** Variáveis das funções: bits e depois entradas. */
  vars: string[];
  codes: string[];
  /** Linhas da tabela de transição: uma por (código, combinação). m = índice nas variáveis. */
  rows: { m: number; state: number | null; code: string; inp: string; nextState: number | null; nextCode: string | null }[];
  /** Funções de excitação: para D uma por bit; T uma por bit; JK duas por bit (J e K). */
  excitation: SeqFn[];
  /** Colunas de excitação por linha da tabela (mesma ordem de `excitation`). */
  outFns: SeqFn[];
  verified: { ok: boolean; message: string };
}
export type SeqBuilt = SeqResult | { ok: false; error: string };

const bitsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(n)));
const BIT_NAMES = ["A", "B", "C", "D"];

export function stateCode(s: number, nBits: number): string {
  return s.toString(2).padStart(nBits, "0");
}

export function designSeq(spec: SeqSpec): SeqBuilt {
  const n = spec.nStates;
  if (n < 2 || n > 16) return { ok: false, error: "Use de 2 a 16 estados." };
  const nBits = bitsFor(n);
  const nIn = spec.inputs.length;
  if (nBits + nIn > MAX_VARS) return { ok: false, error: `Com ${n} estados e ${nIn} entrada(s) o mapa passa de ${MAX_VARS} variáveis. Reduza estados ou entradas.` };
  const combos = 1 << nIn;
  for (let s = 0; s < n; s++) for (let c = 0; c < combos; c++) if (!(spec.next[s]?.[c] >= 0 && spec.next[s][c] < n)) return { ok: false, error: `Falta o próximo estado de S${s}.` };
  const bits = BIT_NAMES.slice(0, nBits);
  const vars = [...bits, ...spec.inputs];
  const nv = vars.length;
  const total = 1 << nv;
  const rows: SeqResult["rows"] = [];
  const nextOf = (m: number) => {
    const s = m >> nIn;
    const c = m & (combos - 1);
    return s < n ? spec.next[s][c] : null;
  };
  for (let m = 0; m < total; m++) {
    const s = m >> nIn;
    const ns = nextOf(m);
    rows.push({ m, state: s < n ? s : null, code: stateCode(s, nBits), inp: nIn ? (m & (combos - 1)).toString(2).padStart(nIn, "0") : "", nextState: ns, nextCode: ns === null ? null : stateCode(ns, nBits) });
  }
  const excitation: SeqFn[] = [];
  for (let b = 0; b < nBits; b++) {
    const shift = nBits - 1 - b;
    const curBit = (m: number) => ((m >> nIn) >> shift) & 1;
    const nxtBit = (m: number) => (((nextOf(m) as number) >> shift) & 1);
    const make = (label: string, f: (cur: number, nxt: number) => Cell) => {
      const vals: Cell[] = [];
      for (let m = 0; m < total; m++) vals.push(nextOf(m) === null ? 2 : f(curBit(m), nxtBit(m)));
      excitation.push({ label, vars, vals, min: minimize(vars, vals, "sop") });
    };
    if (spec.ff === "D") make(`D${bits[b]}`, (_c, x) => x as Cell);
    else if (spec.ff === "T") make(`T${bits[b]}`, (c, x) => (c ^ x) as Cell);
    else {
      make(`J${bits[b]}`, (c, x) => (c === 0 ? (x ? 1 : 0) : 2));
      make(`K${bits[b]}`, (c, x) => (c === 1 ? (x ? 0 : 1) : 2));
    }
  }
  // Saídas de Moore: função só dos bits.
  const outFns: SeqFn[] = spec.outputs.map((o) => {
    const v: Cell[] = [];
    for (let s = 0; s < 1 << nBits; s++) v.push(s < n ? o.byState[s] : 2);
    return { label: o.name, vars: bits, vals: v, min: minimize(bits, v, "sop") };
  });
  // Conferência: roda as equações mínimas para cada (estado, entrada) e compara com a tabela.
  const holds = (min: Minimized, vs: string[], row: number) => {
    if (min.constant !== null) return min.constant;
    return min.groups.some((g) => g.literals.every((l) => (row >> (vs.length - 1 - vs.indexOf(l.name))) & 1 ? !l.neg : l.neg)) ? 1 : 0;
  };
  let bad = "";
  for (let m = 0; m < total && !bad; m++) {
    const ns = nextOf(m);
    if (ns === null) continue;
    let got = 0;
    for (let b = 0; b < nBits; b++) {
      const cur = ((m >> nIn) >> (nBits - 1 - b)) & 1;
      let nb: number;
      if (spec.ff === "D") nb = holds(excitation[b].min, vars, m);
      else if (spec.ff === "T") nb = cur ^ holds(excitation[b].min, vars, m);
      else {
        const j = holds(excitation[2 * b].min, vars, m);
        const k = holds(excitation[2 * b + 1].min, vars, m);
        nb = j && k ? 1 - cur : j ? 1 : k ? 0 : cur;
      }
      got = (got << 1) | nb;
    }
    if (got !== ns) bad = `No estado S${m >> nIn} (entradas ${nIn ? (m & (combos - 1)).toString(2).padStart(nIn, "0") : "-"}) as equações dão ${stateCode(got, nBits)} e a tabela pede ${stateCode(ns, nBits)}.`;
  }
  for (const f of [...excitation, ...outFns]) {
    const v = verifyMin(f.vars, f.vals, f.min);
    if (!v.ok && !bad) bad = `Equação de ${f.label} diferente da tabela.`;
  }
  return { ok: true, nBits, bits, vars, codes: Array.from({ length: n }, (_, s) => stateCode(s, nBits)), rows, excitation, outFns, verified: bad ? { ok: false, message: bad } : { ok: true, message: "Todas as transições conferem com as equações." } };
}

// ------------------------------------------------------------------------------------------------ circuito no quadro

type Comp = { id: string; type: string; label?: string; params?: Record<string, number | string | boolean>; pos: [number, number] };

/** Monta clock, flip-flops, chaves de entrada, portas de cada equação e LEDs de estado e saída. */
export function buildSeqCircuit(name: string, spec: SeqSpec, r: SeqResult, freq = 1): ProjectIR {
  const comps: Comp[] = [];
  const conns: [string, string, string, string][] = [];
  const nIn = spec.inputs.length;
  comps.push({ id: "clk", type: "dig.clock", label: "Clock", params: { f: freq }, pos: [0, 0] });
  spec.inputs.forEach((v, i) => comps.push({ id: `in_${i}`, type: "dig.switch", label: v, params: { on: false }, pos: [0, 120 + i * 90] }));
  const ffType = spec.ff === "D" ? "dig.dff" : spec.ff === "T" ? "dig.tff" : "dig.jkff";
  const ffId = (b: number) => `ff_${b}`;
  r.bits.forEach((bn, b) => comps.push({ id: ffId(b), type: ffType, label: `FF ${bn}`, pos: [1000, b * 190] }));
  r.bits.forEach((bn, b) => {
    conns.push(["clk", "y", ffId(b), "clk"]);
    comps.push({ id: `led_q${b}`, type: "dig.led", label: `Estado ${bn}`, params: { color: "green" }, pos: [1300, b * 190] });
    conns.push([ffId(b), "q", `led_q${b}`, "a"]);
  });
  const src = (v: string, neg: boolean): [string, string] => {
    const bi = r.bits.indexOf(v);
    if (bi >= 0) return [ffId(bi), neg ? "qn" : "q"];
    const ii = spec.inputs.indexOf(v);
    if (!neg) return [`in_${ii}`, "y"];
    const id = `nin_${ii}`;
    if (!comps.some((c) => c.id === id)) {
      comps.push({ id, type: "dig.not", label: `${v}'`, pos: [220, 120 + ii * 90 + 30] });
      conns.push([`in_${ii}`, "y", id, "a"]);
    }
    return [id, "y"];
  };
  const letters = "abcdefgh";
  let row = 0;
  const sop = (tag: string, f: { label: string; min: Minimized }): [string, string] => {
    const m = f.min;
    const y0 = row * 70;
    if (m.constant !== null) {
      const id = `k_${tag}`;
      comps.push({ id, type: "dig.switch", label: `${f.label} = ${m.constant}`, params: { on: m.constant === 1 }, pos: [520, y0] });
      row++;
      return [id, "y"];
    }
    const outs: [string, string][] = [];
    m.groups.forEach((g, ti) => {
      if (g.literals.length === 1) {
        outs.push(src(g.literals[0].name, g.literals[0].neg));
        return;
      }
      const id = `and_${tag}_${ti}`;
      comps.push({ id, type: "dig.and", label: `${f.label}: ${g.text}`, params: { n: Math.min(8, g.literals.length) }, pos: [420, (row + ti) * 70] });
      g.literals.slice(0, 8).forEach((l: Literal, k) => conns.push([...src(l.name, l.neg), id, letters[k]] as [string, string, string, string]));
      outs.push([id, "y"]);
    });
    let last: [string, string];
    if (outs.length === 1) last = outs[0];
    else {
      const id = `or_${tag}`;
      comps.push({ id, type: "dig.or", label: `${f.label} (soma)`, params: { n: Math.min(8, outs.length) }, pos: [700, row * 70 + ((m.groups.length - 1) * 70) / 2] });
      outs.slice(0, 8).forEach((t, k) => conns.push([t[0], t[1], id, letters[k]]));
      last = [id, "y"];
    }
    row += Math.max(1, m.groups.length);
    return last;
  };
  r.excitation.forEach((f, i) => {
    const b = spec.ff === "JK" ? i >> 1 : i;
    const port = spec.ff === "D" ? "d" : spec.ff === "T" ? "t" : i % 2 === 0 ? "j" : "k";
    const o = sop(`e${i}`, f);
    conns.push([o[0], o[1], ffId(b), port]);
  });
  r.outFns.forEach((f, i) => {
    const o = sop(`o${i}`, f);
    comps.push({ id: `led_o${i}`, type: "dig.led", label: f.label, params: { color: "red" }, pos: [1000, 3 * 190 + i * 80 + 60] });
    conns.push([o[0], o[1], `led_o${i}`, "a"]);
  });
  void nIn;
  return build(name, comps, conns, { tf: 20, solver: "rk4", h: 0.01 });
}

// ------------------------------------------------------------------------------------------------ exemplos

export const SEQ_EXAMPLES: { id: string; title: string; goal: string; spec: SeqSpec }[] = [
  {
    id: "cont6",
    title: "Contador 0 a 5",
    goal: "Contador crescente de 0 a 5 que volta a 0 depois do 5. A saída Z acende no estado 5.",
    spec: { nStates: 6, inputs: [], ff: "JK", next: [[1], [2], [3], [4], [5], [0]], outputs: [{ name: "Z", byState: [0, 0, 0, 0, 0, 1] }] },
  },
  {
    id: "updown",
    title: "Contador sobe e desce (4 estados)",
    goal: "Contador de 2 bits. Com X = 1 conta para cima (0, 1, 2, 3, 0...). Com X = 0 conta para baixo.",
    spec: { nStates: 4, inputs: ["X"], ff: "T", next: [[3, 1], [0, 2], [1, 3], [2, 0]], outputs: [] },
  },
  {
    id: "det101",
    title: "Detector da sequência 101",
    goal: "Recebe um bit X por ciclo de clock. A saída Z fica em 1 quando os três últimos bits foram 1, 0, 1 (com sobreposição). Estados: S0 nada visto, S1 viu 1, S2 viu 10, S3 viu 101.",
    spec: { nStates: 4, inputs: ["X"], ff: "D", next: [[0, 1], [2, 1], [0, 3], [2, 1]], outputs: [{ name: "Z", byState: [0, 0, 0, 1] }] },
  },
  {
    id: "sem4",
    title: "Semáforo de 4 fases",
    goal: "Quatro fases em sequência a cada clock: verde, amarelo, vermelho 1 e vermelho 2 (todos vermelhos). Saídas: V (verde) e A (amarelo).",
    spec: {
      nStates: 4,
      inputs: [],
      ff: "D",
      next: [[1], [2], [3], [0]],
      outputs: [
        { name: "V", byState: [1, 0, 0, 0] },
        { name: "A", byState: [0, 1, 0, 0] },
      ],
    },
  },
];
