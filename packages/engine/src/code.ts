// Leitura de código para a página Matemática: detecta a linguagem, avisa se não bate com a escolhida
// e reconhece situações possíveis (função de transferência, espaço de estados, PID, lógica, ladder,
// sketch de Arduino, liga-desliga). O programa não executa o código: ele lê padrões conhecidos.

import { build } from "./examples";
import type { ProjectIR } from "./types";

export type Lang = "python" | "matlab" | "c" | "cpp" | "arduino" | "javascript" | "julia" | "r" | "ladder" | "texto";

export const LANGS: { id: Lang; label: string; ext: string; example: string }[] = [
  { id: "python", label: "Python", ext: ".py", example: "import control\nG = control.tf([10], [1, 3, 2])\nKp = 2\nKi = 1\n" },
  { id: "matlab", label: "MATLAB / Octave", ext: ".m", example: "G = tf([10], [1 3 2]);\nKp = 2; Ki = 1;\n" },
  { id: "arduino", label: "Arduino (C++)", ext: ".ino", example: "void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n" },
  { id: "c", label: "C", ext: ".c", example: "#include <stdio.h>\nint main() {\n  int a = 1, b = 0;\n  int y = (a && !b) || b;\n  return y;\n}\n" },
  { id: "cpp", label: "C++", ext: ".cpp", example: "#include <iostream>\nint main() {\n  bool a = true, b = false;\n  bool y = (a && !b) || b;\n  std::cout << y;\n}\n" },
  { id: "ladder", label: "Ladder (lista de instruções)", ext: ".il", example: "LD  A\nAND B\nOR  C\nST  Y\n" },
  { id: "julia", label: "Julia", ext: ".jl", example: "using ControlSystems\nG = tf([10], [1, 3, 2])\n" },
  { id: "r", label: "R", ext: ".R", example: "library(control)\nKp <- 2\n" },
  { id: "javascript", label: "JavaScript", ext: ".js", example: "const Kp = 2;\nconst Ki = 1;\n" },
  { id: "texto", label: "Equações em texto", ext: ".txt", example: "Y = A*B + !C\n" },
];
export const langLabel = (l: Lang) => LANGS.find((x) => x.id === l)?.label ?? l;

// --------------------------------------------------------------------------- detecção da linguagem

