// Leitura de equações digitadas: EDO linear, função de transferência e espaço de estados.
// Tudo vira G(s) = N(s)/D(s). Polinômios internos em potências crescentes; na saída, decrescentes.

import { polyTex, tn } from "./math";

type Poly = number[];
interface Rat {
  n: Poly;
  d: Poly;
}
/** Combinação linear de variáveis (chave "" é o termo sem variável), com coeficientes racionais em s. */
type Val = Map<string, Rat>;

// ------------------------------------------------------------------------------------------------ polinômios

const ptrim = (p: Poly): Poly => {
  const q = p.slice();
  while (q.length > 1 && q[q.length - 1] === 0) q.pop();
  return q.length ? q : [0];
};
const padd = (a: Poly, b: Poly): Poly => {
  const r = new Array(Math.max(a.length, b.length)).fill(0);
  a.forEach((v, i) => (r[i] += v));
  b.forEach((v, i) => (r[i] += v));
  return ptrim(r);
};
const pscale = (a: Poly, k: number): Poly => ptrim(a.map((v) => v * k));
const pmul = (a: Poly, b: Poly): Poly => {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
  return ptrim(r);
};
const pzero = (a: Poly) => a.every((v) => v === 0);

const rconst = (v: number): Rat => ({ n: [v], d: [1] });
const radd = (a: Rat, b: Rat): Rat => ({ n: padd(pmul(a.n, b.d), pmul(b.n, a.d)), d: pmul(a.d, b.d) });
const rmul = (a: Rat, b: Rat): Rat => ({ n: pmul(a.n, b.n), d: pmul(a.d, b.d) });
const rneg = (a: Rat): Rat => ({ n: pscale(a.n, -1), d: a.d });

// ------------------------------------------------------------------------------------------------ operações sobre Val

const scalarOnly = (v: Val) => [...v.keys()].every((k) => k === "");
const scalarOf = (v: Val): Rat => v.get("") ?? rconst(0);
const vconst = (x: number): Val => new Map([["", rconst(x)]]);

function vadd(a: Val, b: Val, sign = 1): Val {
  const r: Val = new Map(a);
  for (const [k, x] of b) {
    const y = sign === 1 ? x : rneg(x);
    r.set(k, r.has(k) ? radd(r.get(k)!, y) : y);
  }
  return r;
}
function vmul(a: Val, b: Val): Val {
  if (scalarOnly(b)) {
    const s = scalarOf(b);
    return new Map([...a].map(([k, x]) => [k, rmul(x, s)]));
  }
  if (scalarOnly(a)) return vmul(b, a);
  throw new Error("A equação tem um produto entre duas variáveis. Só equações lineares são aceitas.");
}
function vdiv(a: Val, b: Val): Val {
  if (!scalarOnly(b)) throw new Error("A equação divide por uma variável. Só equações lineares são aceitas.");
  const s = scalarOf(b);
  if (pzero(s.n)) throw new Error("Divisão por zero.");
  return vmul(a, new Map([["", { n: s.d, d: s.n }]]));
}
function vpow(a: Val, k: number): Val {
  if (!scalarOnly(a) && k !== 1) throw new Error("Só é possível elevar a uma potência números e s, não variáveis.");
  if (k === 1) return a;
  if (k === 0) return vconst(1);
  const s = scalarOf(a);
  let r = rconst(1);
  const base = k > 0 ? s : { n: s.d, d: s.n };
  if (k < 0 && pzero(s.n)) throw new Error("Divisão por zero.");
  for (let i = 0; i < Math.abs(k); i++) r = rmul(r, base);
  return new Map([["", r]]);
}

// ------------------------------------------------------------------------------------------------ léxico e parser

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const WORDS = new Set(["tau", "theta", "omega", "vin", "vout", "iin", "uin", "yout"]);

