// Segunda leva da biblioteca: fontes extras, funções matemáticas, roteamento, filtros,
// controle (PI, PD, avanço e atraso, PID de dois graus de liberdade), controle digital
// (amostrador, atraso z⁻¹, função de transferência em z, integrador, PID discreto) e
// não linearidades (relé com histerese, quantizador, tabela, limitador de taxa).
// Todos são blocos de sinal. Os símbolos usam o desenho genérico "g:texto|subtexto".

import type { ParamDef, PortDef } from "../types";
import { tfToCanonical } from "./blocks";
import { type BlockImpl, type CategoryId, type ParamReader, parseNumberList, registerComponent } from "./registry";

const inP = (name: string, label: string, optional = false): PortDef => ({ name, label, domain: "signal", dir: "in", optional });
const outP = (name: string, label: string): PortDef => ({ name, label, domain: "signal", dir: "out" });
const noStates = { nStates: 0, x0: () => [] as number[], der: () => {} };
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const IN: PortDef[] = [inP("in", "Entrada")];
const OUT: PortDef[] = [outP("out", "Saída")];
const IO: PortDef[] = [...IN, ...OUT];

/** Bloco sem dinâmica de uma entrada e uma saída. */
const pure = (f: (u: number) => number): BlockImpl => ({ ...noStates, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = f(u[0])) });

/** Função de transferência a partir de listas de coeficientes. */
function tfImpl(num: number[], den: number[]): BlockImpl {
  const { a, c, d } = tfToCanonical(num.join(" "), den.join(" "));
  const n = a.length;
  return {
    nStates: n,
    x0: () => new Array<number>(n).fill(0),
    feedthrough: d !== 0,
    out: (_t, x, o, u, y) => {
      let s = d * u[0];
      for (let i = 0; i < n; i++) s += c[i] * x[o + i];
      y[0] = s;
    },
    der: (_t, x, o, u, dx) => {
      let s = u[0];
      for (let i = 0; i < n; i++) s -= a[i] * x[o + i];
      dx[o] = s;
      for (let i = 1; i < n; i++) dx[o + i] = x[o + i - 1];
    },
  };
}

interface Spec {
  type: string;
  label: string;
  category: CategoryId;
  prefix: string;
  symbol: string;
  description: string;
  model: string;
  hypotheses?: string[];
  ports?: PortDef[] | ((p: ParamReader) => PortDef[]);
  params?: ParamDef[];
  block: (p: ParamReader, id: string) => BlockImpl;
  keywords?: string;
}

function reg(s: Spec): void {
  registerComponent({
    type: s.type,
    label: s.label,
    category: s.category,
    labelPrefix: s.prefix,
    symbol: s.symbol,
    description: s.description,
    model: s.model,
    hypotheses: s.hypotheses ?? ["Sem hipóteses adicionais."],
    ports: s.ports ?? IO,
    params: s.params ?? [],
    block: s.block,
    keywords: s.keywords,
  });
}

const num = (key: string, label: string, def: number, extra: Partial<ParamDef> = {}): ParamDef => ({ key, label, kind: "number", default: def, group: "basic", ...extra });

// ---------------------------------------------------------------- Fontes extras

function periodicBreakpoints(td: number, T: number, marks: number[], t0: number, tf: number): number[] {
  const out: number[] = [];
  for (let k = 0; out.length < 200000; k++) {
    const base = td + k * T;
    if (base >= tf) break;
    for (const m of marks) {
      const t = base + m * T;
      if (t > t0 && t < tf) out.push(t);
    }
  }
  return out;
}

reg({
  type: "signal.sawtooth",
  label: "Dente de serra",
  category: "sources",
  prefix: "Serra",
  symbol: "g:/|/|/",
  description: "Rampa que sobe até a amplitude e cai de volta a cada período.",
  model: "y = offset + A·(t mod T)/T",
  keywords: "sawtooth rampa periodica pwm portadora",
  ports: OUT,
  params: [num("A", "Amplitude", 1), num("period", "Período", 1, { unit: "s", min: 1e-6 }), num("offset", "Nível base", 0), num("delay", "Atraso", 0, { unit: "s", min: 0, group: "advanced" })],
  block: (p) => {
    const A = p.num("A"),
      T = p.num("period"),
      c = p.num("offset"),
      td = p.num("delay");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => {
        if (t < td) y[0] = c;
        else y[0] = c + A * (((t - td) / T) % 1);
      },
      breakpoints: (t0, tf) => periodicBreakpoints(td, T, [0], t0, tf),
    };
  },
});

reg({
  type: "signal.triangle",
  label: "Onda triangular",
  category: "sources",
  prefix: "Triangular",
  symbol: "g:/\\/\\",
  description: "Sobe e desce em linha reta, entre o valor mínimo e o máximo.",
  model: "y varia linearmente entre lo e hi, com período T",
  keywords: "triangle triangular",
  ports: OUT,
  params: [num("hi", "Valor alto", 1), num("lo", "Valor baixo", -1), num("period", "Período", 2, { unit: "s", min: 1e-6 }), num("delay", "Atraso", 0, { unit: "s", min: 0, group: "advanced" })],
  block: (p) => {
    const hi = p.num("hi"),
      lo = p.num("lo"),
      T = p.num("period"),
      td = p.num("delay");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => {
        if (t < td) {
          y[0] = lo;
          return;
        }
        const ph = ((t - td) / T) % 1;
        y[0] = lo + (hi - lo) * (ph < 0.5 ? 2 * ph : 2 - 2 * ph);
      },
      breakpoints: (t0, tf) => periodicBreakpoints(td, T, [0, 0.5], t0, tf),
    };
  },
});

reg({
  type: "signal.chirp",
  label: "Varredura de frequência (chirp)",
  category: "sources",
  prefix: "Chirp",
  symbol: "g:chirp",
  description: "Senoide cuja frequência sobe de f0 até f1 durante o tempo T. Serve para testar a resposta em frequência de um sistema numa única simulação.",
  model: "y = A·sen(2π(f0·t + (f1 − f0)·t²/(2T)))",
  hypotheses: ["Depois de T, a frequência fica em f1."],
  keywords: "sweep varredura frequencia resposta em frequencia sine sweep",
  ports: OUT,
  params: [num("A", "Amplitude", 1), num("f0", "Frequência inicial", 0.1, { unit: "Hz", min: 0 }), num("f1", "Frequência final", 5, { unit: "Hz", min: 0 }), num("T", "Duração da varredura", 20, { unit: "s", min: 1e-6 })],
  block: (p) => {
    const A = p.num("A"),
      f0 = p.num("f0"),
      f1 = p.num("f1"),
      T = p.num("T");
    const phase = (t: number) => (t <= T ? f0 * t + ((f1 - f0) * t * t) / (2 * T) : f0 * T + ((f1 - f0) * T) / 2 + f1 * (t - T));
    return { ...noStates, feedthrough: false, out: (t, _x, _o, _u, y) => void (y[0] = A * Math.sin(2 * Math.PI * phase(t))), minTimescale: () => 1 / (20 * Math.max(f0, f1, 1e-9)) };
  },
});

