// Símbolos dos componentes digitais, semicondutores e amplificadores.
// As posições dos terminais seguem a mesma fórmula do BlockNode: uma porta fica no meio do lado,
// várias se espalham com margem de 14 px (16 px em cima e embaixo).

import type { ReactNode } from "react";
import type { ParamValue } from "@ufci/engine";

type Params = Record<string, ParamValue>;
export interface Size {
  w: number;
  h: number;
}
export type Live = Record<string, number>;

const stroke = "#1b2a41";
const ELEC = "#c9741a";
const DIG = "#0e7490";
const FILL = "#fff";

const num = (p: Params, k: string, d = 0) => {
  const v = p[k]?.value;
  return typeof v === "number" ? v : d;
};
const str = (p: Params, k: string, d = "") => {
  const v = p[k]?.value;
  return v === undefined ? d : String(v);
};
const bool = (p: Params, k: string) => p[k]?.value === true;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fin = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Posição de cada porta ao longo de um lado de comprimento ext. */
export function spread(n: number, ext: number, m = 14): number[] {
  if (n <= 1) return [ext / 2];
  return Array.from({ length: n }, (_, i) => m + (i * (ext - 2 * m)) / (n - 1));
}

const LED_COLOR: Record<string, string> = { red: "#e5342b", green: "#2fb344", yellow: "#f2b705", blue: "#2f7bf0" };
export const ledColor = (name: string) => LED_COLOR[name] ?? LED_COLOR.red;

/** Mistura a cor com o branco (f = 0) ou deixa pura (f = 1). */
function lit(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 + (v - 255) * clamp(f, 0, 1)));
  return `rgb(${c.join(",")})`;
}

const GATES = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);

/** Tamanho dos símbolos deste arquivo, ou null quando o símbolo é de outra família. */
export function semiSize(symbol: string, p: Params): Size | null {
  if (symbol.startsWith("g-")) {
    const kind = symbol.slice(2);
    if (kind === "not" || kind === "buf") return { w: 64, h: 48 };
    const n = Math.max(2, Math.round(num(p, "n", 2)));
    return { w: 76, h: Math.max(56, 28 + 16 * (n - 1)) };
  }
  switch (symbol) {
    case "diode":
    case "led":
    case "zener":
      return { w: 100, h: 48 };
    case "npn":
    case "pnp":
      return { w: 96, h: 96 };
    case "nmos":
    case "pmos":
      return { w: 96, h: 88 };
    case "opamp":
      return { w: 110, h: 92 };
    case "switch":
      return { w: 100, h: 56 };
    case "ic-555":
      return { w: 130, h: 120 };
    case "dclock":
      return { w: 84, h: 56 };
    case "dswitch":
      return { w: 70, h: 56 };
    case "dled":
      return { w: 56, h: 56 };
    case "dsev":
      return { w: 80, h: 110 };
    case "ic-dff":
    case "ic-jkff":
      return { w: 100, h: 84 };
    case "ic-tff":
      return { w: 100, h: 70 };
    case "ic-sr":
    case "ic-dlatch":
      return { w: 100, h: 60 };
    case "ic-counter":
    case "ic-shift": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      const outs = symbol === "ic-counter" ? bits + 1 : bits;
      return { w: 112, h: Math.max(80, 24 + 20 * (outs - 1)) };
    }
    case "ic-mux":
      return { w: 76, h: 84 };
    case "ic-dec":
      return { w: 100, h: 96 };
    case "ic-adder":
      return { w: 110, h: 84 };
    case "ic-cmp":
      return { w: 110, h: 64 };
    case "ic-adc":
    case "ic-dac": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      const n = symbol === "ic-adc" ? bits + 1 : bits;
      return { w: 120, h: Math.max(84, 24 + 20 * (n - 1)) };
    }
    default:
      return null;
  }
}

const font = "'Cambria Math','STIX Two Math',Georgia,serif";
function T(x: number, y: number, t: string, size = 12, anchor: "middle" | "start" | "end" = "middle", weight = 600, fill = stroke): ReactNode {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} dominantBaseline="middle" fontWeight={weight} fontFamily={font}>
      {t}
    </text>
  );
}

