// Símbolos dos blocos, no estilo dos livros de controle (D'Azzo, Ogata): caixas com a função
// de transferência, círculo somador, triângulo de ganho.

import { useId } from "react";
import type { ParamValue } from "@ufci/engine";
import { semiArt, semiSize } from "./SymbolsSemi";

type Params = Record<string, ParamValue>;
const num = (p: Params, k: string, d = 0) => {
  const v = p[k]?.value;
  return typeof v === "number" ? v : d;
};
const str = (p: Params, k: string, d = "") => {
  const v = p[k]?.value;
  return v === undefined ? d : String(v);
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fin = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Cor da água pela temperatura: azul a 20 °C, vermelho a 95 °C. */
export function tempColor(T: number): string {
  const f = clamp((T - 20) / 75, 0, 1);
  const a = [90, 169, 239],
    b = [224, 64, 40];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
}

/** Valores ao vivo das saídas do componente, por nome de porta (Tw: temperatura de cor). */
export type LiveVals = Record<string, number>;

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (n: number) => [...String(n)].map((c) => SUP[+c] ?? c).join("");
/** Valor com prefixo do SI e vírgula decimal: 2,2 µF, 4,7 kΩ. */
export function si(v: number, unit: string): string {
  if (!Number.isFinite(v)) return `? ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const P: [number, string][] = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const a = Math.abs(v);
  const [f, pre] = P.find(([k]) => a >= k * 0.9995) ?? P[P.length - 1];
  return `${String(+(v / f).toPrecision(3)).replace(".", ",")} ${pre}${unit}`;
}
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toPrecision(3)));

export function polyText(text: string): string {
  const parts = text
    .replace(/[\[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => Number(s.replace(",", ".")));
  if (!parts.length || parts.some((v) => !Number.isFinite(v))) return "?";
  const n = parts.length - 1;
  let out = "";
  parts.forEach((c, i) => {
    if (c === 0) return;
    const pw = n - i;
    const a = Math.abs(c);
    const sign = c < 0 ? "−" : out ? "+" : "";
    const coef = pw > 0 && a === 1 ? "" : fmt(a);
    const v = pw === 0 ? "" : pw === 1 ? "s" : `s${sup(pw)}`;
    out += `${sign}${coef}${v}`;
  });
  return out || "0";
}

export interface NodeSize {
  w: number;
  h: number;
}

export function nodeSize(symbol: string, p: Params): NodeSize {
  switch (symbol) {
    case "sum":
      return { w: 46, h: 46 };
    case "gain":
      return { w: 70, h: 56 };
    case "tf": {
      const len = Math.max(polyText(str(p, "num", "1")).length, polyText(str(p, "den", "1 1")).length);
      return { w: Math.min(260, Math.max(100, len * 8 + 30)), h: 64 };
    }
    case "pid":
      return { w: 124, h: 70 };
    case "scope":
      return { w: 92, h: 78 };
    case "ss":
      return { w: 118, h: 56 };
    // Os tanques crescem de leve com a altura e a área (ou o volume), sem mudar o encaixe das portas.
    case "tank":
      return { w: clamp(Math.round(72 + 26 * Math.sqrt(num(p, "A", 1.2))), 72, 128), h: clamp(Math.round(66 + 34 * Math.sqrt(num(p, "hmax", 2))), 66, 136) };
    case "htank": {
      const k = Math.cbrt(num(p, "V", 0.05) / 0.05);
      return { w: clamp(Math.round(70 + 28 * k), 70, 130), h: clamp(Math.round(70 + 26 * k), 70, 130) };
    }
    case "boiler":
      return { w: clamp(Math.round(86 + 24 * Math.sqrt(num(p, "A", 0.5))), 86, 132), h: clamp(Math.round(78 + 28 * Math.sqrt(num(p, "hmax", 1))), 78, 140) };
    case "valve":
    case "pump":
    case "heater":
      return { w: 72, h: 60 };
    case "stock":
    case "queue":
    case "cash":
      return { w: 92, h: 64 };
    case "product":
      return { w: 52, h: 52 };
    case "lag":
    case "deadtime":
    case "intlim":
    case "sqrt":
    case "abs":
      return { w: 92, h: 56 };
    case "mass":
    case "inertia":
      return { w: 96, h: 64 };
    case "spring":
    case "tspring":
    case "damper":
    case "tdamper":
    case "inductor":
      return { w: 112, h: 56 };
    case "resistor":
      return { w: 100, h: 48 };
    case "capacitor":
    case "force":
    case "torque":
    case "velsrc":
    case "speedsrc":
      return { w: 84, h: 56 };
    case "wall":
      return { w: 64, h: 72 };
    case "rack":
    case "gear":
      return { w: 112, h: 68 };
    case "vsource":
    case "isource":
      return { w: 60, h: 84 };
    case "egnd":
      return { w: 52, h: 44 };
    case "voltmeter":
      return { w: 72, h: 60 };
    case "motor":
      return { w: 116, h: 92 };
    case "note": {
      const t = str(p, "text", "");
      const lines = wrapNote(t, 22);
      return { w: 184, h: Math.max(56, 26 + lines.length * 16) };
    }
    default:
      return semiSize(symbol, p) ?? { w: 92, h: 56 };
  }
}

/** Quebra o texto de uma nota em linhas curtas. */
export function wrapNote(text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > max && line) {
        out.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out.slice(0, 12);
}

const stroke = "#1b2a41";
const water = "#5aa9ef";
export const DOMAIN_COLOR = { signal: "#1b2a41", mech: "#2f8f5b", rot: "#7a45c4", elec: "#c9741a" } as const;
const MECH = DOMAIN_COLOR.mech,
  ROT = DOMAIN_COLOR.rot,
  ELEC = DOMAIN_COLOR.elec;

/** Linha de onda que se repete a cada 24 px, para a animação de deslizar sem emendas. */
function wavePath(x0: number, y: number, len: number): string {
  let d = `M${x0} ${y}q6 -3 12 0`;
  for (let i = 1; i < Math.ceil(len / 12); i++) d += "t12 0";
  return d;
}

function bubbles(l: number, r: number, bot: number, uid: string, n: number) {
  return Array.from({ length: n }, (_, i) => (
    <circle key={`${uid}b${i}`} className="bubble" cx={l + 8 + ((r - l - 16) * (i + 0.5)) / n} cy={bot - 6} r={2.2} fill="#fff" style={{ animationDelay: `${(i * 0.37) % 1.4}s` }} />
  ));
}

export function SymbolArt({ symbol, params, w, h, live }: { symbol: string; params: Params; w: number; h: number; live?: LiveVals }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cx = w / 2,
    cy = h / 2;
  const txt = (x: number, y: number, t: string, size = 13, anchor: "middle" | "start" | "end" = "middle", weight = 500) => (
    <text x={x} y={y} fontSize={size} fill={stroke} textAnchor={anchor} dominantBaseline="middle" fontWeight={weight} fontFamily="'Cambria Math','STIX Two Math',Georgia,serif">
      {t}
    </text>
  );
  const box = <rect x={1} y={1} width={w - 2} height={h - 2} rx={2} fill="#fff" stroke={stroke} strokeWidth={1.6} />;
  const wave = (d: string) => <path d={d} fill="none" stroke="#2a6bd6" strokeWidth={1.8} strokeLinejoin="round" />;

  switch (symbol) {
    case "sum": {
      const r = w / 2 - 1.5;
      const k = r * 0.62;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          <path d={`M${cx - k} ${cy - k}L${cx + k} ${cy + k}M${cx - k} ${cy + k}L${cx + k} ${cy - k}`} stroke={stroke} strokeWidth={1.2} opacity={0.55} />
        </>
      );
    }
    case "gain":
      return (
        <>
          <path d={`M2 2L${w - 2} ${cy}L2 ${h - 2}Z`} fill="#fff" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
          {txt(cx - 10, cy, fmt(num(params, "K", 1)), 13)}
        </>
      );
    case "integrator":
      return (
        <>
          {box}
          <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke={stroke} strokeWidth={1.4} />
          {txt(cx, cy - 10, "1", 14)}
          {txt(cx, cy + 11, "s", 14)}
        </>
      );
    case "derivative":
      return (
        <>
          {box}
          {txt(cx, cy, "s", 16)}
        </>
      );
    case "tf": {
      const n = polyText(str(params, "num", "1")),
        d = polyText(str(params, "den", "1 1"));
      const lw = Math.max(n.length, d.length) * 7.4;
      return (
        <>
          {box}
          {txt(cx, cy - 12, n, 13)}
          <line x1={cx - lw / 2} y1={cy} x2={cx + lw / 2} y2={cy} stroke={stroke} strokeWidth={1.4} />
          {txt(cx, cy + 13, d, 13)}
        </>
      );
    }
    case "ss":
      return (
        <>
          {box}
          {txt(cx, cy - 9, "ẋ = Ax + Bu", 11)}
          {txt(cx, cy + 10, "y = Cx + Du", 11)}
        </>
      );
    case "pid":
      return (
        <>
          {box}
          {txt(cx, 15, "PID", 14, "middle", 700)}
          {txt(cx, 36, `Kp=${fmt(num(params, "Kp", 1))}`, 10.5)}
          {txt(cx, 49, `Ki=${fmt(num(params, "Ki"))}  Kd=${fmt(num(params, "Kd"))}`, 10.5)}
        </>
      );
    case "constant":
      return (
        <>
          {box}
          {txt(cx, cy, fmt(num(params, "value", 1)), 15)}
        </>
      );
    case "manual": {
      const lo = num(params, "min", -1),
        hi = num(params, "max", 1),
        v = num(params, "value", 0);
      const f = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
      return (
        <>
          {box}
          <line x1={10} y1={cy + 10} x2={w - 10} y2={cy + 10} stroke="#9fb1cc" strokeWidth={3} strokeLinecap="round" />
          <circle cx={10 + f * (w - 20)} cy={cy + 10} r={5.5} fill="#2a6bd6" />
          {txt(cx, cy - 10, fmt(v), 14)}
        </>
      );
    }
    case "step": {
      const t = num(params, "t_step", 1);
      void t;
      return (
        <>
          {box}
          {wave(`M10 ${h - 16}H${cx} V16 H${w - 10}`)}
        </>
      );
    }
    case "ramp":
      return (
        <>
          {box}
          {wave(`M10 ${h - 16}H${cx - 14} L${w - 12} 14`)}
        </>
      );
    case "sine": {
      let d = `M10 ${cy}`;
      for (let i = 1; i <= 40; i++) d += ` L${10 + (i / 40) * (w - 20)} ${cy - Math.sin((i / 40) * Math.PI * 2) * 14}`;
      return (
        <>
          {box}
          {wave(d)}
        </>
      );
    }
    case "pulse":
      return (
        <>
          {box}
          {wave(`M8 ${h - 16}V16H${cx - 8}V${h - 16}H${cx + 6}V16H${w - 8}`)}
        </>
      );
    case "saturation":
      return (
        <>
          {box}
          <path d={`M8 ${cy}H${w - 8}M${cx} 8V${h - 8}`} stroke="#c4cfe0" strokeWidth={1} />
          {wave(`M10 ${h - 16}H${cx - 14}L${cx + 14} 16H${w - 10}`)}
        </>
      );
    case "deadzone":
      return (
        <>
          {box}
          <path d={`M8 ${cy}H${w - 8}M${cx} 8V${h - 8}`} stroke="#c4cfe0" strokeWidth={1} />
          {wave(`M10 ${h - 14}L${cx - 12} ${cy}H${cx + 12}L${w - 10} 14`)}
        </>
      );
    case "scope":
      return (
        <>
          {box}
          <path d={`M10 12V${h - 12}H${w - 10}`} stroke="#9fb1cc" strokeWidth={1.2} fill="none" />
          {wave(`M12 ${h - 18}C ${cx - 14} ${h - 18} ${cx - 14} 16 ${cx + 6} 20 S ${w - 22} ${cy - 6} ${w - 12} ${cy - 8}`)}
        </>
      );
    case "lag":
      return (
        <>
          {box}
          {txt(cx, cy - 11, `${fmt(num(params, "K", 1))}`, 13)}
          <line x1={cx - 22} y1={cy} x2={cx + 22} y2={cy} stroke={stroke} strokeWidth={1.4} />
          {txt(cx, cy + 12, `${fmt(num(params, "tau", 1))}s + 1`, 13)}
        </>
      );
    case "deadtime":
      return (
        <>
          {box}
          {txt(cx, cy - 10, "e", 17)}
          {txt(cx + 10, cy - 17, `−${fmt(num(params, "T", 1))}s`, 11, "start")}
          {txt(cx, cy + 13, "atraso", 10.5)}
        </>
      );
    case "intlim":
      return (
        <>
          {box}
          <line x1={cx - 12} y1={cy - 2} x2={cx + 12} y2={cy - 2} stroke={stroke} strokeWidth={1.4} />
          {txt(cx, cy - 12, "1", 13)}
          {txt(cx, cy + 9, "s", 13)}
          <path d={`M${cx + 18} ${cy + 17}H${cx + 30}M${cx + 18} ${cy - 17}H${cx + 30}M${cx + 24} ${cy - 17}V${cy + 17}`} stroke="#9fb1cc" strokeWidth={1.2} fill="none" />
        </>
      );
    case "sqrt":
      return (
        <>
          {box}
          <path d={`M${cx - 20} ${cy + 2}l5 -3 l6 14 l9 -26 h22`} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
          {txt(cx + 12, cy + 3, "u", 14)}
        </>
      );
    case "abs":
      return (
        <>
          {box}
          {txt(cx, cy, "|u|", 17)}
        </>
      );
    case "product": {
      const r = w / 2 - 1.5;
      return (
        <>
          <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          {txt(cx, cy + 1, str(params, "ops", "**").includes("/") ? "×÷" : "×", 17)}
        </>
      );
    }
    case "tank": {
      const hmax = num(params, "hmax", 2);
      const hv = fin(live?.h) ? live!.h : num(params, "h0", 1);
      const f = clamp(hv / hmax, 0, 1);
      const col = tempColor(fin(live?.Tw) ? live!.Tw : num(params, "T", 20));
      const top = 10,
        bot = h - 12,
        l = 14,
        r = w - 14;
      const y = bot - (bot - top) * f;
      const running = fin(live?.h);
      const dripping = running && fin(live?.qout) && live!.qout > 0.01;
      return (
        <>
          <defs>
            <clipPath id={`${uid}c`}>
              <rect x={l} y={top} width={r - l} height={bot - top} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}c)`}>
            <rect x={l} y={y} width={r - l} height={bot - y + 2} fill={col} opacity={0.62} />
            <g className={running ? "wave" : ""}>
              <path d={wavePath(l - 24, y, r - l + 48)} fill="none" stroke={col} strokeWidth={2.2} />
            </g>
          </g>
          <path d={`M${l} ${top}V${bot}H${r}V${top}`} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${r} ${bot - 6}h10`} stroke={stroke} strokeWidth={2} />
          {dripping && <circle className="drip" cx={r + 9} cy={bot - 4} r={2.4} fill={col} />}
          {txt(cx, clamp(y - 8, top + 8, bot - 8), `${Math.round(f * 100)}%`, 11, "middle", 700)}
        </>
      );
    }
    case "htank": {
      const T = fin(live?.T) ? live!.T : num(params, "T0", 25);
      const col = tempColor(T);
      const top = 10,
        bot = h - 12,
        l = 14,
        r = w - 14;
      const yw = top + 14;
      const running = fin(live?.T);
      return (
        <>
          <defs>
            <clipPath id={`${uid}c`}>
              <rect x={l} y={top} width={r - l} height={bot - top} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}c)`}>
            <rect x={l} y={yw} width={r - l} height={bot - yw} fill={col} opacity={0.62} />
            <g className={running ? "wave" : ""}>
              <path d={wavePath(l - 24, yw, r - l + 48)} fill="none" stroke={col} strokeWidth={2.2} />
            </g>
            {running && T > 85 && bubbles(l, r, bot, uid, 4)}
          </g>
          <path d={`M${l} ${top}V${bot}H${r}V${top}`} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${l + 10} ${bot - 8}q4 -8 8 0t8 0t8 0t8 0t8 0`} fill="none" stroke="#d6502a" strokeWidth={1.8} />
          {txt(cx, top + 30, `${fmt(Math.round(T * 10) / 10)} °C`, 12, "middle", 700)}
        </>
      );
    }
    case "boiler": {
      const hmax = num(params, "hmax", 1);
      const hv = fin(live?.h) ? live!.h : num(params, "h0", 0.4);
      const f = clamp(hv / hmax, 0, 1);
      const T = fin(live?.T) ? live!.T : num(params, "T0", 25);
      const col = tempColor(T);
      const top = 14,
        bot = h - 10,
        l = 12,
        r = w - 12;
      const y = bot - (bot - top - 26) * f;
      const running = fin(live?.T);
      const steaming = running && fin(live?.steam) && live!.steam > 0.0005;
      const shell = `M${l} ${top + 14}Q${l} ${top} ${cx} ${top}Q${r} ${top} ${r} ${top + 14}V${bot}H${l}Z`;
      return (
        <>
          <defs>
            <clipPath id={`${uid}c`}>
              <path d={shell} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}c)`}>
            <rect x={l} y={y} width={r - l} height={bot - y + 2} fill={col} opacity={0.62} />
            <g className={running ? "wave" : ""}>
              <path d={wavePath(l - 24, y, r - l + 48)} fill="none" stroke={col} strokeWidth={2.2} />
            </g>
            {running && T > 96 && bubbles(l, r, bot, uid, 5)}
          </g>
          <path d={shell} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${cx - 6} ${top}v-8M${cx + 4} ${top}v-8`} stroke="#8a9bb5" strokeWidth={2} strokeLinecap="round" />
          {steaming && [0, 1, 2].map((i) => <circle key={i} className="steam" cx={cx - 4 + i * 5} cy={top - 8} r={3 + i} fill="#c9d3e3" style={{ animationDelay: `${i * 0.6}s` }} />)}
          <path d={`M${l + 10} ${bot - 7}q4 -8 8 0t8 0t8 0t8 0t8 0`} fill="none" stroke="#d6502a" strokeWidth={1.8} />
          {txt(cx, top + 18, `${fmt(Math.round(T * 10) / 10)} °C`, 11, "middle", 700)}
        </>
      );
    }
    case "valve": {
      const my = cy + 4;
      const max = num(params, "max", 120);
      const f = fin(live?.out) ? clamp(live!.out / max, 0, 1) : clamp(num(params, "p0", 0) / 100, 0, 1);
      return (
        <>
          <path d={`M4 ${my - 14}L${cx} ${my}L4 ${my + 14}ZM${w - 4} ${my - 14}L${cx} ${my}L${w - 4} ${my + 14}Z`} fill={water} fillOpacity={0.15 + 0.8 * f} stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
          <path d={`M${cx} ${my}V${my - 18}`} stroke={stroke} strokeWidth={1.8} />
          <path d={`M${cx - 12} ${my - 18}Q${cx} ${my - 32} ${cx + 12} ${my - 18}Z`} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          {txt(cx, my + 24, `${Math.round(f * 100)}%`, 10.5, "middle", 700)}
        </>
      );
    }
    case "pump": {
      const max = num(params, "max", 150);
      const f = fin(live?.out) ? clamp(live!.out / max, 0, 1) : 0;
      const spin = fin(live?.out) && f > 0.002;
      const dur = (1.4 - 1.15 * f).toFixed(2);
      const py = cy + 2;
      return (
        <>
          <circle cx={cx} cy={py} r={22} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <path d={`M${cx} ${cy - 20}H${w - 6}M${cx - 16} ${cy + 18}L${cx} ${py}L${cx + 16} ${cy + 18}`} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
          {fin(live?.out) && (
            <g className={spin ? "spin" : ""} style={{ transformOrigin: `${cx}px ${py}px`, animationDuration: `${dur}s` }}>
              <path d={`M${cx - 13} ${py}H${cx + 13}M${cx} ${py - 13}V${py + 13}`} stroke="#2a6bd6" strokeWidth={2.2} strokeLinecap="round" />
              <circle cx={cx} cy={py} r={3} fill="#2a6bd6" />
            </g>
          )}
        </>
      );
    }
    case "heater": {
      const max = num(params, "max", 10);
      const f = fin(live?.out) ? clamp(live!.out / max, 0, 1) : 0;
      return (
        <>
          {box}
          {f > 0.01 && <rect x={3} y={3} width={w - 6} height={h - 6} rx={2} fill="#ff5a2a" opacity={0.12 + 0.4 * f} className="glow" />}
          <path d={`M10 ${cy + 8}H${w - 10}`} stroke="#9fb1cc" strokeWidth={1} />
          <path d={`M10 ${cy + 8}q5 -16 10 0t10 0t10 0t10 0t10 0`} fill="none" stroke={f > 0.01 ? "#ff3d10" : "#d6502a"} strokeWidth={2 + f} />
          {txt(cx, cy - 13, "kW", 11, "middle", 700)}
        </>
      );
    }
    case "stock":
      return (
        <>
          {box}
          <rect x={10} y={h - 22} width={18} height={14} fill="#e8c88a" stroke={stroke} strokeWidth={1.2} />
          <rect x={30} y={h - 22} width={18} height={14} fill="#e8c88a" stroke={stroke} strokeWidth={1.2} />
          <rect x={20} y={h - 36} width={18} height={14} fill="#e8c88a" stroke={stroke} strokeWidth={1.2} />
          {txt(w - 20, cy, "un", 12, "middle", 700)}
        </>
      );
    case "queue":
      return (
        <>
          {box}
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={16 + i * 14} cy={cy + 6} r={5} fill="#cfd9ea" stroke={stroke} strokeWidth={1.2} />
          ))}
          <path d={`M${w - 22} ${cy - 14}V${cy + 18}`} stroke={stroke} strokeWidth={2} />
          {txt(cx - 6, cy - 14, "fila", 11)}
        </>
      );
    case "cash":
      return (
        <>
          {box}
          <circle cx={cx} cy={cy} r={18} fill="#e9f3e2" stroke={stroke} strokeWidth={1.4} />
          {txt(cx, cy + 1, "R$", 14, "middle", 700)}
        </>
      );
    case "note": {
      const lines = wrapNote(str(params, "text", ""), 22);
      return (
        <>
          <path d={`M1 1H${w - 1}V${h - 14}L${w - 14} ${h - 1}H1Z`} fill="#fff4b8" stroke="#c9b45a" strokeWidth={1.2} />
          <path d={`M${w - 14} ${h - 1}V${h - 14}H${w - 1}`} fill="#eadb8a" stroke="#c9b45a" strokeWidth={1.2} />
          {lines.map((ln, i) => (
            <text key={i} x={10} y={20 + i * 16} fontSize={12.5} fill="#4a4320" fontFamily="system-ui,sans-serif">
              {ln}
            </text>
          ))}
        </>
      );
    }

    // ---------------------------------------------------------------- físicos
    case "mass":
    case "inertia": {
      const rot = symbol === "inertia";
      const v = rot ? num(params, "J", 0.01) : num(params, "m", 1);
      return (
        <>
          <path d={`M0 ${cy}H14M${w - 14} ${cy}H${w}`} stroke={MECH} strokeWidth={1.8} />
          {rot ? (
            <>
              <circle cx={cx} cy={cy} r={24} fill="#fff" stroke={stroke} strokeWidth={1.6} />
              <circle cx={cx} cy={cy} r={4} fill={stroke} />
              <path d={`M${cx - 15} ${cy - 15}A21 21 0 0 1 ${cx + 16} ${cy - 14}`} fill="none" stroke={ROT} strokeWidth={1.4} markerEnd="url(#arrow-n)" />
              {fin(live?.th) && <path d={`M${cx} ${cy}L${cx} ${cy - 22}`} stroke={ROT} strokeWidth={2.6} strokeLinecap="round" transform={`rotate(${(live!.th * 180) / Math.PI} ${cx} ${cy})`} />}
              {txt(cx, cy + 14, `J=${fmt(v)}`, 10.5)}
            </>
          ) : (
            <>
              <rect x={14} y={10} width={w - 28} height={h - 20} rx={2} fill="#fff" stroke={stroke} strokeWidth={1.6} />
              {txt(cx, cy - 6, "m", 15)}
              {txt(cx, cy + 10, `${fmt(v)} kg`, 10.5)}
            </>
          )}
        </>
      );
    }
    case "spring":
    case "tspring": {
      const rot = symbol === "tspring";
      const col = rot ? ROT : MECH;
      const x0 = 18,
        x1 = w - 18,
        n = 6;
      let d = `M0 ${cy}H${x0}`;
      for (let i = 0; i < n; i++) {
        const xa = x0 + ((i + 0.5) / n) * (x1 - x0);
        const xb = x0 + ((i + 1) / n) * (x1 - x0);
        d += ` L${xa} ${cy + (i % 2 ? 12 : -12)}`;
        if (i === n - 1) d += ` L${xb} ${cy}`;
      }
      d += `H${w}`;
      return (
        <>
          <path d={d} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" />
          {txt(cx, cy - 20, `k=${fmt(num(params, "k", 1))}`, 11)}
          {rot && <path d={`M${cx - 8} ${cy + 22}a9 9 0 1 1 16 0`} fill="none" stroke={ROT} strokeWidth={1.2} />}
        </>
      );
    }
    case "damper":
    case "tdamper": {
      const rot = symbol === "tdamper";
      const col = rot ? ROT : MECH;
      const c = rot ? num(params, "b", 1) : num(params, "c", 1);
      return (
        <>
          <path d={`M0 ${cy}H${cx - 8}M${cx - 8} ${cy - 12}V${cy + 12}M${cx - 8} ${cy - 12}H${cx + 22}M${cx - 8} ${cy + 12}H${cx + 22}M${cx + 6} ${cy}H${w}M${cx + 6} ${cy - 7}V${cy + 7}`} fill="none" stroke={col} strokeWidth={1.8} />
          {txt(cx, cy - 22, `${rot ? "b" : "c"}=${fmt(c)}`, 11)}
        </>
      );
    }
    case "force":
    case "torque": {
      const rot = symbol === "torque";
      const col = rot ? ROT : MECH;
      return (
        <>
          <path d={`M${w} ${cy}H${cx + 14}`} stroke={col} strokeWidth={1.8} />
          {rot ? (
            <>
              <path d={`M${cx - 4} ${cy - 14}A16 16 0 1 0 ${cx + 12} ${cy}`} fill="none" stroke={col} strokeWidth={2} markerEnd="url(#arrow-n)" />
              {txt(cx - 2, cy + 1, "τ", 14)}
            </>
          ) : (
            <>
              <path d={`M8 ${cy}H${cx + 12}`} stroke={col} strokeWidth={3} markerEnd="url(#arrow-n)" />
              {txt(cx - 6, cy + 16, "F", 14)}
            </>
          )}
        </>
      );
    }
    case "velsrc":
    case "speedsrc": {
      const col = symbol === "speedsrc" ? ROT : MECH;
      return (
        <>
          <path d={`M${w} ${cy}H${cx + 16}`} stroke={col} strokeWidth={1.8} />
          <circle cx={cx - 2} cy={cy} r={16} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          {txt(cx - 2, cy + 1, symbol === "speedsrc" ? "ω" : "v", 15)}
        </>
      );
    }
    case "wall": {
      const dot = (ln: number) => <path key={ln} d={`M${cx + 2} ${12 + ln * 9}l-8 8`} stroke={stroke} strokeWidth={1.2} />;
      return (
        <>
          <path d={`M0 ${cy}H${cx}M${cx} ${cy}H${w}`} stroke={MECH} strokeWidth={1.8} />
          <path d={`M${cx} 8V${h - 8}`} stroke={stroke} strokeWidth={2.4} />
          {[0, 1, 2, 3, 4, 5].map(dot)}
        </>
      );
    }
    case "rack":
      return (
        <>
          <path d={`M0 ${cy}H18`} stroke={ROT} strokeWidth={1.8} />
          <circle cx={36} cy={cy} r={16} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          <circle cx={36} cy={cy} r={3} fill={stroke} />
          <rect x={30} y={cy + 16} width={w - 30} height={8} fill="#fff" stroke={stroke} strokeWidth={1.4} />
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${34 + i * 11} ${cy + 16}v-3`} stroke={stroke} strokeWidth={1.4} />
          ))}
          <path d={`M${w - 12} ${cy + 20}H${w}`} stroke={MECH} strokeWidth={1.8} />
          {txt(cx + 14, cy - 16, `r=${fmt(num(params, "r", 0.05))}`, 10.5)}
        </>
      );
    case "gear": {
      const N = num(params, "N", 2);
      return (
        <>
          <path d={`M0 ${cy}H24M${w - 20} ${cy}H${w}`} stroke={ROT} strokeWidth={1.8} />
          <circle cx={38} cy={cy} r={16} fill="#fff" stroke={stroke} strokeWidth={1.6} strokeDasharray="3 2" />
          <circle cx={w - 36} cy={cy} r={Math.min(22, 12 + 3 * Math.log2(Math.max(1, N)))} fill="#fff" stroke={stroke} strokeWidth={1.6} strokeDasharray="3 2" />
          {txt(cx, h - 8, `${fmt(N)}:1`, 11, "middle", 700)}
        </>
      );
    }
    case "resistor": {
      const x0 = 18,
        x1 = w - 18,
        n = 6;
      let d = `M0 ${cy}H${x0}`;
      for (let i = 0; i < n; i++) {
        const xa = x0 + ((i + 0.5) / n) * (x1 - x0);
        d += ` L${xa} ${cy + (i % 2 ? 9 : -9)}`;
      }
      d += ` L${x1} ${cy}H${w}`;
      return (
        <>
          <path d={d} fill="none" stroke={ELEC} strokeWidth={1.8} strokeLinejoin="round" />
          {txt(cx, cy - 17, si(num(params, "R", 1), "Ω"), 11)}
        </>
      );
    }
    case "capacitor":
      return (
        <>
          <path d={`M0 ${cy}H${cx - 5}M${cx + 5} ${cy}H${w}`} stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${cx - 5} ${cy - 16}V${cy + 16}M${cx + 5} ${cy - 16}V${cy + 16}`} stroke={stroke} strokeWidth={2.4} />
          {txt(cx, cy - 22, si(num(params, "C", 1), "F"), 11)}
        </>
      );
    case "inductor": {
      const x0 = 18,
        x1 = w - 18,
        n = 4;
      const sw = (x1 - x0) / n;
      let d = `M0 ${cy}H${x0}`;
      for (let i = 0; i < n; i++) d += ` a${sw / 2} ${sw / 2} 0 0 1 ${sw} 0`;
      d += `H${w}`;
      return (
        <>
          <path d={d} fill="none" stroke={ELEC} strokeWidth={1.8} />
          {txt(cx, cy + 18, si(num(params, "L", 1), "H"), 11)}
        </>
      );
    }
    case "vsource":
    case "isource": {
      const volt = symbol === "vsource";
      return (
        <>
          <path d={`M${cx} 0V${cy - 18}M${cx} ${cy + 18}V${h}`} stroke={ELEC} strokeWidth={1.8} />
          <circle cx={cx} cy={cy} r={18} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          {volt ? (
            <>
              {txt(cx, cy - 7, "+", 13, "middle", 700)}
              {txt(cx, cy + 8, "−", 13, "middle", 700)}
            </>
          ) : (
            <path d={`M${cx} ${cy + 10}V${cy - 10}`} stroke={stroke} strokeWidth={2} markerEnd="url(#arrow-n)" />
          )}
        </>
      );
    }
    case "egnd":
      return (
        <>
          <path d={`M${cx} 0V16M${cx - 16} 16H${cx + 16}M${cx - 10} 24H${cx + 10}M${cx - 4} 32H${cx + 4}`} fill="none" stroke={stroke} strokeWidth={1.8} />
          <path d={`M${cx} 0V16`} stroke={ELEC} strokeWidth={1.8} />
        </>
      );
    case "voltmeter":
      return (
        <>
          <path d={`M0 ${cy}H${cx - 20}M${cx + 20} ${cy}H${w}`} stroke={ELEC} strokeWidth={1.8} />
          <circle cx={cx} cy={cy} r={20} fill="#fff" stroke={stroke} strokeWidth={1.6} />
          {txt(cx, cy + 1, "V", 16, "middle", 700)}
        </>
      );
    case "motor":
      return (
        <>
          <path d={`M0 14H${cx}V${cy - 28}M0 ${h - 14}H${cx}V${cy + 28}`} fill="none" stroke={ELEC} strokeWidth={1.8} />
          <path d={`M${cx + 28} ${cy}H${w}`} stroke={ROT} strokeWidth={2.4} />
          <circle cx={cx} cy={cy} r={28} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          {fin(live?.th) && <path d={`M${cx} ${cy}L${cx} ${cy - 25}`} stroke={ROT} strokeWidth={2.6} strokeLinecap="round" transform={`rotate(${(live!.th * 180) / Math.PI} ${cx} ${cy})`} />}
          {txt(cx, cy, "M", 22, "middle", 600)}
          {txt(10, 25, "+", 12, "middle", 700)}
          {txt(10, h - 25, "−", 12, "middle", 700)}
        </>
      );
    default: {
      const art = semiArt(symbol, params, w, h, live);
      if (art) return <>{art}</>;
      return (
        <>
          {box}
          {txt(cx, cy, "?", 16)}
        </>
      );
    }
  }
}