/** Número pseudoaleatório determinístico em (0, 1) a partir de um inteiro e uma semente. */
function hash01(k: number, seed: number): number {
  let h = (Math.imul(k | 0, 0x9e3779b1) ^ Math.imul((seed | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h + 0.5) / 4294967296;
}
const gauss = (k: number, seed: number) => Math.sqrt(-2 * Math.log(hash01(k, seed))) * Math.cos(2 * Math.PI * hash01(k, seed + 7919));

reg({
  type: "signal.noise",
  label: "Ruído gaussiano",
  category: "sources",
  prefix: "Ruído",
  symbol: "g:ruído|~",
  description: "Ruído aleatório que muda a cada intervalo de amostragem e fica constante entre as mudanças. A mesma semente dá sempre a mesma sequência.",
  model: "y = média + σ·n[k], com n[k] gaussiano de média 0 e variância 1",
  hypotheses: ["Ruído branco com retenção de ordem zero. Sequência repetível: não é um gerador criptográfico."],
  keywords: "noise ruido aleatorio random sensor perturbacao",
  ports: OUT,
  params: [num("sigma", "Desvio padrão σ", 0.1, { min: 0 }), num("mean", "Média", 0), num("Ts", "Intervalo de amostragem", 0.05, { unit: "s", min: 1e-4 }), num("seed", "Semente", 1, { kind: "int", min: 0, group: "advanced" })],
  block: (p) => {
    const s = p.num("sigma"),
      m = p.num("mean"),
      Ts = p.num("Ts"),
      seed = p.num("seed");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => void (y[0] = m + s * gauss(Math.floor(t / Ts + 1e-9), seed)),
      breakpoints: (t0, tf) => periodicBreakpoints(0, Ts, [0], t0, tf),
    };
  },
});

reg({
  type: "signal.time",
  label: "Tempo (relógio)",
  category: "sources",
  prefix: "Tempo",
  symbol: "g:t",
  description: "Sai o tempo da simulação. Útil para montar funções do tempo com os blocos de matemática.",
  model: "y = t",
  keywords: "clock relogio tempo time",
  ports: OUT,
  block: () => ({ ...noStates, feedthrough: false, out: (t, _x, _o, _u, y) => void (y[0] = t) }),
});

reg({
  type: "signal.table",
  label: "Sinal por tabela",
  category: "sources",
  prefix: "Tabela",
  symbol: "g:tabela|t → y",
  description: "Sinal definido por pontos tempo:valor, com interpolação em linha reta ou em degraus. Serve para reproduzir um perfil medido.",
  model: "y(t) interpolado entre os pontos t:y informados",
  hypotheses: ["Antes do primeiro ponto vale o primeiro valor. Depois do último, vale o último."],
  keywords: "lookup perfil curva medido csv dados from workspace",
  ports: OUT,
  params: [
    { key: "pts", label: "Pontos (tempo:valor)", kind: "text", default: "0:0; 2:1; 4:1; 6:0", group: "basic", hint: "Ex.: 0:0; 2:1; 4:1; 6:0" },
    { key: "mode", label: "Interpolação", kind: "select", default: "linear", group: "basic", options: [{ value: "linear", label: "Linear" }, { value: "step", label: "Em degraus" }] },
  ],
  block: (p) => {
    const pts = parsePairs(p.str("pts"), "Tabela");
    const step = p.str("mode") === "step";
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => void (y[0] = interp(pts, t, step)),
      breakpoints: (t0, tf) => (step ? pts.map((q) => q[0]).filter((t) => t > t0 && t < tf) : pts.map((q) => q[0]).filter((t) => t > t0 && t < tf)),
    };
  },
});

function parsePairs(text: string, what: string): [number, number][] {
  const items = text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  if (items.length < 2) throw new Error(`${what}: informe ao menos dois pontos no formato x:y.`);
  const pts = items.map((it) => {
    const [a, b] = it.split(":");
    const x = Number((a ?? "").trim().replace(",", ".")),
      y = Number((b ?? "").trim().replace(",", "."));
    if (!Number.isFinite(x) || !Number.isFinite(y) || b === undefined) throw new Error(`${what}: "${it}" não está no formato x:y.`);
    return [x, y] as [number, number];
  });
  for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]) throw new Error(`${what}: os valores de x devem ser crescentes.`);
  return pts;
}

function interp(pts: [number, number][], x: number, step: boolean): number {
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  if (step) return pts[lo][1];
  const f = (x - pts[lo][0]) / (pts[hi][0] - pts[lo][0]);
  return pts[lo][1] + f * (pts[hi][1] - pts[lo][1]);
}

// ---------------------------------------------------------------- Funções matemáticas (uma entrada)