const SIGN: Record<Exclude<Lang, "texto">, [RegExp, number][]> = {
  python: [[/^\s*def\s+\w+\s*\(.*\)\s*:/m, 3], [/^\s*(import\s+\w+|from\s+\w+\s+import)/m, 3], [/\bprint\s*\(/, 1], [/\bnp\./, 2], [/^\s*(elif|else)\s*.*:\s*$/m, 2], [/\b(True|False|None)\b/, 1], [/^\s*(if|for|while)\b.*:\s*$/m, 2], [/\band\b|\bor\b|\bnot\b/, 1], [/#\s/, 0.5]],
  matlab: [[/^\s*function\b.*=?.*\(?/m, 0.5], [/^\s*%/m, 2], [/\bend\s*;?\s*$/m, 1.5], [/\b(disp|zeros|ones|fprintf|linspace|plot|step|bode|ss)\s*\(/, 1.5], [/~=/, 2], [/\[[^\]\n]*\s[^\]\n]*;[^\]\n]*\]/, 2], [/\w+\s*=\s*[^;\n]+;\s*(%|$)/m, 1], [/\btf\s*\(\s*\[[^\],]*\s[^\],]*\]/, 2], [/\.\*|\.\^/, 1.5]],
  c: [[/#include\s*<(stdio|stdlib|string|math)\.h>/, 4], [/\bint\s+main\s*\(/, 3], [/\bprintf\s*\(/, 2], [/\b(int|float|double|char|unsigned)\s+\w+\s*(=|;|\[)/, 1.5], [/;\s*$/m, 0.5]],
  cpp: [[/#include\s*<(iostream|vector|string|cmath)>/, 4], [/\bstd::/, 3], [/\b(cout|cin)\b/, 3], [/\bclass\s+\w+/, 2], [/\bbool\b/, 1], [/\bint\s+main\s*\(/, 1]],
  arduino: [[/\bvoid\s+setup\s*\(\s*\)/, 5], [/\bvoid\s+loop\s*\(\s*\)/, 5], [/\b(pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|Serial\.)/, 3], [/\b(HIGH|LOW|OUTPUT|INPUT_PULLUP|INPUT)\b/, 1.5]],
  javascript: [[/\b(const|let|var)\s+\w+\s*=/, 2], [/=>/, 2], [/\bconsole\.log\s*\(/, 3], [/\bfunction\s+\w*\s*\(/, 1.5], [/===|!==/, 2]],
  julia: [[/^\s*using\s+\w+/m, 3], [/\bprintln\s*\(/, 2], [/^\s*function\s+\w+.*$[\s\S]*^\s*end\b/m, 1.5], [/\.\*|\.\+|\.\^/, 0.5], [/::\s*(Int|Float64)/, 2], [/\bend\b/, 0.5]],
  r: [[/<-/, 3], [/\blibrary\s*\(/, 3], [/\bc\s*\(\s*[\d.]/, 1.5], [/\bfunction\s*\(.*\)\s*\{/, 1], [/\bprint\s*\(|\bcat\s*\(/, 0.5]],
  ladder: [[/^\s*(LD|LDN|AND|ANDN|OR|ORN|XOR|ST|STN|S|R|OUT)\s+[A-Za-z_%]\w*/im, 3], [/^\s*(LD|LDN)\s+\S+\s*$/im, 2], [/^\s*ST\s+\S+/im, 2], [/^\s*\|?\s*[-─]+\s*\[/m, 3]],
};

export interface Detection {
  lang: Lang | null;
  scores: Record<string, number>;
}

export function detectLanguage(code: string): Detection {
  const scores: Record<string, number> = {};
  for (const [lang, sigs] of Object.entries(SIGN)) scores[lang] = sigs.reduce((s, [re, w]) => s + (re.test(code) ? w : 0), 0);
  // O ladder só vale se a maioria das linhas não vazias é instrução.
  const lines = code.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("(*"));
  const il = lines.filter((l) => /^(LDN?|ANDN?|ORN?|XOR|STN?|S|R|OUT|AND\(|OR\(|\))\b/i.test(l) && !/[=;{}]/.test(l)).length;
  if (lines.length === 0 || il / lines.length < 0.6) scores.ladder = 0;
  const arr = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = [arr[0], arr[1]];
  if (!best || best[1] < 2.5 || best[1] - (second?.[1] ?? 0) < 1) return { lang: null, scores };
  return { lang: best[0] as Lang, scores };
}

const FAMILIES: Lang[][] = [["c", "cpp", "arduino"], ["matlab", "julia"]];
const compatible = (selected: Lang, detected: Lang) => selected === detected || FAMILIES.some((f) => f.includes(selected) && f.includes(detected));

export interface LangWarning {
  message: string;
  suggest: Lang;
}
/** Avisa na hora quando o texto parece estar em outra linguagem. */
export function languageWarning(selected: Lang, code: string): LangWarning | null {
  if (!code.trim() || selected === "texto") return null;
  const d = detectLanguage(code);
  if (!d.lang || compatible(selected, d.lang)) return null;
  return { message: `O código parece estar em ${langLabel(d.lang)}, mas a linguagem escolhida é ${langLabel(selected)}.`, suggest: d.lang };
}

// --------------------------------------------------------------------------- ladder (lista de instruções)

export type Rung = { t: "c"; name: string; neg: boolean } | { t: "and"; items: Rung[] } | { t: "or"; items: Rung[] };
export interface LadderLine {
  out: string;
  neg: boolean;
  tree: Rung;
}
export interface LadderResult {
  ok: boolean;
  error?: string;
  lines: LadderLine[];
  /** Instruções com memória ou tempo (S, R, TON, CTU...) que a leitura não trata. */
  unsupported: string[];
}

const simplify = (a: Rung, kind: "and" | "or", b: Rung): Rung => ({ t: kind, items: [...(a.t === kind ? a.items : [a]), ...(b.t === kind ? b.items : [b])] });
const negate = (r: Rung): Rung => (r.t === "c" ? { ...r, neg: !r.neg } : r);

export function parseLadder(code: string): LadderResult {
  const lines: LadderLine[] = [];
  const unsupported: string[] = [];
  let acc: Rung | null = null;
  const stack: { acc: Rung | null; op: string }[] = [];
  const txt = code.replace(/\(\*[\s\S]*?\*\)/g, "").split("\n");
  for (const raw of txt) {
    const l = raw.replace(/\/\/.*$/, "").trim();
    if (!l) continue;
    const m = /^(LDN|LD|ANDN|AND|ORN|OR|XOR|STN|ST|OUT|S|R|TON|TOF|CTU|CTD|CAL)\s*(\(?)\s*([A-Za-z_%][\w.%]*)?\s*$/i.exec(l) ?? (l === ")" ? (Object.assign([l, ")", "", ""], { index: 0, input: l }) as RegExpExecArray) : null);
    if (!m) return { ok: false, error: `Instrução não reconhecida: “${l}”.`, lines, unsupported };
    const op = m[1].toUpperCase();
    const open = m[2] === "(";
    const name = m[3];
    const lit = (neg: boolean): Rung | null => (name ? { t: "c", name: name.toUpperCase(), neg } : null);
    const need = () => {
      if (!acc) throw new Error(`“${l}” precisa de um LD antes.`);
      return acc;
    };
    try {
      if (op === ")") {
        const top = stack.pop();
        if (!top) throw new Error("Parêntese fechado sem abrir.");
        const inner = need();
        const outer = top.acc as Rung;
        const kind = top.op.startsWith("AND") ? "and" : "or";
        acc = simplify(outer, kind, top.op.endsWith("N") ? negate(inner) : inner);
      } else if (open) {
        stack.push({ acc: need(), op });
        acc = name ? lit(false) : null;
      } else if (op === "LD") acc = lit(false);
      else if (op === "LDN") acc = lit(true);
      else if (op === "AND") acc = simplify(need(), "and", lit(false) as Rung);
      else if (op === "ANDN") acc = simplify(need(), "and", lit(true) as Rung);
      else if (op === "OR") acc = simplify(need(), "or", lit(false) as Rung);
      else if (op === "ORN") acc = simplify(need(), "or", lit(true) as Rung);
      else if (op === "XOR") {
        const a = need();
        const b = lit(false) as Rung;
        unsupported.push("XOR: use a equação lógica no lugar");
        acc = simplify(simplify(a, "and", negate(b)), "or", simplify(negate(a), "and", b));
      } else if (op === "ST" || op === "OUT" || op === "STN") {
        lines.push({ out: (name ?? "Y").toUpperCase(), neg: op === "STN", tree: need() });
      } else unsupported.push(`${op} ${name ?? ""}`.trim());
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), lines, unsupported };
    }
  }
  if (stack.length) return { ok: false, error: "Falta fechar um parêntese.", lines, unsupported };
  if (!lines.length && !unsupported.length) return { ok: false, error: "Nenhuma saída (ST ou OUT) encontrada.", lines, unsupported };
  return { ok: true, lines, unsupported };
}

const treeEq = (r: Rung, parent: "and" | "or" | "top"): string => {
  if (r.t === "c") return (r.neg ? "!" : "") + r.name;
  const s = r.items.map((x) => treeEq(x, r.t)).join(r.t === "and" ? " * " : " + ");
  return r.t === "or" && parent === "and" ? `(${s})` : s;
};
/** Equação booleana de cada saída: "Y = (A * B) + C". */
export const ladderEquations = (lines: LadderLine[]) => lines.map((l) => (l.neg ? `${l.out} = !(${treeEq(l.tree, "top")})` : `${l.out} = ${treeEq(l.tree, "top")}`));

/** Desenho do degrau em texto: contatos em série (E) e em paralelo (OU). */
function draw(r: Rung): string[] {
  if (r.t === "c") return [r.neg ? `[/${r.name}]` : `[ ${r.name} ]`];
  if (r.t === "and") {
    const parts = r.items.map(draw);
    const h = Math.max(...parts.map((p) => p.length));
    const out: string[] = Array.from({ length: h }, () => "");
    parts.forEach((p, k) => {
      const w = Math.max(...p.map((x) => x.length));
      for (let i = 0; i < h; i++) {
        const cell = (p[i] ?? "").padEnd(w, i === 0 ? "─" : " ");
        out[i] += (k > 0 ? (i === 0 ? "─" : " ") : "") + cell;
      }
    });
    return out;
  }
  const branches = r.items.map(draw);
  const w = Math.max(...branches.flatMap((b) => b.map((x) => x.length)));
  const out: string[] = [];
  branches.forEach((b, bi) => {
    const first = bi === 0,
      last = bi === branches.length - 1;
    b.forEach((ln, i) => {
      const body = ln.padEnd(w, i === 0 ? "─" : " ");
      const left = i === 0 ? (first ? "┬─" : last ? "└─" : "├─") : last ? "  " : "│ ";
      const right = i === 0 ? (first ? "─┬" : last ? "─┘" : "─┤") : last ? "  " : " │";
      out.push(left + body + right);
    });
  });
  return out;
}
export function ladderDiagram(lines: LadderLine[]): string {
  return lines
    .map((l, i) => {
      const body = draw(l.tree);
      const coil = l.neg ? `(/${l.out})` : `( ${l.out} )`;
      return body.map((ln, k) => (k === 0 ? `${String(i + 1).padStart(2)} ├─${ln}─${coil}─┤` : `   │ ${ln}`)).join("\n");
    })
    .join("\n\n");
}

// --------------------------------------------------------------------------- leitura de padrões

export type CodeAction =
  | { kind: "tf"; text: string; tfNum?: number[]; tfDen?: number[] }
  | { kind: "ss"; A: string; B: string; C: string; D: string }
  | { kind: "loop"; num: number[]; den: number[]; Kp: number; Ki: number; Kd: number }
  | { kind: "step"; num: number[]; den: number[] }
  | { kind: "logic"; eq: string; mapping?: string }
  | { kind: "arduino"; sketch: string; params: Record<string, number | string> }
  | { kind: "onoff"; th: number; hyst: number; invert: boolean };

export interface Candidate {
  id: string;
  title: string;
  why: string;
  action: CodeAction;
}

const numList = (s: string): number[] => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map(Number);
const fnum = (v: number) => String(+v.toPrecision(6));

function balanced(src: string, start: number): string | null {
  const open = src[start];
  const close = open === "[" ? "]" : open === "(" ? ")" : "";
  if (!close) return null;
  let d = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) d++;
    else if (src[i] === close && --d === 0) return src.slice(start, i + 1);
  }
  return null;
}

/** Matriz escrita como [[0,1],[-2,-3]] (Python, Julia, R) ou [0 1; -2 -3] (MATLAB). Devolve "0 1; -2 -3". */
function matrixOf(code: string, name: string): string | null {
  const m = new RegExp(`(^|[^\\w.])${name}\\s*(=|<-)\\s*(?:np\\.|numpy\\.)?(?:array|matrix|asarray)?\\s*\\(?\\s*(\\[)`, "m").exec(code);
  if (!m) return null;
  const at = m.index + m[0].length - 1;
  const lit = balanced(code, at);
  if (!lit) return null;
  const inner = lit.slice(1, -1);
  const rows = inner.includes("[") ? [...inner.matchAll(/\[([^[\]]*)\]/g)].map((x) => x[1]) : inner.split(/;|\n/);
  const out = rows.map((r) => numList(r)).filter((r) => r.length && r.every(Number.isFinite));
  if (!out.length) return null;
  return out.map((r) => r.map(fnum).join(" ")).join("; ");
}

const polyText = (c: number[], v = "s") => {
  const n = c.length - 1;
  const t = c
    .map((k, i) => ({ k, p: n - i }))
    .filter((x) => x.k !== 0)
    .map(({ k, p }, idx) => {
      const sign = k < 0 ? "-" : idx === 0 ? "" : "+";
      const a = Math.abs(k);
      const body = p === 0 ? fnum(a) : `${a === 1 ? "" : fnum(a) + "*"}${v}${p > 1 ? "^" + p : ""}`;
      return `${sign}${idx === 0 || sign === "" ? "" : " "}${body}`;
    });
  return t.length ? t.join(" ").replace(/\s+/g, " ").replace(/^\+\s*/, "") : "0";
};
export const tfText = (num: number[], den: number[]) => `H(s) = (${polyText(num)}) / (${polyText(den)})`;

/** Converte um operador de linguagem em uma equação lógica com letras. */
function normLogic(expr: string): { eq: string; mapping: string } | null {
  let s = expr.replace(/;/g, "").replace(/\bnot\b|!(?!=)|~/g, " ! ").replace(/\band\b|&&|&/g, " * ").replace(/\bor\b|\|\||\|/g, " + ").replace(/\bxor\b|\^/g, " ^ ").replace(/\bTrue\b|\btrue\b|\bTRUE\b/g, "1").replace(/\bFalse\b|\bfalse\b|\bFALSE\b/g, "0");
  const ids = [...new Set(s.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? [])];
  if (!ids.length || ids.length > 6) return null;
  const letters = "ABCDEF";
  const map = new Map<string, string>();
  const single = ids.every((i) => i.length === 1);
  ids.forEach((id, i) => map.set(id, single ? id.toUpperCase() : letters[i]));
  s = s.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (id) => map.get(id) ?? id);
  s = s.replace(/\s+/g, " ").trim();
  if (!/^[A-F01!*+^()' ]+$/.test(s)) return null;
  return { eq: s, mapping: single ? "" : ids.map((i) => `${i} = ${map.get(i)}`).join(", ") };
}

function recognizeArduino(code: string, out: Candidate[]) {
  const hasLoop = /void\s+loop\s*\(/.test(code);
  if (!hasLoop && !/pinMode|digitalWrite|analogRead/.test(code)) return;
  const delays = [...code.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const writes = [...code.matchAll(/digitalWrite\s*\(\s*(\w+)\s*,\s*(HIGH|LOW|1|0)\s*\)\s*;\s*(?:delay\s*\(\s*(\d+)\s*\)\s*;)?/g)];
  const highPins = [...new Set(writes.filter((w) => /HIGH|1/.test(w[2])).map((w) => w[1]))];
  const hasAnalogRead = /analogRead\s*\(/.test(code),
    hasAnalogWrite = /analogWrite\s*\(/.test(code),
    hasDigRead = /digitalRead\s*\(/.test(code);
  if (highPins.length >= 3 && delays.length >= 3) {
    const dur = highPins.slice(0, 3).map((p) => {
      const w = writes.find((x) => x[1] === p && /HIGH|1/.test(x[2]) && x[3]);
      return w ? Number(w[3]) / 1000 : 2;
    });
    out.push({ id: "ard-traffic", title: "Semáforo com Arduino", why: `Três saídas (${highPins.slice(0, 3).join(", ")}) ligadas uma de cada vez, com esperas. Assumi a ordem verde, amarelo, vermelho.`, action: { kind: "arduino", sketch: "traffic", params: { tg: dur[0], ty: dur[1], tr: dur[2] } } });
  } else if (hasAnalogRead && /analogRead[\s\S]*?(>|<|>=|<=)\s*(\d+)/.test(code) && !hasAnalogWrite) {
    const m = /analogRead[\s\S]*?(?:>=|<=|>|<)\s*(\d+)/.exec(code);
    const sp = m ? (Number(m[1]) / 1023) * 5 : 2.5;
    out.push({ id: "ard-thermo", title: "Liga-desliga por leitura analógica (termostato)", why: `analogRead comparado com ${m?.[1]} (${fnum(sp)} V) decide uma saída digital.`, action: { kind: "arduino", sketch: "thermo", params: { sp: +sp.toFixed(3), hyst: 0.1 } } });
  } else if (hasAnalogRead && hasAnalogWrite) {
    out.push({ id: "ard-analog", title: "Leitura analógica controlando PWM", why: "analogRead alimenta analogWrite: o brilho ou a velocidade segue a entrada.", action: { kind: "arduino", sketch: "analog", params: {} } });
  } else if (hasDigRead) {
    out.push({ id: "ard-button", title: "Botão acendendo um LED", why: "digitalRead de uma entrada comanda digitalWrite de uma saída.", action: { kind: "arduino", sketch: "button", params: {} } });
  } else if (hasAnalogWrite && /\bfor\s*\(/.test(code)) {
    const d = delays[0] ?? 10;
    out.push({ id: "ard-fade", title: "Fade (subida e descida de brilho)", why: "Um laço for varia o valor do analogWrite.", action: { kind: "arduino", sketch: "fade", params: { T: +((d * 2 * 255) / 1000).toFixed(2) } } });
  } else if (writes.length >= 2 && delays.length >= 1) {
    const T = delays.slice(0, 2).reduce((a, b) => a + b, 0) / 1000;
    out.push({ id: "ard-blink", title: "Pisca-pisca", why: `Uma saída liga e desliga com esperas de ${delays.slice(0, 2).join(" e ")} ms (período de ${fnum(T)} s).`, action: { kind: "arduino", sketch: "blink", params: { T: Math.max(T, 0.01) } } });
  }
}

/** Reconhece as situações possíveis no código. A lista pode vir vazia. */
export function recognize(code: string, lang: Lang): Candidate[] {
  const out: Candidate[] = [];
  if (!code.trim()) return out;

  if (lang === "ladder") {
    const r = parseLadder(code);
    if (r.ok && r.lines.length) {
      const eqs = ladderEquations(r.lines);
      eqs.forEach((eq, i) => out.push({ id: `ladder-${i}`, title: `Circuito de portas da saída ${r.lines[i].out}`, why: `O ladder vira a equação ${eq}.`, action: { kind: "logic", eq } }));
    }
    return out;
  }

  if (lang === "arduino" || lang === "c" || lang === "cpp") recognizeArduino(code, out);

  // Função de transferência com coeficientes: tf([..],[..]) (Python, MATLAB, Julia) ou ct.tf / signal.TransferFunction.
  const tf = /(?:\btf|TransferFunction|lti)\s*\(\s*(?:np\.array\()?\s*\[([^\]]*)\]\s*\)?\s*,\s*(?:np\.array\()?\s*\[([^\]]*)\]/.exec(code) ?? /\btf\s*\(\s*c\(([^)]*)\)\s*,\s*c\(([^)]*)\)/.exec(code);
  let num: number[] | null = null,
    den: number[] | null = null;
  if (tf) {
    num = numList(tf[1]);
    den = numList(tf[2]);
    if (!num.length || !den.length || [...num, ...den].some((v) => !Number.isFinite(v))) num = den = null;
  }
  // Função escrita com s simbólico: s = tf('s'); G = 10/(s^2+3*s+2)
  let symbolic: string | null = null;
  if (!num && /\btf\s*\(\s*['"]s['"]\s*\)/.test(code)) {
    const m = /^\s*(\w+)\s*=\s*([^;\n]*\bs\b[^;\n]*?);?\s*$/m.exec(code.replace(/^\s*s\s*=.*$/m, ""));
    if (m) symbolic = m[2].replace(/\*\*/g, "^").replace(/(\d)\s*\*\s*s/g, "$1s").replace(/;/g, "");
  }
  const gain = (name: string) => {
    const m = new RegExp(`(?:^|[^\\w.])${name}\\s*(?:=|<-)\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`, "m").exec(code);
    return m ? Number(m[1]) : null;
  };
  const Kp = gain("Kp") ?? gain("kp"),
    Ki = gain("Ki") ?? gain("ki"),
    Kd = gain("Kd") ?? gain("kd");
  const hasPid = Kp !== null || Ki !== null || Kd !== null;

  if (num && den) {
    const text = tfText(num, den);
    out.push({ id: "tf-synth", title: "Montar G(s) como diagrama de blocos ou circuito", why: `Achei a função de transferência ${text}.`, action: { kind: "tf", text, tfNum: num, tfDen: den } });
    out.push({ id: "tf-step", title: "Resposta ao degrau de G(s), sem realimentação", why: "Mostra como a saída reage a uma entrada que sobe de 0 para 1.", action: { kind: "step", num, den } });
    out.push({ id: "tf-loop", title: hasPid ? "Malha fechada com o PID do código" : "Malha fechada com realimentação unitária", why: hasPid ? `Achei ganhos de PID (Kp ${fnum(Kp ?? 0)}, Ki ${fnum(Ki ?? 0)}, Kd ${fnum(Kd ?? 0)}) junto da função de transferência.` : "G(s) em malha fechada com ganho proporcional 1. Depois você ajusta o PID.", action: { kind: "loop", num, den, Kp: Kp ?? 1, Ki: Ki ?? 0, Kd: Kd ?? 0 } });
  } else if (symbolic) {
    const text = `H(s) = ${symbolic}`;
    out.push({ id: "tf-sym", title: "Montar G(s) como diagrama de blocos ou circuito", why: `Achei a expressão ${text}.`, action: { kind: "tf", text } });
  }

  // Espaço de estados
  const A = matrixOf(code, "A"),
    B = matrixOf(code, "B"),
    C = matrixOf(code, "C");
  if (A && B && C) {
    const D = matrixOf(code, "D") ?? "0";
    out.push({ id: "ss", title: "Simular o espaço de estados A, B, C, D", why: "Achei as quatro matrizes. O programa monta o modelo e confere a função de transferência.", action: { kind: "ss", A, B, C, D } });
  }

  // PID sem função de transferência
  if (hasPid && !(num && den)) {
    out.push({ id: "pid-only", title: "Malha com PID e um processo de 1ª ordem", why: `Achei ganhos de PID (Kp ${fnum(Kp ?? 0)}, Ki ${fnum(Ki ?? 0)}, Kd ${fnum(Kd ?? 0)}) sem a função de transferência. Usei G(s) = 1 / (s + 1) como processo.`, action: { kind: "loop", num: [1], den: [1, 1], Kp: Kp ?? 1, Ki: Ki ?? 0, Kd: Kd ?? 0 } });
  }

  // Liga-desliga: if x > N ... else
  if (!out.some((c) => c.id.startsWith("ard-"))) {
    const cmps = [...code.matchAll(/\b(?:el)?(?:se\s+)?if\s*\(?\s*(\w+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/g)];
    if (cmps.length) {
      const hi = cmps.find((c) => c[2].startsWith(">")),
        lo = cmps.find((c) => c[2].startsWith("<"));
      const th = hi && lo ? (Number(hi[3]) + Number(lo[3])) / 2 : Number((hi ?? lo)![3]);
      const hyst = hi && lo ? Math.abs(Number(hi[3]) - Number(lo[3])) : 0;
      const first = cmps[0];
      out.push({ id: "onoff", title: "Controle liga-desliga", why: `A variável ${first[1]} é comparada com ${first[3]}${hyst ? ` e ${lo && hi ? "com dois limites (histerese de " + fnum(hyst) + ")" : ""}` : ""}.`, action: { kind: "onoff", th, hyst, invert: first[2].startsWith("<") } });
    }
  }

  // Lógica booleana
  if (!out.some((c) => c.id.startsWith("ard-"))) {
    const lg = [...code.matchAll(/^\s*(?:(?:bool|int|var|let|const|auto)\s+)?(\w+)\s*(?:=|<-|:=)\s*([^\n=][^\n]*)$/gm)];
    let n = 0;
    for (const m of lg) {
      const expr = m[2].replace(/\/\/.*$|#.*$|%.*$/, "").trim();
      if (!/(\band\b|\bor\b|\bnot\b|&&|\|\||[&|~!^])/.test(expr) || /[<>]=?|==|\d\.\d|\bif\b/.test(expr)) continue;
      const lgc = normLogic(expr);
      if (!lgc || !/[A-F]/.test(lgc.eq)) continue;
      out.push({ id: `logic-${n++}`, title: `Circuito de portas e tabela-verdade de ${m[1]}`, why: `A expressão “${expr.replace(/;$/, "")}” é uma função lógica.${lgc.mapping ? " Variáveis: " + lgc.mapping + "." : ""}`, action: { kind: "logic", eq: `${m[1].length === 1 ? m[1].toUpperCase() : "S"} = ${lgc.eq}`, mapping: lgc.mapping } });
      if (n >= 3) break;
    }
  }
  return out;
}

/** Monta no quadro a simulação de um candidato que vira projeto. Os outros tipos abrem um painel. */
export function projectFor(a: CodeAction): ProjectIR | null {
  const sim = { tf: 20, rtol: 1e-6, atol: 1e-8 };
  const tfp = (num: number[], den: number[]) => ({ num: num.map(fnum).join(" "), den: den.map(fnum).join(" ") });
  if (a.kind === "step") {
    return build("Resposta ao degrau do código", [
      { id: "u", type: "signal.step", label: "Degrau", params: { t_step: 1, v0: 0, v1: 1 }, pos: [0, 0] },
      { id: "g", type: "control.tf", label: "G(s)", params: tfp(a.num, a.den), pos: [200, 0] },
      { id: "sc", type: "sink.scope", label: "Entrada e saída", pos: [420, 0] },
    ], [["u", "out", "g", "in"], ["u", "out", "sc", "in1"], ["g", "out", "sc", "in2"]], sim);
  }
  if (a.kind === "loop") {
    return build("Malha fechada do código", [
      { id: "r", type: "signal.step", label: "Referência", params: { t_step: 1, v0: 0, v1: 1 }, pos: [0, 0] },
      { id: "e", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [160, 0] },
      { id: "pid", type: "control.pid", label: "PID", params: { Kp: a.Kp, Ki: a.Ki, Kd: a.Kd, N: 20, limit: false, umin: -100, umax: 100, Kaw: 1, I0: 0 }, pos: [320, 0] },
      { id: "g", type: "control.tf", label: "G(s)", params: tfp(a.num, a.den), pos: [520, 0] },
      { id: "sc", type: "sink.scope", label: "Referência e saída", pos: [740, 0] },
    ], [["r", "out", "e", "in1"], ["g", "out", "e", "in2"], ["e", "out", "pid", "in"], ["pid", "out", "g", "in"], ["r", "out", "sc", "in1"], ["g", "out", "sc", "in2"]], sim);
  }
  if (a.kind === "arduino") {
    const base = { sketch: a.sketch, ...a.params };
    const comps: Parameters<typeof build>[1] = [{ id: "u", type: "ic.arduino", label: "Arduino Uno", params: base, pos: [260, 0] }];
    const conns: [string, string, string, string][] = [];
    if (a.sketch === "analog" || a.sketch === "thermo") {
      comps.push({ id: "sn", type: "signal.sine", label: "Variação do sensor", params: { amp: 1.2, freq: 0.05, phase: 0 }, pos: [0, 0] }, { id: "off", type: "signal.constant", label: "Valor médio (V)", params: { value: a.sketch === "thermo" ? Number(a.params.sp ?? 2.5) : 2.5 }, pos: [0, 100] }, { id: "in", type: "math.sum", label: "Sensor (V)", params: { signs: "++" }, pos: [130, 40] });
      conns.push(["sn", "out", "in", "in1"], ["off", "out", "in", "in2"], ["in", "out", "u", "A0"]);
    }
    if (a.sketch === "button") {
      comps.push({ id: "in", type: "signal.step", label: "Botão (D2)", params: { t_step: 2, v0: 0, v1: 1 }, pos: [0, 0] });
      conns.push(["in", "out", "u", "D2"]);
    }
    comps.push({ id: "sc", type: "sink.scope", label: "Saídas D9, D12 e D13", pos: [520, 0] });
    conns.push(["u", "D9", "sc", "in1"], ["u", "D12", "sc", "in2"], ["u", "D13", "sc", "in3"]);
    if (a.sketch === "traffic") conns.splice(conns.length - 3, 3, ["u", "D10", "sc", "in1"], ["u", "D11", "sc", "in2"], ["u", "D12", "sc", "in3"]);
    return build("Arduino do código", comps, conns, { tf: a.sketch === "traffic" ? 40 : 20, rtol: 1e-6, atol: 1e-8 });
  }
  if (a.kind === "onoff") {
    return build("Liga-desliga do código", [
      { id: "sn", type: "signal.sine", label: "Variação", params: { amp: Math.max(Math.abs(a.th) * 0.3, a.hyst, 1), freq: 0.05, phase: 0 }, pos: [0, 0] },
      { id: "off", type: "signal.constant", label: "Valor médio", params: { value: a.th }, pos: [0, 100] },
      { id: "x", type: "math.sum", label: "Variável medida", params: { signs: "++" }, pos: [130, 40] },
      { id: "c", type: "dig.comparator", label: "Comparador", params: { th: a.th, hyst: a.hyst, invert: a.invert, y0: 0 }, pos: [220, 0] },
      { id: "l", type: "dig.led", label: "Saída", params: { color: "red" }, pos: [420, 0] },
      { id: "sc", type: "sink.scope", label: "Variável e saída", pos: [420, 120] },
    ], [["sn", "out", "x", "in1"], ["off", "out", "x", "in2"], ["x", "out", "c", "in"], ["c", "y", "l", "a"], ["x", "out", "sc", "in1"], ["c", "y", "sc", "in2"]], { tf: 40, rtol: 1e-6, atol: 1e-8 });
  }
  return null;
}