function gateArt(kind: string, p: Params, w: number, h: number): ReactNode {
  const cy = h / 2;
  const L = 14;
  const invert = kind === "nand" || kind === "nor" || kind === "xnor" || kind === "not";
  const R = w - (invert ? 14 : 10);
  const top = 4,
    bot = h - 4;
  const n = kind === "not" || kind === "buf" ? 1 : Math.max(2, Math.round(num(p, "n", 2)));
  const ys = spread(n, h);
  const base = kind === "nand" ? "and" : kind === "nor" ? "or" : kind === "xnor" ? "xor" : kind;
  let body: string;
  if (base === "and") {
    const r = (bot - top) / 2;
    body = `M${L} ${top}H${R - r}A${r} ${r} 0 0 1 ${R - r} ${bot}H${L}Z`;
  } else if (base === "or" || base === "xor") {
    body = `M${L} ${top}Q${L + (R - L) * 0.62} ${top} ${R} ${cy}Q${L + (R - L) * 0.62} ${bot} ${L} ${bot}Q${L + 12} ${cy} ${L} ${top}Z`;
  } else {
    body = `M${L} 6L${R} ${cy}L${L} ${h - 6}Z`;
  }
  return (
    <>
      {ys.map((y, i) => {
        const u = (y - cy) / ((bot - top) / 2);
        const bulge = 6 * (1 - u * u);
        const x = base === "or" ? L + bulge : base === "xor" ? L - 6 + bulge : L;
        return <path key={i} d={`M0 ${y}H${x}`} stroke={DIG} strokeWidth={1.8} />;
      })}
      <path d={body} fill={FILL} stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
      {base === "xor" && <path d={`M${L - 6} ${top}Q${L + 6} ${cy} ${L - 6} ${bot}`} fill="none" stroke={stroke} strokeWidth={1.7} />}
      {invert && <circle cx={R + 4} cy={cy} r={4} fill={FILL} stroke={stroke} strokeWidth={1.6} />}
      <path d={`M${R + (invert ? 8 : 0)} ${cy}H${w}`} stroke={DIG} strokeWidth={1.8} />
    </>
  );
}

/** Caixa de CI com título e marca de clock (triângulo) nas portas indicadas. */
function icBox(w: number, h: number, title: string, clockAt: number[] = [], sub?: ReactNode, titleY?: number): ReactNode {
  return (
    <>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={3} fill={FILL} stroke={stroke} strokeWidth={1.7} />
      {clockAt.map((y) => (
        <path key={y} d={`M1 ${y - 5}L9 ${y}L1 ${y + 5}`} fill="none" stroke={stroke} strokeWidth={1.4} />
      ))}
      {T(w / 2, titleY ?? h / 2, title, 12.5, "middle", 700)}
      {sub}
    </>
  );
}

function leadsLR(w: number, left: number[], right: number[], color = DIG): ReactNode {
  return (
    <>
      {left.map((y, i) => (
        <path key={`l${i}`} d={`M0 ${y}H1`} stroke={color} strokeWidth={1.8} />
      ))}
      {right.map((y, i) => (
        <path key={`r${i}`} d={`M${w - 1} ${y}H${w}`} stroke={color} strokeWidth={1.8} />
      ))}
    </>
  );
}

const clockY = (idx: number, n: number, h: number) => spread(n, h)[idx];

const SEG: Record<number, string> = {
  0: "abcdef",
  1: "bc",
  2: "abdeg",
  3: "abcdg",
  4: "bcfg",
  5: "acdfg",
  6: "acdefg",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
  10: "abcefg",
  11: "cdefg",
  12: "adef",
  13: "bcdeg",
  14: "adefg",
  15: "aefg",
};

function sevenSeg(cx: number, y0: number, wd: number, ht: number, code: number | null): ReactNode {
  const on = code === null ? "" : (SEG[code] ?? "");
  const x0 = cx - wd / 2;
  const seg = (name: string, d: string) => <path key={name} d={d} fill={on.includes(name) ? "#e5342b" : "#e6e9ef"} stroke={on.includes(name) ? "#b3261e" : "#cfd5e0"} strokeWidth={0.6} />;
  const vt = (x: number, y: number) => `M${x} ${y + 2}l3 3v${ht / 2 - 8}l-3 3l-3 -3v${-(ht / 2 - 8)}z`;
  const mid = y0 + ht / 2;
  return (
    <>
      {seg("a", `M${x0 + 4} ${y0}h${wd - 8}l-3 4h${-(wd - 14)}z`)}
      {seg("g", `M${x0 + 4} ${mid}l3 -3h${wd - 14}l3 3l-3 3h${-(wd - 14)}z`)}
      {seg("d", `M${x0 + 4} ${y0 + ht}h${wd - 8}l-3 -4h${-(wd - 14)}z`)}
      {seg("f", vt(x0 + 3, y0 + 1))}
      {seg("b", vt(x0 + wd - 3, y0 + 1))}
      {seg("e", vt(x0 + 3, mid))}
      {seg("c", vt(x0 + wd - 3, mid))}
    </>
  );
}