const FUNCS: [string, string, string, (u: number) => number, string, string][] = [
  // id, rótulo, glifo, função, texto do modelo, palavras de busca
  ["sin", "Seno", "sen", Math.sin, "y = sen(u), u em radianos", "sine trigonometria sin"],
  ["cos", "Cosseno", "cos", Math.cos, "y = cos(u), u em radianos", "cosine trigonometria"],
  ["tan", "Tangente", "tan", Math.tan, "y = tan(u), u em radianos", "tangent trigonometria"],
  ["asin", "Arco seno", "asen", (u) => Math.asin(clamp(u, -1, 1)), "y = arcsen(u), u limitado a [−1, 1]", "arcsin inverso trigonometria"],
  ["acos", "Arco cosseno", "acos", (u) => Math.acos(clamp(u, -1, 1)), "y = arccos(u), u limitado a [−1, 1]", "arccos inverso trigonometria"],
  ["atan", "Arco tangente", "atan", Math.atan, "y = arctan(u)", "arctan inverso trigonometria"],
  ["sinh", "Seno hiperbólico", "senh", Math.sinh, "y = senh(u)", "hiperbolico sinh"],
  ["cosh", "Cosseno hiperbólico", "cosh", Math.cosh, "y = cosh(u)", "hiperbolico"],
  ["tanh", "Tangente hiperbólica", "tanh", Math.tanh, "y = tanh(u). Saturação suave entre −1 e 1", "hiperbolico saturacao suave sigmoide"],
  ["exp", "Exponencial", "eᵘ", (u) => Math.exp(clamp(u, -700, 700)), "y = e^u", "exponential exp euler"],
  ["ln", "Logaritmo natural", "ln", (u) => Math.log(Math.max(u, 1e-300)), "y = ln(u), u positivo", "logaritmo log natural neperiano"],
  ["log10", "Logaritmo decimal", "log", (u) => Math.log10(Math.max(u, 1e-300)), "y = log10(u), u positivo", "logaritmo decibel db base 10"],
  ["square", "Quadrado", "u²", (u) => u * u, "y = u²", "potencia quadrado square"],
  ["cube", "Cubo", "u³", (u) => u * u * u, "y = u³", "potencia cubo cube"],
  ["recip", "Inverso (1/u)", "1/u", (u) => 1 / u, "y = 1/u", "reciprocal inverso divisao"],
  ["sign", "Sinal (sgn)", "sgn", Math.sign, "y = −1, 0 ou +1 conforme o sinal de u", "signum sinal coulomb atrito"],
  ["floor", "Arredondar para baixo", "⌊u⌋", Math.floor, "y = ⌊u⌋", "floor arredondamento truncar"],
  ["ceil", "Arredondar para cima", "⌈u⌉", Math.ceil, "y = ⌈u⌉", "ceil arredondamento"],
  ["round", "Arredondar", "arred", Math.round, "y = inteiro mais próximo de u", "round arredondamento"],
  ["deg", "Graus para radianos", "°→rad", (u) => (u * Math.PI) / 180, "y = u·π/180", "conversao angulo grau radiano"],
  ["rad", "Radianos para graus", "rad→°", (u) => (u * 180) / Math.PI, "y = u·180/π", "conversao angulo grau radiano"],
];

for (const [id, label, glyph, f, model, kw] of FUNCS) {
  reg({
    type: `math.fn.${id}`,
    label,
    category: "mathfn",
    prefix: label.split(" ")[0],
    symbol: `g:${glyph}`,
    description: `Aplica ${label.toLowerCase()} ao sinal, ponto a ponto, sem dinâmica.`,
    model,
    hypotheses: ["Sem dinâmica. Fora do domínio da função o valor é limitado ao mais próximo válido."],
    keywords: kw,
    block: () => pure(f),
  });
}

reg({
  type: "math.power",
  label: "Potência u^p",
  category: "mathfn",
  prefix: "Potência",
  symbol: "g:uᵖ",
  description: "Eleva o sinal a um expoente fixo. Para expoente fracionário, valores negativos são tratados em módulo e o sinal é mantido.",
  model: "y = sinal(u)·|u|^p",
  keywords: "power expoente raiz cubica pow",
  params: [num("p", "Expoente p", 2)],
  block: (p) => {
    const e = p.num("p");
    return pure((u) => (Number.isInteger(e) ? Math.pow(u, e) : Math.sign(u) * Math.pow(Math.abs(u), e)));
  },
});

reg({
  type: "math.minmax",
  label: "Mínimo e máximo",
  category: "mathfn",
  prefix: "MinMax",
  symbol: "g:min|max",
  description: "Sai o menor ou o maior dos sinais de entrada.",
  model: "y = min(u1, …, un)  ou  y = max(u1, …, un)",
  keywords: "minimo maximo limitador seletor",
  ports: (p) => [...Array.from({ length: p.num("n") }, (_, i) => inP(`in${i + 1}`, `Entrada ${i + 1}`)), outP("out", "Saída")],
  params: [
    { key: "mode", label: "Operação", kind: "select", default: "min", group: "basic", options: [{ value: "min", label: "Mínimo" }, { value: "max", label: "Máximo" }] },
    { key: "n", label: "Número de entradas", kind: "int", default: 2, min: 2, max: 6, group: "basic", structural: true },
  ],
  block: (p) => {
    const n = p.num("n"),
      mx = p.str("mode") === "max";
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => {
        let r = u[0];
        for (let i = 1; i < n; i++) r = mx ? Math.max(r, u[i]) : Math.min(r, u[i]);
        y[0] = r;
      },
    };
  },
});

reg({
  type: "math.atan2",
  label: "Arco tangente de 2 entradas",
  category: "mathfn",
  prefix: "atan2",
  symbol: "g:atan2",
  description: "Ângulo do ponto (x, y), em radianos, entre −π e π. Útil para fase de sinais.",
  model: "y = atan2(u1, u2)",
  keywords: "angulo fase atan2 arctan quadrante",
  ports: [inP("in1", "y (cateto oposto)"), inP("in2", "x (cateto adjacente)"), outP("out", "Ângulo")],
  block: () => ({ ...noStates, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = Math.atan2(u[0], u[1])) }),
});

reg({
  type: "math.mean",
  label: "Média de sinais",
  category: "mathfn",
  prefix: "Média",
  symbol: "g:média|x̄",
  description: "Média aritmética das entradas.",
  model: "y = (u1 + … + un)/n",
  keywords: "media average mean",
  ports: (p) => [...Array.from({ length: p.num("n") }, (_, i) => inP(`in${i + 1}`, `Entrada ${i + 1}`)), outP("out", "Saída")],
  params: [{ key: "n", label: "Número de entradas", kind: "int", default: 2, min: 2, max: 6, group: "basic", structural: true }],
  block: (p) => {
    const n = p.num("n");
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += u[i];
        y[0] = s / n;
      },
    };
  },
});

// ---------------------------------------------------------------- Expressão do usuário

type Fn = (v: Record<string, number>) => number;

const MATH_FNS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow, sen: Math.sin,
};