function preprocess(raw: string): string {
  let s = raw
    .replace(/[−–—]/g, "-")
    .replace(/[·×⋅]/g, "*")
    .replace(/[’′`´]/g, "'")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/ /g, " ");
  s = s.replace(/([A-Za-z](?:_\w+)?'*)\s*\(\s*[ts]\s*\)/g, "$1");
  // d2y/dt2, d^2y/dt^2, dy/dt
  s = s.replace(/\bd\^?(\d*)\s*([A-Za-z](?:_\w+)?)\s*\/\s*d\s*t\s*\^?(\d*)/g, (_m, a: string, v: string, b: string) => {
    const k = Number(a || b || 1);
    return v + "'".repeat(k);
  });
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  return s;
}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const mn = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (mn) {
      out.push({ t: "num", v: Number(mn[0]) });
      i += mn[0].length;
      continue;
    }
    const mi = /^[A-Za-z]+(?:_[A-Za-z0-9]+)?/.exec(src.slice(i));
    if (mi) {
      const w = mi[0];
      if (w.toLowerCase() === "pi") out.push({ t: "num", v: Math.PI });
      else if (WORDS.has(w.toLowerCase()) || w.includes("_") || w.length === 1) out.push({ t: "id", v: w });
      else for (const c of w) out.push({ t: "id", v: c });
      i += w.length;
      continue;
    }
    if ("+-*/^()'".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    throw new Error(`Caractere não reconhecido: "${ch}".`);
  }
  return out;
}

class Parser {
  i = 0;
  names = new Map<string, string>(); // minúsculo -> como foi escrito
  constructor(private toks: Tok[]) {}
  private peek() {
    return this.toks[this.i];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  done() {
    return this.i >= this.toks.length;
  }
  expr(): Val {
    let v = this.term();
    for (;;) {
      if (this.isOp("+")) {
        this.i++;
        v = vadd(v, this.term());
      } else if (this.isOp("-")) {
        this.i++;
        v = vadd(v, this.term(), -1);
      } else return v;
    }
  }
  private startsFactor() {
    const t = this.peek();
    return !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("));
  }
  private term(): Val {
    let v = this.unary();
    for (;;) {
      if (this.isOp("*")) {
        this.i++;
        v = vmul(v, this.unary());
      } else if (this.isOp("/")) {
        this.i++;
        v = vdiv(v, this.unary());
      } else if (this.startsFactor()) v = vmul(v, this.unary());
      else return v;
    }
  }
  private unary(): Val {
    if (this.isOp("-")) {
      this.i++;
      return vmul(this.unary(), vconst(-1));
    }
    if (this.isOp("+")) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }
  private power(): Val {
    const base = this.atom();
    if (!this.isOp("^")) return base;
    this.i++;
    let neg = false;
    if (this.isOp("-")) {
      neg = true;
      this.i++;
    } else if (this.isOp("+")) this.i++;
    let k: number;
    if (this.isOp("(")) {
      const e = this.atom();
      if (!scalarOnly(e)) throw new Error("O expoente precisa ser um número inteiro.");
      const r = scalarOf(e);
      if (r.n.length !== 1 || r.d.length !== 1) throw new Error("O expoente precisa ser um número inteiro.");
      k = r.n[0] / r.d[0];
    } else {
      const t = this.peek();
      if (t?.t !== "num") throw new Error("O expoente precisa ser um número inteiro.");
      this.i++;
      k = t.v;
    }
    if (!Number.isInteger(k) || Math.abs(k) > 12) throw new Error("O expoente precisa ser um número inteiro entre -12 e 12.");
    return vpow(base, neg ? -k : k);
  }
  private atom(): Val {
    const t = this.peek();
    if (!t) throw new Error("A expressão terminou antes do esperado.");
    if (t.t === "num") {
      this.i++;
      return vconst(t.v);
    }
    if (t.t === "id") {
      this.i++;
      let primes = 0;
      while (this.isOp("'")) {
        primes++;
        this.i++;
      }
      if (t.v === "s" && primes === 0) return new Map([["", { n: [0, 1], d: [1] }]]);
      const key = t.v.toLowerCase();
      if (!this.names.has(key)) this.names.set(key, t.v);
      const sp: Poly = new Array(primes + 1).fill(0);
      sp[primes] = 1;
      return new Map([[key, { n: sp, d: [1] }]]);
    }
    if (t.t === "op" && t.v === "(") {
      this.i++;
      const v = this.expr();
      if (!this.isOp(")")) throw new Error("Falta fechar um parêntese.");
      this.i++;
      return v;
    }
    throw new Error(`Símbolo inesperado: "${t.v}".`);
  }
}

function evalText(text: string): { val: Val; names: Map<string, string> } {
  const p = new Parser(lex(preprocess(text)));
  if (p.done()) throw new Error("Escreva a equação.");
  const val = p.expr();
  if (!p.done()) throw new Error("Há um trecho que não consegui ler. Confira os parênteses e os operadores.");
  return { val, names: p.names };
}

// ------------------------------------------------------------------------------------------------ modelo

export interface EqModel {
  /** Numerador e denominador, potências decrescentes de s. */
  num: number[];
  den: number[];
  inName: string;
  outName: string;
  kind: "tf" | "ode" | "ss";
  ss?: { A: number[][]; B: number[]; C: number[]; D: number };
  warnings: string[];
}
export type EqResult = { ok: true; model: EqModel } | { ok: false; error: string };

export interface EqOptions {
  /** Nome da variável de entrada, quando a equação tem duas variáveis. */
  input?: string;
  output?: string;
}

const INPUT_HINTS = ["u", "f", "e", "r", "vin", "v_in", "uin", "iin", "tau", "x_in", "ref"];

const desc = (p: Poly): number[] => ptrim(p).slice().reverse();

function finish(h: Rat, inName: string, outName: string, kind: EqModel["kind"], warnings: string[] = []): EqResult {
  const n = ptrim(h.n);
  const d = ptrim(h.d);
  if (pzero(d)) return { ok: false, error: "O denominador é zero." };
  if (pzero(n)) return { ok: false, error: "A função de transferência é zero (a saída não depende da entrada)." };
  const mx = Math.max(...n.map(Math.abs), ...d.map(Math.abs));
  const clean = (p: Poly) => p.map((v) => (Math.abs(v) < 1e-12 * mx ? 0 : v));
  const nn = ptrim(clean(n));
  const dd = ptrim(clean(d));
  if (nn.length > dd.length) {
    return {
      ok: false,
      error: `A função é imprópria: o numerador tem grau ${nn.length - 1} e o denominador ${dd.length - 1}. Isso exige derivar a entrada, e nenhum circuito ou diagrama com integradores faz isso exatamente.`,
    };
  }
  if (dd.length === 1) return { ok: false, error: "O sistema não tem dinâmica (é só um ganho). Escreva uma equação com derivadas, por exemplo y' + 2y = u." };
  const lead = dd[dd.length - 1];
  return {
    ok: true,
    model: { num: desc(pscale(nn, 1 / lead)), den: desc(pscale(dd, 1 / lead)), inName, outName, kind, warnings },
  };
}

/** Lê uma EDO linear ou uma função de transferência. */
export function parseEquation(text: string, opts: EqOptions = {}): EqResult {
  try {
    const src = text.trim();
    if (!src) return { ok: false, error: "Escreva a equação." };
    const eq = src.split("=");
    if (eq.length > 2) return { ok: false, error: 'Use um único sinal de "=".' };

    // Y(s)/U(s) = expressão
    if (eq.length === 2) {
      const m = /^\s*([A-Za-z](?:_\w+)?)\s*(?:\(\s*s\s*\))?\s*\/\s*([A-Za-z](?:_\w+)?)\s*(?:\(\s*s\s*\))?\s*$/.exec(eq[0]);
      if (m && m[1].toLowerCase() !== "s" && m[2].toLowerCase() !== "s") {
        const { val, names } = evalText(eq[1]);
        if (names.size) return { ok: false, error: "Do lado direito de Y/U = ... use só números e s." };
        return finish(scalarOf(val), m[2], m[1], "tf");
      }
    }
    const L = evalText(eq[0]);
    const R = eq.length === 2 ? evalText(eq[1]) : { val: new Map() as Val, names: new Map<string, string>() };
    const names = new Map([...L.names, ...R.names]);
    const v = eq.length === 2 ? vadd(L.val, R.val, -1) : L.val;
    const vars = [...v.keys()].filter((k) => k !== "" && !pzero(v.get(k)!.n));

    if (eq.length === 1) {
      if (vars.length) return { ok: false, error: 'Falta o sinal de "=". Escreva, por exemplo, y\'\' + 3y\' + 2y = u.' };
      return finish(scalarOf(v), "u", "y", "tf");
    }
    if (vars.length === 0) return { ok: false, error: "Não encontrei nenhuma variável. Escreva algo como y' + 2y = u, ou H(s) = 1/(s+2)." };
    const nameOf = (k: string) => names.get(k) ?? k;

    if (vars.length === 1) {
      // H(s) = ... ou y'' + 3y' + 2y = 5: o termo sem variável é a entrada
      const k = vars[0];
      const cy = v.get(k)!;
      const c0 = scalarOf(v);
      if (pzero(c0.n)) return { ok: false, error: `A equação tem só a variável ${nameOf(k)} e nenhuma entrada. Escreva a entrada do outro lado, por exemplo u.` };
      const h: Rat = { n: pscale(c0.n, -1), d: c0.d };
      const hh = rmul(h, { n: cy.d, d: cy.n });
      const isH = /^[hg]$/i.test(k);
      return finish(hh, "u", isH ? "y" : nameOf(k), "ode", isH ? [] : ["O termo sem variável foi tratado como entrada constante (degrau)."]);
    }
    if (vars.length > 2) return { ok: false, error: `Encontrei ${vars.length} variáveis (${vars.map(nameOf).join(", ")}). Use só uma entrada e uma saída.` };

    // duas variáveis: decide quem é entrada e quem é saída
    let inK = opts.input ? vars.find((k) => k === opts.input!.toLowerCase()) : undefined;
    let outK = opts.output ? vars.find((k) => k === opts.output!.toLowerCase()) : undefined;
    if (inK && !outK) outK = vars.find((k) => k !== inK);
    if (outK && !inK) inK = vars.find((k) => k !== outK);
    if (!inK || !outK) {
      const hint = INPUT_HINTS.map((h) => vars.find((k) => k === h)).find(Boolean);
      if (hint) {
        inK = hint;
        outK = vars.find((k) => k !== hint);
      } else {
        // a saída é a variável de maior grau
        const deg = (k: string) => Math.max(v.get(k)!.n.length, v.get(k)!.d.length);
        const [a, b] = vars;
        outK = deg(a) >= deg(b) ? a : b;
        inK = outK === a ? b : a;
      }
    }
    const cy = v.get(outK!)!;
    const cu = v.get(inK!)!;
    // cy·Y + cu·U = 0  =>  Y/U = -cu/cy
    const h: Rat = rmul(rneg(cu), { n: cy.d, d: cy.n });
    return finish(h, nameOf(inK!), nameOf(outK!), "ode");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------------------------------------ espaço de estados

/** Lê "0 1; -2 -3", "[0 1; -2 -3]", "0, 1; -2, -3". Vírgula entre dígitos é decimal. */
export function parseMatrix(text: string): number[][] {
  const t = text.replace(/[[\]]/g, "").replace(/−/g, "-").trim();
  if (!t) throw new Error("Matriz vazia.");
  const rows = t.split(/;|\n/).map((r) => r.trim()).filter(Boolean);
  const m = rows.map((r) =>
    r
      .replace(/(\d),(\d)/g, "$1.$2")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((x) => {
        const frac = x.split("/");
        const v = frac.length === 2 ? Number(frac[0]) / Number(frac[1]) : Number(x);
        if (!Number.isFinite(v)) throw new Error(`Valor inválido na matriz: "${x}".`);
        return v;
      }),
  );
  if (m.some((r) => r.length !== m[0].length)) throw new Error("As linhas da matriz têm tamanhos diferentes.");
  return m;
}

/** G(s) = C (sI - A)^-1 B + D pelo método de Faddeev-LeVerrier. Retorna [num, den] crescentes. */
export function ssToTf(A: number[][], B: number[], C: number[], D: number): [Poly, Poly] {
  const n = A.length;
  const mul = (X: number[][], Y: number[][]) => X.map((r) => Y[0].map((_, j) => r.reduce((a, v, k) => a + v * Y[k][j], 0)));
  const I = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  const c: number[] = new Array(n + 1).fill(0);
  c[n] = 1;
  let M = A.map((r) => r.map(() => 0));
  const adj: number[][][] = []; // adj[k] multiplica s^(n-1-k)
  for (let k = 1; k <= n; k++) {
    const AM = mul(A, M);
    M = AM.map((r, i) => r.map((v, j) => v + c[n - k + 1] * I[i][j]));
    adj.push(M);
    const AMk = mul(A, M);
    c[n - k] = -AMk.reduce((a, r, i) => a + r[i], 0) / k;
  }
  const num: Poly = new Array(n + 1).fill(0);
  adj.forEach((Mk, k) => {
    // coeficiente de s^(n-1-k)
    let v = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += C[i] * Mk[i][j] * B[j];
    num[n - 1 - k] += v;
  });
  for (let i = 0; i <= n; i++) num[i] += D * c[i];
  return [ptrim(num), ptrim(c)];
}

export function parseStateSpace(a: string, b: string, c: string, d: string): EqResult {
  try {
    const A = parseMatrix(a);
    const n = A.length;
    if (A.some((r) => r.length !== n)) return { ok: false, error: "A matriz A precisa ser quadrada." };
    const Bm = parseMatrix(b);
    const Cm = parseMatrix(c);
    const Dm = parseMatrix(d || "0");
    if (Bm.length !== n || Bm[0].length !== 1) return { ok: false, error: `B precisa ter ${n} linha(s) e 1 coluna (uma entrada).` };
    if (Cm.length !== 1 || Cm[0].length !== n) return { ok: false, error: `C precisa ter 1 linha e ${n} coluna(s) (uma saída).` };
    if (Dm.length !== 1 || Dm[0].length !== 1) return { ok: false, error: "D precisa ser um número." };
    const B = Bm.map((r) => r[0]);
    const C = Cm[0];
    const D = Dm[0][0];
    const [nu, de] = ssToTf(A, B, C, D);
    const r = finish({ n: nu, d: de }, "u", "y", "ss");
    if (r.ok) r.model.ss = { A, B, C, D };
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------------------------------------ TeX e formas canônicas

const sgn = (v: number) => (v < 0 ? "-" : "+");

function terms(coefDesc: number[], sym: (k: number) => string): string {
  const n = coefDesc.length - 1;
  const parts: string[] = [];
  coefDesc.forEach((c, i) => {
    if (c === 0) return;
    const k = n - i;
    const a = Math.abs(c);
    const sy = sym(k);
    const body = a === 1 && sy !== "" ? sy : `${tn(a)}${sy}`;
    parts.push(parts.length === 0 ? (c < 0 ? "-" : "") + body : ` ${sgn(c)} ${body}`);
  });
  return parts.join("") || "0";
}

const der = (name: string) => (k: number) => (k === 0 ? name : k <= 3 ? `${name}${"'".repeat(k)}` : `${name}^{(${k})}`);

export function tfTex(m: EqModel): string {
  return `H(s)=\\frac{${polyTex(m.num)}}{${polyTex(m.den)}}`;
}

export function odeTex(m: EqModel): string {
  const y = m.outName.replace(/_(\w+)/, "_{$1}");
  const u = m.inName.replace(/_(\w+)/, "_{$1}");
  const pad = m.num.length < m.den.length ? [...new Array(m.den.length - m.num.length).fill(0), ...m.num] : m.num;
  const lhs = terms(m.den, (k) => (k === 0 ? y : der(y)(k)));
  const rhs = terms(pad, (k) => (k === 0 ? u : der(u)(k)));
  return `${lhs}=${rhs}`;
}

export function matTex(M: number[][]): string {
  return `\\begin{bmatrix}${M.map((r) => r.map((v) => tn(v)).join("&")).join("\\\\")}\\end{bmatrix}`;
}

/** Forma canônica controlável do modelo (denominador mônico). */
export function canonicalSS(m: EqModel): { A: number[][]; B: number[]; C: number[]; D: number } {
  const n = m.den.length - 1;
  const a = m.den.slice().reverse(); // a[i] = coeficiente de s^i, a[n] = 1
  const nump = m.num.slice().reverse();
  const b = Array.from({ length: n + 1 }, (_, i) => nump[i] ?? 0);
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i < n - 1 ? (j === i + 1 ? 1 : 0) : -a[j])));
  const B = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0));
  const C = Array.from({ length: n }, (_, i) => b[i] - b[n] * a[i]);
  return { A, B, C, D: b[n] };
}

export function ssTex(s: { A: number[][]; B: number[]; C: number[]; D: number }): string {
  return `\\dot{\\mathbf{x}}=${matTex(s.A)}\\mathbf{x}+${matTex(s.B.map((v) => [v]))}u,\\qquad y=${matTex([s.C])}\\mathbf{x}+${tn(s.D)}\\,u`;
}

/** Formata uma matriz para o campo de texto do bloco de espaço de estados. */
export const matText = (M: number[][]): string => M.map((r) => r.map((v) => String(+v.toPrecision(12))).join(" ")).join("; ");