/** Desenha o símbolo, ou null se não for deste arquivo. */
export function semiArt(symbol: string, p: Params, w: number, h: number, live: Live | undefined): ReactNode | null {
  const cx = w / 2,
    cy = h / 2;
  if (symbol.startsWith("g-")) return gateArt(symbol.slice(2), p, w, h);
  switch (symbol) {
    case "diode":
    case "led":
    case "zener": {
      const isLed = symbol === "led";
      const col = ledColor(str(p, "color", "red"));
      const f = isLed && fin(live?.i) ? clamp(live!.i / 0.015, 0, 1) : 0;
      const fillTri = isLed ? lit(col, 0.12 + 0.88 * f) : FILL;
      return (
        <>
          <path d={`M0 ${cy}H${cx - 11}M${cx + 11} ${cy}H${w}`} stroke={ELEC} strokeWidth={1.8} />
          {isLed && f > 0.05 && <circle cx={cx} cy={cy} r={20 + 6 * f} fill={col} opacity={0.18 + 0.3 * f} />}
          <path d={`M${cx - 11} ${cy - 13}L${cx + 11} ${cy}L${cx - 11} ${cy + 13}Z`} fill={fillTri} stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
          {symbol === "zener" ? (
            <path d={`M${cx + 6} ${cy - 15}L${cx + 11} ${cy - 13}V${cy + 13}L${cx + 16} ${cy + 15}`} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" />
          ) : (
            <path d={`M${cx + 11} ${cy - 14}V${cy + 14}`} stroke={stroke} strokeWidth={2.2} />
          )}
          {isLed && (
            <>
              <path d={`M${cx - 2} ${cy - 15}l7 -9`} stroke={col} strokeWidth={1.5} markerEnd="url(#arrow-n)" />
              <path d={`M${cx + 6} ${cy - 15}l7 -9`} stroke={col} strokeWidth={1.5} markerEnd="url(#arrow-n)" />
            </>
          )}
          {symbol === "zener" && T(cx, 7, `${num(p, "Vz", 5.1)} V`, 10.5, "middle", 500)}
        </>
      );
    }
    case "npn":
    case "pnp": {
      const pnp = symbol === "pnp";
      const bx = 36;
      // Em ambos, a ponta de cima é a do terminal de cima (coletor no NPN, emissor no PNP).
      const topLeg = (
        <path d={`M${bx} 38L${cx} 24V0`} fill="none" stroke={ELEC} strokeWidth={1.8} strokeLinejoin="round" />
      );
      const botLeg = (
        <path d={`M${bx} 58L${cx} 72V${h}`} fill="none" stroke={ELEC} strokeWidth={1.8} strokeLinejoin="round" />
      );
      return (
        <>
          <circle cx={46} cy={cy} r={35} fill={FILL} stroke={stroke} strokeWidth={1.4} opacity={0.9} />
          <path d={`M0 ${cy}H${bx}`} stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${bx} 26V70`} stroke={stroke} strokeWidth={3} />
          {topLeg}
          {botLeg}
          {pnp ? (
            // emissor em cima: seta entra na base
            <path d={`M${cx - 1} 25.5L${bx + 3} 36`} stroke={stroke} strokeWidth={1.6} markerEnd="url(#arrow-n)" />
          ) : (
            // emissor embaixo: seta sai da base
            <path d={`M${bx + 3} 60L${cx - 1} 70.5`} stroke={stroke} strokeWidth={1.6} markerEnd="url(#arrow-n)" />
          )}
        </>
      );
    }
    case "nmos":
    case "pmos": {
      const pmos = symbol === "pmos";
      const gx = 30,
        chx = 40;
      const upper = 27,
        lower = h - 27;
      return (
        <>
          <path d={`M0 ${cy}H${gx}`} stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${gx} ${cy - 20}V${cy + 20}`} stroke={stroke} strokeWidth={2.6} />
          <path d={`M${chx} ${cy - 22}V${cy - 10}M${chx} ${cy - 6}V${cy + 6}M${chx} ${cy + 10}V${cy + 22}`} stroke={stroke} strokeWidth={2.6} />
          <path d={`M${chx} ${upper}H${cx}V0M${chx} ${lower}H${cx}V${h}`} fill="none" stroke={ELEC} strokeWidth={1.8} strokeLinejoin="round" />
          <path d={pmos ? `M${cx} ${upper}V${cy}` : `M${cx} ${cy}V${lower}`} stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${cx} ${cy}H${chx}`} stroke={stroke} strokeWidth={1.6} />
          <path d={pmos ? `M${cx - 8} ${cy - 4}L${cx} ${cy}L${cx - 8} ${cy + 4}Z` : `M${chx + 8} ${cy - 4}L${chx} ${cy}L${chx + 8} ${cy + 4}Z`} fill={stroke} />
        </>
      );
    }
    case "opamp": {
      const A = 14;
      return (
        <>
          <path d={`M0 14H${A}M0 ${h - 14}H${A}M${w - A} ${cy}H${w}`} stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${A} 4L${w - A} ${cy}L${A} ${h - 4}Z`} fill={FILL} stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
          {T(cx - 4, cy, "A", 15, "middle", 600)}
          {T(cx + 8, cy - 16, `+${num(p, "vpos", 12)}`, 9.5, "middle", 500)}
          {T(cx + 8, cy + 16, `${num(p, "vneg", -12)}`, 9.5, "middle", 500)}
        </>
      );
    }
    case "switch": {
      const closed = fin(live?.u) ? live!.u >= 0.5 : false;
      return (
        <>
          <path d={`M0 ${cy}H24M${w - 24} ${cy}H${w}`} stroke={ELEC} strokeWidth={1.8} />
          <circle cx={24} cy={cy} r={3} fill={stroke} />
          <circle cx={w - 24} cy={cy} r={3} fill={stroke} />
          <path d={closed ? `M24 ${cy}L${w - 24} ${cy}` : `M24 ${cy}L${w - 30} ${cy - 16}`} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
          <path d={`M${cx} 0V${cy - 20}`} stroke={DIG} strokeWidth={1.4} strokeDasharray="3 2" />
        </>
      );
    }
    case "dclock": {
      const q = (w - 28) / 4;
      const y1 = cy - 11,
        y0 = cy + 11;
      return (
        <>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={3} fill={FILL} stroke={stroke} strokeWidth={1.7} />
          <path d={`M10 ${y0}H${10 + q * 0.5}V${y1}H${10 + q * 1.5}V${y0}H${10 + q * 2.5}V${y1}H${10 + q * 3.5}V${y0}H${w - 14}`} fill="none" stroke="#2a6bd6" strokeWidth={1.8} />
          <path d={`M${w - 1} ${cy}H${w}`} stroke={DIG} strokeWidth={1.8} />
        </>
      );
    }
    case "dswitch": {
      const on = bool(p, "on");
      return (
        <>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={3} fill={FILL} stroke={stroke} strokeWidth={1.7} />
          <rect x={cx - 18} y={cy - 9} width={36} height={18} rx={9} fill={on ? "#2fb344" : "#c6ccd8"} stroke={stroke} strokeWidth={1.4} />
          <circle cx={on ? cx + 9 : cx - 9} cy={cy} r={7} fill={FILL} stroke={stroke} strokeWidth={1.4} />
          {T(cx, cy - 18, on ? "1" : "0", 10, "middle", 700)}
          <path d={`M${w - 1} ${cy}H${w}`} stroke={DIG} strokeWidth={1.8} />
        </>
      );
    }
    case "dled": {
      const col = ledColor(str(p, "color", "green"));
      const level = fin(live?.a) ? (live!.a >= 0.5 ? 1 : 0) : 0;
      return (
        <>
          <path d={`M0 ${cy}H${cx - 16}`} stroke={DIG} strokeWidth={1.8} />
          {level > 0 && <circle cx={cx} cy={cy} r={24} fill={col} opacity={0.28} />}
          <circle cx={cx} cy={cy} r={16} fill={level ? col : lit(col, 0.14)} stroke={stroke} strokeWidth={1.7} />
          <path d={`M${cx - 6} ${cy - 7}a8 8 0 0 1 6 -4`} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
        </>
      );
    }
    case "dsev": {
      const ins = ["b0", "b1", "b2", "b3"].map((k) => live?.[k]);
      const known = ins.some(fin);
      const code = known ? ins.reduce<number>((a, v, i) => a + (fin(v) && v >= 0.5 ? 1 << i : 0), 0) : null;
      return (
        <>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} fill="#20242d" stroke={stroke} strokeWidth={1.7} />
          <g transform="translate(6 0)">{sevenSeg(cx - 6, 18, 36, 74, code)}</g>
          {code !== null && T(w - 14, 18, code.toString(16).toUpperCase(), 10, "middle", 700, "#9fb0c8")}
        </>
      );
    }
    case "ic-dff":
      return (
        <>
          {leadsLR(w, spread(4, h), spread(2, h))}
          {icBox(w, h, "FF D", [clockY(1, 4, h)])}
        </>
      );
    case "ic-jkff":
      return (
        <>
          {leadsLR(w, spread(4, h), spread(2, h))}
          {icBox(w, h, "FF JK", [clockY(1, 4, h)])}
        </>
      );
    case "ic-tff":
      return (
        <>
          {leadsLR(w, spread(3, h), spread(2, h))}
          {icBox(w, h, "FF T", [clockY(1, 3, h)])}
        </>
      );
    case "ic-sr":
      return (
        <>
          {leadsLR(w, spread(2, h), spread(2, h))}
          {icBox(w, h, "Latch SR")}
        </>
      );
    case "ic-dlatch":
      return (
        <>
          {leadsLR(w, spread(2, h), spread(2, h))}
          {icBox(w, h, "Latch D")}
        </>
      );
    case "ic-counter": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      const v = fin(live?.v) ? String(Math.round(live!.v)) : "";
      return (
        <>
          {leadsLR(w, spread(2, h), spread(bits + 1, h))}
          {icBox(w, h, "Contador", [clockY(0, 2, h)], v ? T(w / 2, h / 2 + 18, v, 16, "middle", 700, "#2a6bd6") : T(w / 2, h / 2 + 16, `mod ${num(p, "mod", 2 ** bits)}`, 10, "middle", 500), h / 2 - 6)}
        </>
      );
    }
    case "ic-shift": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      return (
        <>
          {leadsLR(w, spread(3, h), spread(bits, h))}
          {icBox(w, h, "Reg. deslocamento", [clockY(1, 3, h)])}
        </>
      );
    }
    case "ic-mux":
      return (
        <>
          {leadsLR(w, spread(3, h), [cy])}
          <path d={`M1 1L${w - 1} 14V${h - 14}L1 ${h - 1}Z`} fill={FILL} stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
          {T(cx + 4, cy, "MUX", 11, "middle", 700)}
        </>
      );
    case "ic-dec":
      return (
        <>
          {leadsLR(w, spread(2, h), spread(4, h))}
          {icBox(w, h, "Dec 2:4")}
        </>
      );
    case "ic-adder":
      return (
        <>
          {leadsLR(w, spread(3, h), spread(2, h))}
          {icBox(w, h, "Σ  Somador")}
        </>
      );
    case "ic-cmp": {
      const y = fin(live?.y) ? live!.y : NaN;
      const c = fin(y) ? (y >= 0.5 ? "#2fb344" : "#7b8798") : "#9aa6b8";
      return (
        <>
          {leadsLR(w, [cy], [cy])}
          {icBox(w, h, "Comparador", [], undefined, h / 2 - 9)}
          <path d={`M${cx - 24} ${cy + 12}H${cx - 4}V${cy + 3}H${cx + 24}`} fill="none" stroke={c} strokeWidth={1.8} />
          {T(cx, h - 6, `${num(p, "th", 0)} ± ${num(p, "hyst", 0) / 2}`, 9, "middle", 500)}
        </>
      );
    }
    case "ic-adc": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      return (
        <>
          {leadsLR(w, spread(2, h), spread(bits + 1, h))}
          {icBox(w, h, "ADC", [clockY(1, 2, h)], T(w / 2, h / 2 + 14, `${bits} bits`, 10, "middle", 500), h / 2 - 4)}
        </>
      );
    }
    case "ic-dac": {
      const bits = Math.max(1, Math.round(num(p, "bits", 4)));
      return (
        <>
          {leadsLR(w, spread(bits, h), [cy])}
          {icBox(w, h, "DAC", [], T(w / 2, h / 2 + 14, `${bits} bits`, 10, "middle", 500), h / 2 - 4)}
        </>
      );
    }
    case "ic-555":
      return (
        <>
          {leadsLR(w, spread(3, h), spread(2, h))}
          {icBox(w, h, "555", [], T(cx, cy + 16, `Vcc ${num(p, "vcc", 5)} V`, 10, "middle", 500), cy - 4)}
        </>
      );
    default:
      return null;
  }
}