/** Compila uma expressão com + − * / ^, parênteses, funções e as variáveis permitidas. Sem eval. */
export function compileExpr(text: string, vars: string[]): Fn {
  const src = text.replace(/π/g, "pi");
  let pos = 0;
  const peek = () => {
    while (src[pos] === " ") pos++;
    return src[pos];
  };
  const fail = (msg: string): never => {
    throw new Error(`Expressão: ${msg}`);
  };
  const expr = (): Fn => {
    let l = term();
    for (;;) {
      const c = peek();
      if (c === "+" || c === "-") {
        pos++;
        const r = term(),
          a = l;
        l = c === "+" ? (v) => a(v) + r(v) : (v) => a(v) - r(v);
      } else return l;
    }
  };
  const term = (): Fn => {
    let l = unary();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/") {
        pos++;
        const r = unary(),
          a = l;
        l = c === "*" ? (v) => a(v) * r(v) : (v) => a(v) / r(v);
      } else return l;
    }
  };
  const unary = (): Fn => {
    const c = peek();
    if (c === "-") {
      pos++;
      const a = unary();
      return (v) => -a(v);
    }
    if (c === "+") {
      pos++;
      return unary();
    }
    return power();
  };
  const power = (): Fn => {
    const b = atom();
    if (peek() === "^") {
      pos++;
      const e = unary();
      return (v) => Math.pow(b(v), e(v));
    }
    return b;
  };
  const atom = (): Fn => {
    const c = peek();
    if (c === undefined) return fail("termina antes do esperado.");
    if (c === "(") {
      pos++;
      const e = expr();
      if (peek() !== ")") fail('falta fechar o parêntese ")".');
      pos++;
      return e;
    }
    const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(pos));
    if (m) {
      pos += m[0].length;
      const val = Number(m[0]);
      return () => val;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(pos));
    if (!id) return fail(`símbolo inesperado "${c}".`);
    pos += id[0].length;
    const name = id[0];
    if (peek() === "(") {
      pos++;
      const f = MATH_FNS[name];
      if (!f) fail(`função "${name}" desconhecida.`);
      const args: Fn[] = [expr()];
      while (peek() === ";" || peek() === ",") {
        pos++;
        args.push(expr());
      }
      if (peek() !== ")") fail('falta fechar o parêntese ")".');
      pos++;
      return (v) => f(...args.map((a) => a(v)));
    }
    if (name === "pi") return () => Math.PI;
    if (name === "e") return () => Math.E;
    if (!vars.includes(name)) fail(`"${name}" não é uma variável deste bloco (use ${vars.join(", ")}).`);
    return (v) => v[name];
  };
  const f = expr();
  if (peek() !== undefined) fail(`sobrou texto depois de "${src.slice(0, pos)}".`);
  return f;
}

reg({
  type: "math.expr",
  label: "Expressão matemática",
  category: "mathfn",
  prefix: "f(u)",
  symbol: "g:f(u)",
  description: "Calcula uma fórmula digitada, com as entradas u1, u2, u3 e o tempo t. Aceita + − * / ^, parênteses e funções como sin, cos, exp, ln, sqrt, abs, min e max.",
  model: "y = f(u1, u2, u3, t), conforme a fórmula",
  hypotheses: ["Sem dinâmica. Divisão por zero e raiz de negativo geram erro de valor inválido."],
  keywords: "formula funcao customizada matlab function fcn equacao algebrica",
  ports: (p) => [...Array.from({ length: p.num("n") }, (_, i) => inP(`in${i + 1}`, `u${i + 1}`)), outP("out", "Saída")],
  params: [
    { key: "f", label: "Fórmula", kind: "text", default: "u1 * sin(2*pi*t) + 0.5*u2", group: "basic", hint: "Variáveis: u1, u2, u3, t. Ex.: u1^2 + sqrt(abs(u2))" },
    { key: "n", label: "Número de entradas", kind: "int", default: 2, min: 1, max: 3, group: "basic", structural: true },
  ],
  block: (p) => {
    const n = p.num("n");
    const f = compileExpr(p.str("f"), ["u1", "u2", "u3", "t"]);
    const v: Record<string, number> = { u1: 0, u2: 0, u3: 0, t: 0 };
    return {
      ...noStates,
      feedthrough: n > 0,
      out: (t, _x, _o, u, y) => {
        v.u1 = u[0] ?? 0;
        v.u2 = n > 1 ? u[1] : 0;
        v.u3 = n > 2 ? u[2] : 0;
        v.t = t;
        y[0] = f(v);
      },
    };
  },
});

// ---------------------------------------------------------------- Roteamento e lógica de sinais

reg({
  type: "route.switch",
  label: "Chave seletora",
  category: "routing",
  prefix: "Chave",
  symbol: "g:chave|?",
  description: "Escolhe entre duas entradas. Se o sinal de controle (do meio) passa do limiar, sai a entrada de cima. Senão, a de baixo.",
  model: "y = u1 se u2 ≥ limiar; senão y = u3",
  hypotheses: ["A troca é instantânea. Se o controle oscilar perto do limiar, a saída salta entre as duas entradas."],
  keywords: "switch selecao condicional if multiport",
  ports: [inP("in1", "Entrada se verdadeiro"), inP("ctl", "Controle"), inP("in3", "Entrada se falso"), outP("out", "Saída")],
  params: [num("thr", "Limiar do controle", 0.5)],
  block: (p) => {
    const thr = p.num("thr");
    return { ...noStates, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = u[1] >= thr ? u[0] : u[2]) };
  },
});

reg({
  type: "route.compare",
  label: "Comparador",
  category: "routing",
  prefix: "Comparar",
  symbol: "g:a ? b",
  description: "Compara duas entradas e devolve 1 se a condição vale, ou 0 se não vale.",
  model: "y = 1 se u1 (operador) u2; senão y = 0",
  hypotheses: ["Saída discreta (0 ou 1), sem histerese. Para histerese use o relé."],
  keywords: "comparador relacional maior menor igual compare threshold limiar",
  ports: [inP("in1", "u1"), inP("in2", "u2"), outP("out", "Saída 0/1")],
  params: [{ key: "op", label: "Condição", kind: "select", default: ">", group: "basic", options: [{ value: ">", label: "u1 > u2" }, { value: ">=", label: "u1 ≥ u2" }, { value: "<", label: "u1 < u2" }, { value: "<=", label: "u1 ≤ u2" }] }],
  block: (p) => {
    const op = p.str("op");
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => void (y[0] = (op === ">" ? u[0] > u[1] : op === ">=" ? u[0] >= u[1] : op === "<" ? u[0] < u[1] : u[0] <= u[1]) ? 1 : 0),
    };
  },
});

reg({
  type: "route.logic",
  label: "Lógica de sinais",
  category: "routing",
  prefix: "Lógica",
  symbol: "g:lógica",
  description: "E, OU, OU exclusivo ou NÃO entre sinais. Um sinal maior que 0,5 vale verdadeiro.",
  model: "y = operação lógica das entradas (entrada > 0,5 conta como 1)",
  keywords: "logic and or xor not e ou nao booleano",
  ports: (p) => [...Array.from({ length: p.str("op") === "not" ? 1 : p.num("n") }, (_, i) => inP(`in${i + 1}`, `Entrada ${i + 1}`)), outP("out", "Saída 0/1")],
  params: [
    { key: "op", label: "Operação", kind: "select", default: "and", group: "basic", structural: true, options: [{ value: "and", label: "E" }, { value: "or", label: "OU" }, { value: "xor", label: "OU exclusivo" }, { value: "not", label: "NÃO" }] },
    { key: "n", label: "Número de entradas", kind: "int", default: 2, min: 2, max: 6, group: "basic", structural: true },
  ],
  block: (p) => {
    const op = p.str("op"),
      n = op === "not" ? 1 : p.num("n");
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => {
        const b: boolean[] = [];
        for (let i = 0; i < n; i++) b.push(u[i] > 0.5);
        y[0] = (op === "and" ? b.every(Boolean) : op === "or" ? b.some(Boolean) : op === "xor" ? b.filter(Boolean).length % 2 === 1 : !b[0]) ? 1 : 0;
      },
    };
  },
});

// ---------------------------------------------------------------- Controle e filtros

const rad = (Hz: number) => 2 * Math.PI * Hz;

reg({
  type: "control.pi",
  label: "Controlador PI",
  category: "control",
  prefix: "PI",
  symbol: "g:PI",
  description: "Proporcional mais integral sobre o erro de entrada. Zera o erro em regime para referência constante.",
  model: "u = Kp·e + Ki·∫e dt",
  hypotheses: ["Linear, sem limite de saída. Para limite e anti-windup use o PID."],
  keywords: "pi proporcional integral controlador",
  ports: [inP("in", "Erro"), outP("out", "Saída de controle")],
  params: [num("Kp", "Ganho proporcional Kp", 1), num("Ki", "Ganho integral Ki", 1, { unit: "1/s" }), { key: "i0", label: "Integral inicial", kind: "number", default: 0, group: "initial", initialOnly: true }],
  block: (p) => {
    const Kp = p.num("Kp"),
      Ki = p.num("Ki"),
      i0 = p.num("i0");
    return { nStates: 1, x0: () => [i0], feedthrough: Kp !== 0, out: (_t, x, o, u, y) => void (y[0] = Kp * u[0] + Ki * x[o]), der: (_t, _x, o, u, dx) => void (dx[o] = u[0]) };
  },
});

reg({
  type: "control.pd",
  label: "Controlador PD",
  category: "control",
  prefix: "PD",
  symbol: "g:PD",
  description: "Proporcional mais derivativo com filtro. A derivada antecipa a tendência do erro e amortece a resposta.",
  model: "u = Kp·e + Kd·s/(1 + s/N)·e",
  hypotheses: ["O filtro de derivada (N rad/s) evita amplificar ruído de alta frequência."],
  keywords: "pd proporcional derivativo controlador",
  ports: [inP("in", "Erro"), outP("out", "Saída de controle")],
  params: [num("Kp", "Ganho proporcional Kp", 1), num("Kd", "Ganho derivativo Kd", 0.5, { unit: "s" }), num("N", "Filtro da derivada N", 20, { unit: "rad/s", min: 0.01 })],
  block: (p) => {
    const Kp = p.num("Kp"),
      Kd = p.num("Kd"),
      N = p.num("N");
    return {
      nStates: 1,
      x0: () => [0],
      feedthrough: true,
      out: (_t, x, o, u, y) => void (y[0] = Kp * u[0] + Kd * N * (u[0] - x[o])),
      der: (_t, x, o, u, dx) => void (dx[o] = N * (u[0] - x[o])),
      minTimescale: () => 1 / (5 * N),
    };
  },
});

reg({
  type: "control.pid2",
  label: "PID com 2 graus de liberdade",
  category: "control",
  prefix: "PID2",
  symbol: "g:PID|2 GL",
  description: "PID com duas entradas (referência r e medida y), pesos de referência b e c, filtro de derivada e saída limitada com anti-windup por integração condicional.",
  model: "u = Kp(b·r − y) + Ki∫(r − y)dt + Kd·s/(1+s/N)·(c·r − y)",
  hypotheses: ["O integrador para de crescer quando a saída está saturada e o erro empurra para mais longe do limite."],
  keywords: "pid dois graus liberdade 2dof setpoint weighting ponderacao referencia antiwindup",
  ports: [inP("r", "Referência r"), inP("y", "Medida y"), outP("out", "Saída de controle")],
  params: [
    num("Kp", "Kp", 2),
    num("Ki", "Ki", 1, { unit: "1/s" }),
    num("Kd", "Kd", 0.3, { unit: "s" }),
    num("N", "Filtro da derivada N", 20, { unit: "rad/s", min: 0.01 }),
    num("b", "Peso da referência (P) b", 1, { min: 0, max: 1, group: "advanced" }),
    num("c", "Peso da referência (D) c", 0, { min: 0, max: 1, group: "advanced" }),
    num("umin", "Saída mínima", -1e6, { group: "advanced" }),
    num("umax", "Saída máxima", 1e6, { group: "advanced" }),
  ],
  block: (p) => {
    const Kp = p.num("Kp"),
      Ki = p.num("Ki"),
      Kd = p.num("Kd"),
      N = p.num("N"),
      b = p.num("b"),
      c = p.num("c"),
      lo = p.num("umin"),
      hi = p.num("umax");
    const raw = (x: Float64Array, o: number, u: number[]) => Kp * (b * u[0] - u[1]) + Ki * x[o] + Kd * N * (c * u[0] - u[1] - x[o + 1]);
    return {
      nStates: 2,
      x0: () => [0, 0],
      feedthrough: true,
      out: (_t, x, o, u, y) => void (y[0] = clamp(raw(x, o, u), lo, hi)),
      der: (_t, x, o, u, dx) => {
        const e = u[0] - u[1],
          v = raw(x, o, u);
        const pushing = (v > hi && e > 0) || (v < lo && e < 0);
        dx[o] = pushing ? 0 : e;
        dx[o + 1] = N * (c * u[0] - u[1] - x[o + 1]);
      },
      minTimescale: () => 1 / (5 * N),
    };
  },
});

reg({
  type: "control.lead",
  label: "Avanço e atraso de fase",
  category: "control",
  prefix: "Lead-lag",
  symbol: "gf:T₁s+1|T₂s+1",
  description: "Compensador (T1·s + 1)/(T2·s + 1) com ganho K. Se T1 > T2 adianta a fase (avanço). Se T1 < T2 atrasa a fase (atraso).",
  model: "G(s) = K·(T1·s + 1)/(T2·s + 1)",
  hypotheses: ["Linear e invariante no tempo."],
  keywords: "lead lag compensador avanco atraso fase margem",
  params: [num("K", "Ganho K", 1), num("T1", "T1 (zero)", 1, { unit: "s", min: 0 }), num("T2", "T2 (polo)", 0.1, { unit: "s", min: 1e-6 })],
  block: (p) => {
    const K = p.num("K"),
      T1 = p.num("T1"),
      T2 = p.num("T2");
    return tfImpl([K * T1, K], [T2, 1]);
  },
});

reg({
  type: "control.hp1",
  label: "Filtro passa-alta 1ª ordem",
  category: "filters",
  prefix: "Passa-alta",
  symbol: "gf:τs|τs+1",
  description: "Deixa passar variações rápidas e bloqueia o nível constante. É o derivador com limite de frequência.",
  model: "G(s) = τ·s/(τ·s + 1)",
  keywords: "highpass passa alta filtro hp bloqueio dc",
  params: [num("fc", "Frequência de corte", 1, { unit: "Hz", min: 1e-6 })],
  block: (p) => {
    const tau = 1 / rad(p.num("fc"));
    return tfImpl([tau, 0], [tau, 1]);
  },
});

reg({
  type: "control.lp2",
  label: "Segunda ordem (ωn, ζ)",
  category: "filters",
  prefix: "2ª ordem",
  symbol: "gf:ωn²|s²+2ζωns+ωn²",
  description: "Sistema de segunda ordem padrão. Com ζ < 1 oscila antes de acomodar. Serve de filtro passa-baixa ou de modelo de massa-mola.",
  model: "G(s) = K·ωn²/(s² + 2ζ·ωn·s + ωn²)",
  keywords: "segunda ordem second order amortecimento zeta wn frequencia natural passa baixa lowpass",
  params: [num("K", "Ganho estático K", 1), num("wn", "Frequência natural ωn", 10, { unit: "rad/s", min: 1e-6 }), num("zeta", "Amortecimento ζ", 0.7, { min: 0 })],
  block: (p) => {
    const K = p.num("K"),
      w = p.num("wn"),
      z = p.num("zeta");
    return tfImpl([K * w * w], [1, 2 * z * w, w * w]);
  },
});

reg({
  type: "control.bp2",
  label: "Filtro passa-faixa",
  category: "filters",
  prefix: "Passa-faixa",
  symbol: "gf:ω₀s/Q|s²+ω₀s/Q+ω₀²",
  description: "Deixa passar uma faixa de frequências em torno de f0. Q maior dá faixa mais estreita.",
  model: "G(s) = (ω0/Q)·s/(s² + (ω0/Q)·s + ω0²)",
  hypotheses: ["Ganho unitário em f0."],
  keywords: "bandpass passa faixa banda filtro q fator de qualidade",
  params: [num("f0", "Frequência central f0", 1, { unit: "Hz", min: 1e-6 }), num("Q", "Fator de qualidade Q", 2, { min: 0.05 })],
  block: (p) => {
    const w = rad(p.num("f0")),
      Q = p.num("Q");
    return tfImpl([w / Q, 0], [1, w / Q, w * w]);
  },
});

reg({
  type: "control.notch",
  label: "Filtro notch (rejeita-faixa)",
  category: "filters",
  prefix: "Notch",
  symbol: "g:notch",
  description: "Elimina uma frequência específica, como o zumbido de 60 Hz ou uma ressonância mecânica, sem mexer no resto do espectro.",
  model: "G(s) = (s² + 2ζz·ω0·s + ω0²)/(s² + 2ζp·ω0·s + ω0²)",
  hypotheses: ["Quanto menor ζz em relação a ζp, mais profundo o corte."],
  keywords: "notch rejeita faixa band stop bandstop 60hz ressonancia",
  params: [num("f0", "Frequência rejeitada", 60, { unit: "Hz", min: 1e-6 }), num("zz", "Profundidade ζz", 0.02, { min: 0 }), num("zp", "Largura ζp", 0.5, { min: 1e-3 })],
  block: (p) => {
    const w = rad(p.num("f0"));
    return tfImpl([1, 2 * p.num("zz") * w, w * w], [1, 2 * p.num("zp") * w, w * w]);
  },
});

reg({
  type: "control.butter",
  label: "Filtro Butterworth passa-baixa",
  category: "filters",
  prefix: "Butterworth",
  symbol: "g:Butter|n",
  description: "Passa-baixa com resposta plana na faixa de passagem. Quanto maior a ordem, mais abrupto o corte.",
  model: "|G(jω)|² = 1/(1 + (ω/ωc)^(2n))",
  hypotheses: ["Ordem de 1 a 6, com ganho unitário em baixa frequência."],
  keywords: "butterworth lowpass passa baixa filtro analogico ordem",
  params: [num("fc", "Frequência de corte (−3 dB)", 1, { unit: "Hz", min: 1e-6 }), { key: "n", label: "Ordem", kind: "int", default: 2, min: 1, max: 6, group: "basic", structural: true }],
  block: (p) => {
    const w = rad(p.num("fc")),
      n = p.num("n");
    // Polinômio de Butterworth normalizado: produto dos fatores (s² + 2·cos(θk)·s + 1) e, se ímpar, (s + 1).
    let den = [1];
    const mul = (a: number[], b: number[]) => {
      const r = new Array<number>(a.length + b.length - 1).fill(0);
      a.forEach((x, i) => b.forEach((y, j) => (r[i + j] += x * y)));
      return r;
    };
    for (let k = 1; k <= Math.floor(n / 2); k++) den = mul(den, [1, 2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * n)), 1]);
    if (n % 2 === 1) den = mul(den, [1, 1]);
    // Troca s por s/ωc: o coeficiente de s^(n−i) ganha ωc^i.
    const scaled = den.map((c, i) => c * Math.pow(w, i));
    return tfImpl([scaled[n]], scaled);
  },
});

// ---------------------------------------------------------------- Controle digital

const TS = (def = 0.1): ParamDef => num("Ts", "Período de amostragem Ts", def, { unit: "s", min: 1e-6 });

/**
 * Bloco amostrado: o estado muda só nos instantes k·Ts. A guarda sen(π·t/Ts) troca de sinal em cada k·Ts.
 * update(x, o, u) altera os estados e escreve a saída em x[o] (o primeiro estado é a saída mantida).
 */
function sampled(nStates: number, Ts: number, x0: () => number[], update: (x: Float64Array, o: number, u: number[]) => void): BlockImpl {
  return {
    nStates,
    x0,
    der: () => {},
    feedthrough: false,
    out: (_t, x, o, _u, y) => void (y[0] = x[o]),
    minTimescale: () => Ts / 4,
    discrete: {
      nGuards: 1,
      guards: (t, _x, _o, _u, g) => void (g[0] = Math.sin((Math.PI * t) / Ts)),
      fire: (_t, x, o, u, prev, next, init) => {
        if (init || prev[0] !== next[0]) update(x, o, u);
      },
    },
  };
}

const D_HYP = ["A amostra é tomada em t = 0, Ts, 2Ts, … e mantida até a próxima. Sem jitter nem atraso de conversão."];

reg({
  type: "disc.zoh",
  label: "Amostrador com retenção (ZOH)",
  category: "discrete",
  prefix: "ZOH",
  symbol: "g:ZOH|Ts",
  description: "Amostra o sinal a cada Ts e mantém o valor até a próxima amostra. É o conversor D/A ideal que liga o controlador digital à planta.",
  model: "y(t) = u(k·Ts) para k·Ts ≤ t < (k+1)·Ts",
  hypotheses: D_HYP,
  keywords: "zoh zero order hold amostrador sample hold retentor discretizacao conversor",
  params: [TS()],
  block: (p) => sampled(1, p.num("Ts"), () => [0], (x, o, u) => void (x[o] = u[0])),
});

reg({
  type: "disc.delay",
  label: "Atraso de uma amostra (z⁻¹)",
  category: "discrete",
  prefix: "z⁻¹",
  symbol: "g:z⁻¹",
  description: "A saída é a entrada da amostra anterior. É o bloco básico para montar filtros e controladores digitais.",
  model: "y[k] = u[k − 1]",
  hypotheses: D_HYP,
  keywords: "unit delay atraso unitario z-1 amostra memoria registrador",
  params: [TS(), num("y0", "Valor inicial", 0, { group: "initial", initialOnly: true })],
  block: (p) => {
    const y0 = p.num("y0");
    return sampled(2, p.num("Ts"), () => [y0, y0], (x, o, u) => {
      x[o] = x[o + 1];
      x[o + 1] = u[0];
    });
  },
});

reg({
  type: "disc.tf",
  label: "Função de transferência em z",
  category: "discrete",
  prefix: "G(z)",
  symbol: "gf:N(z)|D(z)",
  description: "Filtro ou controlador digital G(z) = N(z)/D(z), com coeficientes da maior potência de z para a menor. Calculado por equação de diferenças.",
  model: "y[k] = (b0·u[k] + … + bn·u[k−n] − a1·y[k−1] − … − an·y[k−n]) / a0",
  hypotheses: [...D_HYP, "G(z) própria: grau do numerador menor ou igual ao do denominador. Se tiver termo direto (b0 ≠ 0), a saída depende da amostra atual."],
  keywords: "discrete transfer function funcao de transferencia discreta z transform filtro fir iir equacao de diferencas",
  params: [
    { key: "num", label: "Numerador N(z)", kind: "text", default: "0.1", group: "basic", hint: "Ex.: 0.1 0 para 0,1·z" },
    { key: "den", label: "Denominador D(z)", kind: "text", default: "1 -0.9", group: "basic", hint: "Ex.: 1 -0.9 para z − 0,9" },
    TS(),
  ],
  block: (p) => {
    const num = parseNumberList(p.str("num"), "Numerador");
    const den = parseNumberList(p.str("den"), "Denominador");
    if (den[0] === 0) throw new Error("O primeiro coeficiente do denominador não pode ser zero.");
    const n = Math.max(den.length, num.length) - 1;
    if (num.length > den.length) throw new Error("G(z) não é própria (grau do numerador maior que o do denominador).");
    const b = new Array<number>(n + 1).fill(0),
      a = new Array<number>(n + 1).fill(0);
    num.forEach((v, i) => (b[n - (num.length - 1) + i] = v / den[0]));
    den.forEach((v, i) => (a[n - (den.length - 1) + i] = v / den[0]));
    // b[i] multiplica u[k − i]. Convertemos de "maior potência primeiro" para atraso crescente.
    const bk = b.map((_, i) => b[i]);
    const ak = a.map((_, i) => a[i]);
    // Layout dos estados: [y atual, u[k-1..k-n], y[k-1..k-n]].
    const Ts = p.num("Ts");
    return sampled(1 + 2 * n, Ts, () => new Array<number>(1 + 2 * n).fill(0), (x, o, u) => {
      let s = bk[0] * u[0];
      for (let i = 1; i <= n; i++) s += bk[i] * x[o + i] - ak[i] * x[o + n + i];
      for (let i = n; i > 1; i--) {
        x[o + i] = x[o + i - 1];
        x[o + n + i] = x[o + n + i - 1];
      }
      if (n >= 1) {
        x[o + 1] = u[0];
        x[o + n + 1] = s;
      }
      x[o] = s;
    });
  },
});

reg({
  type: "disc.integrator",
  label: "Integrador discreto",
  category: "discrete",
  prefix: "Σ",
  symbol: "g:Σ|Ts/(z−1)",
  description: "Acumula a entrada a cada amostra. Pode usar o método de Euler para frente, para trás ou trapezoidal.",
  model: "frente: y[k] = y[k−1] + K·Ts·u[k−1];  trás: y[k] = y[k−1] + K·Ts·u[k];  trapézio: média das duas",
  hypotheses: D_HYP,
  keywords: "integrador discreto acumulador soma euler tustin trapezoidal digital",
  params: [num("K", "Ganho K", 1), TS(), { key: "method", label: "Método", kind: "select", default: "forward", group: "basic", options: [{ value: "forward", label: "Euler para frente" }, { value: "backward", label: "Euler para trás" }, { value: "trap", label: "Trapezoidal" }] }, num("y0", "Valor inicial", 0, { group: "initial", initialOnly: true })],
  block: (p) => {
    const K = p.num("K"),
      Ts = p.num("Ts"),
      m = p.str("method"),
      y0 = p.num("y0");
    // estados: [y, u anterior]
    return sampled(2, Ts, () => [y0, 0], (x, o, u) => {
      const prevU = x[o + 1];
      x[o] += K * Ts * (m === "forward" ? prevU : m === "backward" ? u[0] : (prevU + u[0]) / 2);
      x[o + 1] = u[0];
    });
  },
});

reg({
  type: "disc.pid",
  label: "PID discreto",
  category: "discrete",
  prefix: "PID[z]",
  symbol: "g:PID|[z]",
  description: "Controlador PID digital sobre o erro, com integral por soma, derivada por diferença e saída limitada com anti-windup. Atualiza a cada Ts.",
  model: "u[k] = Kp·e[k] + Ki·Ts·Σe + Kd·(e[k] − e[k−1])/Ts",
  hypotheses: [...D_HYP, "Sem filtro de derivada: ruído na medida é amplificado pela diferença."],
  keywords: "pid digital discreto controlador amostrado microcontrolador arduino",
  ports: [inP("in", "Erro"), outP("out", "Saída de controle")],
  params: [num("Kp", "Kp", 2), num("Ki", "Ki", 1, { unit: "1/s" }), num("Kd", "Kd", 0.1, { unit: "s" }), TS(0.05), num("umin", "Saída mínima", -1e6, { group: "advanced" }), num("umax", "Saída máxima", 1e6, { group: "advanced" })],
  block: (p) => {
    const Kp = p.num("Kp"),
      Ki = p.num("Ki"),
      Kd = p.num("Kd"),
      Ts = p.num("Ts"),
      lo = p.num("umin"),
      hi = p.num("umax");
    // estados: [u, integral, e anterior]
    return sampled(3, Ts, () => [0, 0, 0], (x, o, u) => {
      const e = u[0];
      const integ = x[o + 1] + Ki * Ts * e;
      const raw = Kp * e + integ + (Kd * (e - x[o + 2])) / Ts;
      const out = clamp(raw, lo, hi);
      // Anti-windup: só acumula quando não está saturado ou quando o erro alivia a saturação.
      x[o + 1] = raw === out || (raw > hi && e < 0) || (raw < lo && e > 0) ? integ : x[o + 1];
      x[o + 2] = e;
      x[o] = out;
    });
  },
});

reg({
  type: "disc.mavg",
  label: "Média móvel",
  category: "discrete",
  prefix: "Média móvel",
  symbol: "g:média|móvel",
  description: "Média das últimas N amostras. Filtra ruído ao custo de um pequeno atraso.",
  model: "y[k] = (u[k] + u[k−1] + … + u[k−N+1]) / N",
  hypotheses: [...D_HYP, "Janela de 2 a 32 amostras."],
  keywords: "media movel moving average filtro fir suavizar ruido",
  params: [{ key: "N", label: "Janela N", kind: "int", default: 5, min: 2, max: 32, group: "basic", structural: true }, TS()],
  block: (p) => {
    const N = p.num("N"),
      Ts = p.num("Ts");
    return sampled(1 + N, Ts, () => new Array<number>(1 + N).fill(0), (x, o, u) => {
      for (let i = N; i > 1; i--) x[o + i] = x[o + i - 1];
      x[o + 1] = u[0];
      let s = 0;
      for (let i = 1; i <= N; i++) s += x[o + i];
      x[o] = s / N;
    });
  },
});

reg({
  type: "disc.quantizer",
  label: "Quantizador (conversor A/D)",
  category: "discrete",
  prefix: "Quantizador",
  symbol: "g:quant|escada",
  description: "Arredonda o sinal para múltiplos de um passo. Representa a resolução finita de um conversor A/D de N bits.",
  model: "y = q·arredonda(u/q), com q = faixa/2^bits",
  hypotheses: ["Sem retenção: a saída acompanha a entrada de forma contínua. Combine com o ZOH para um conversor completo."],
  keywords: "quantizador quantizer adc ad conversor analogico digital bits resolucao degrau",
  params: [num("q", "Passo de quantização q", 0.1, { min: 1e-9 })],
  block: (p) => {
    const q = p.num("q");
    return pure((u) => q * Math.round(u / q));
  },
});

// ---------------------------------------------------------------- Não linearidades extras

reg({
  type: "nonlinear.relay",
  label: "Relé com histerese",
  category: "nonlinear",
  prefix: "Relé",
  symbol: "g:relé|histerese",
  description: "Liga quando o sinal sobe acima do limiar de ligar e desliga quando cai abaixo do limiar de desligar. Entre os dois, mantém o estado. É o termostato liga-desliga.",
  model: "y → alto se u ≥ ligar;  y → baixo se u ≤ desligar;  senão mantém",
  hypotheses: ["Precisa de ligar > desligar. A troca é instantânea no cruzamento."],
  keywords: "relay histerese hysteresis liga desliga on off termostato schmitt trigger bang bang",
  params: [num("on", "Limiar de ligar", 0.5), num("off", "Limiar de desligar", -0.5), num("hi", "Saída ligada", 1), num("lo", "Saída desligada", 0)],
  block: (p) => {
    const on = p.num("on"),
      off = p.num("off"),
      hi = p.num("hi"),
      lo = p.num("lo");
    if (!(on > off)) throw new Error("No relé, o limiar de ligar deve ser maior que o de desligar.");
    return {
      nStates: 1,
      x0: () => [lo],
      der: () => {},
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      discrete: {
        nGuards: 2,
        guards: (_t, _x, _o, u, g) => {
          g[0] = u[0] - on;
          g[1] = u[0] - off;
        },
        fire: (_t, x, o, _u, prev, next, init) => {
          if (init) {
            x[o] = next[0] === 1 ? hi : lo;
            return;
          }
          if (prev[0] === 0 && next[0] === 1) x[o] = hi;
          else if (prev[1] === 1 && next[1] === 0) x[o] = lo;
        },
      },
    };
  },
});

reg({
  type: "nonlinear.lookup",
  label: "Tabela de consulta (curva)",
  category: "nonlinear",
  prefix: "Curva",
  symbol: "g:tabela|u → y",
  description: "Aplica ao sinal uma curva definida por pontos x:y, com interpolação linear. Representa curvas medidas, como a característica de uma válvula ou de um sensor.",
  model: "y = f(u), interpolada entre os pontos x:y",
  hypotheses: ["Fora do intervalo, mantém o valor da ponta."],
  keywords: "lookup table curva caracteristica interpolacao 1d valvula sensor calibracao",
  params: [{ key: "pts", label: "Pontos (x:y)", kind: "text", default: "0:0; 1:0.4; 2:0.8; 3:1", group: "basic", hint: "Ex.: 0:0; 1:0.4; 2:0.8; 3:1" }],
  block: (p) => {
    const pts = parsePairs(p.str("pts"), "Curva");
    return pure((u) => interp(pts, u, false));
  },
});

reg({
  type: "nonlinear.ratelimit",
  label: "Limitador de taxa (slew rate)",
  category: "nonlinear",
  prefix: "Limite de taxa",
  symbol: "g:dy/dt|≤ R",
  description: "A saída segue a entrada, mas a velocidade de variação fica limitada a R. Representa o limite de velocidade de um atuador ou o slew rate de um amplificador.",
  model: "dy/dt = clamp((u − y)/τ, −R, +R)",
  hypotheses: ["τ pequeno (rastreio quase imediato dentro do limite). A saída parte do valor inicial informado."],
  keywords: "rate limiter slew rate taxa de variacao velocidade atuador rampa",
  params: [num("R", "Taxa máxima R", 1, { unit: "1/s", min: 1e-9 }), num("tau", "Constante de rastreio τ", 0.02, { unit: "s", min: 1e-6, group: "advanced" }), num("y0", "Saída inicial", 0, { group: "initial", initialOnly: true })],
  block: (p) => {
    const R = p.num("R"),
      tau = p.num("tau"),
      y0 = p.num("y0");
    return {
      nStates: 1,
      x0: () => [y0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      der: (_t, x, o, u, dx) => void (dx[o] = clamp((u[0] - x[o]) / tau, -R, R)),
      minTimescale: () => tau / 2,
    };
  },
});
