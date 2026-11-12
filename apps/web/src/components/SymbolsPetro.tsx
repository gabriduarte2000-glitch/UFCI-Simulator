// Símbolos dos equipamentos de petroquímica e refino, animados com os valores da simulação.
import type { ReactNode } from "react";
import type { ParamValue } from "@ufci/engine";

type Params = Record<string, ParamValue>;
type Live = Record<string, number>;
const stroke = "#1b2a41";
const num = (p: Params, k: string, d = 0) => (typeof p[k]?.value === "number" ? (p[k].value as number) : d);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fin = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const txt = (x: number, y: number, s: string, size = 10, anchor: "start" | "middle" | "end" = "middle", weight = 500) => (
  <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill={stroke} fontFamily="system-ui, sans-serif">
    {s}
  </text>
);
/** Azul frio a vermelho quente, de 20 a 400 °C. */
const tempColor = (T: number) => `hsl(${Math.round(215 - 215 * clamp((T - 20) / 380, 0, 1))} 80% 62%)`;
/** Leve (azul claro) a pesado (âmbar), pela fração do leve. */
const compColor = (x: number) => `hsl(${Math.round(35 + 175 * clamp(x, 0, 1))} 75% ${Math.round(58 + 10 * clamp(x, 0, 1))}%)`;
const fmt = (v: number | undefined, d = 1, u = "") => (fin(v) ? v.toFixed(d).replace(".", ",") + u : "");

export const LIVE_PETRO: Record<string, string[]> = {
  cstr: ["T", "CA", "X"],
  hx: ["Tho", "Tco", "Q"],
  column: ["xD", "xB", "Tt", "Tb", ...Array.from({ length: 12 }, (_, i) => `x${i + 1}`)],
  furnace: ["Ts", "Tw", "fire"],
  sphere: ["P", "psv", "open"],
};

export function petroSize(symbol: string, p: Params): { w: number; h: number } | null {
  switch (symbol) {
    case "cstr":
      return { w: 130, h: 150 };
    case "hx":
      return { w: 190, h: 100 };
    case "column": {
      const n = Math.round(num(p, "N", 10));
      return { w: 96, h: Math.max(300, (10 + n) * 17 + 24) };
    }
    case "furnace":
      return { w: 150, h: 160 };
    case "sphere":
      return { w: 130, h: 140 };
  }
  return null;
}

export function petroArt(symbol: string, p: Params, w: number, h: number, live: Live | undefined): ReactNode | null {
  const on = !!live && Object.values(live).some(fin);
  switch (symbol) {
    case "cstr": {
      const T = live?.T,
        X = live?.X;
      const col = fin(T) ? tempColor(T) : "#cfe3f5";
      const hot = fin(T) && T > 120;
      return (
        <>
          <rect x={20} y={14} width={w - 40} height={h - 56} rx={26} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <rect x={26} y={h * 0.38} width={w - 52} height={h - 56 - (h * 0.38 - 14) - 6} rx={20} fill={col} opacity={0.85} />
          <rect x={14} y={30} width={6} height={h - 90} fill={fin(live?.T) ? "#9ec9ee" : "#e5eef7"} stroke={stroke} strokeWidth={1} />
          <rect x={w - 20} y={30} width={6} height={h - 90} fill="#9ec9ee" stroke={stroke} strokeWidth={1} />
          <line x1={w / 2} y1={4} x2={w / 2} y2={h * 0.62} stroke={stroke} strokeWidth={2} />
          <g className={on ? "spin-slow" : undefined} style={{ transformOrigin: `${w / 2}px ${h * 0.6}px` }}>
            <line x1={w / 2 - 20} y1={h * 0.6} x2={w / 2 + 20} y2={h * 0.6} stroke={stroke} strokeWidth={3} />
          </g>
          {on && [0, 1, 2].map((i) => <circle key={i} className="bubble" cx={36 + i * 28} cy={h - 70} r={3} fill="#fff" style={{ animationDelay: `${i * 0.45}s` }} />)}
          {hot && <path d={`M${w / 2 - 12} 14q6-14 12 0q6-14 12 0`} fill="none" stroke="#e5342b" strokeWidth={2.5} className="steam" />}
          {txt(w / 2, h - 36, fin(T) ? `${fmt(T, 1)} °C` : "CSTR", 12, "middle", 700)}
          {fin(X) && txt(w / 2, h - 22, `conversão ${fmt(X, 0, " %")}`, 10)}
        </>
      );
    }
    case "hx": {
      const th = live?.Tho,
        tc = live?.Tco;
      return (
        <>
          <rect x={26} y={18} width={w - 52} height={h - 40} rx={8} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <path d={`M26 ${h / 2 - 14}H${w - 26}M26 ${h / 2 + 14}H${w - 26}`} stroke={stroke} strokeWidth={0.8} opacity={0.4} />
          <rect x={30} y={h / 2 - 8} width={w - 60} height={16} fill={fin(th) ? tempColor(th) : "#f3b3a8"} stroke={stroke} strokeWidth={1} />
          <rect x={30} y={22} width={w - 60} height={14} fill={fin(tc) ? tempColor(tc) : "#cfe3f5"} opacity={0.8} />
          <rect x={30} y={h - 38} width={w - 60} height={14} fill={fin(tc) ? tempColor(tc) : "#cfe3f5"} opacity={0.8} />
          {on && [0, 1, 2, 3].map((i) => <circle key={i} className="flow-dot" cx={40 + i * 30} cy={h / 2} r={2.5} fill="#fff" style={{ animationDelay: `${i * 0.4}s` }} />)}
          {txt(w / 2, 12, "casco (frio)", 9)}
          {txt(w / 2, h - 4, "tubos (quente)", 9)}
          {fin(th) && txt(w - 4, h / 2 - 12, `${fmt(th, 0)}°`, 10, "end", 700)}
          {fin(tc) && txt(w - 4, 30, `${fmt(tc, 0)}°`, 10, "end", 700)}
        </>
      );
    }
    case "column": {
      const n = Math.round(num(p, "N", 10));
      const nf = clamp(Math.round(num(p, "NF", 5)), 1, n);
      const top = 28,
        bot = h - 46,
        step = (bot - top) / n;
      const x1 = 22,
        x2 = w - 22;
      return (
        <>
          <rect x={x1} y={14} width={x2 - x1} height={h - 34} rx={18} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          {Array.from({ length: n }, (_, i) => {
            const y = top + (i + 0.5) * step;
            const xv = live?.[`x${i + 1}`];
            return (
              <g key={i}>
                <rect x={x1 + 3} y={y - 4} width={x2 - x1 - 6} height={8} fill={fin(xv) ? compColor(xv) : "#e8edf2"} opacity={0.9} />
                <line x1={x1} y1={y + 4} x2={x2} y2={y + 4} stroke={stroke} strokeWidth={1.2} />
                {on && i % 2 === 0 && <circle className="bubble" cx={x1 + 12 + ((i * 17) % (x2 - x1 - 24))} cy={y + 2} r={2} fill="#fff" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />}
              </g>
            );
          })}
          <path d={`M${x1 - 8} ${top + (nf - 0.5) * step}H${x1}`} stroke={stroke} strokeWidth={2} markerEnd="" />
          {txt(x1 - 10, top + (nf - 0.5) * step - 4, "F", 9, "end", 700)}
          <rect x={x1 + 8} y={h - 26} width={x2 - x1 - 16} height={12} rx={5} fill={fin(live?.xB) ? compColor(live!.xB) : "#e8edf2"} stroke={stroke} strokeWidth={1} />
          {txt(w / 2, 10, fin(live?.xD) ? `topo ${fmt(live!.xD * 100, 1, " %")}` : "topo", 9, "middle", 700)}
          {txt(w / 2, h - 2, fin(live?.xB) ? `fundo ${fmt(live!.xB * 100, 1, " %")}` : "fundo", 9, "middle", 700)}
        </>
      );
    }
    case "furnace": {
      const fire = live?.fire,
        Ts = live?.Ts;
      const f = fin(fire) ? clamp(fire / Math.max(num(p, "Qmax", 3000), 1), 0, 1) : 0;
      return (
        <>
          <path d={`M24 ${h - 14}V50L${w / 2} 14L${w - 24} 50V${h - 14}Z`} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <rect x={w / 2 - 10} y={2} width={20} height={14} fill="#fff" stroke={stroke} strokeWidth={1.5} />
          <path d={`M40 60q15-8 30 0t30 0t30 0`} fill="none" stroke={fin(Ts) ? tempColor(Ts) : "#9ec9ee"} strokeWidth={5} />
          <path d={`M40 78q15-8 30 0t30 0t30 0`} fill="none" stroke={fin(Ts) ? tempColor(Ts) : "#9ec9ee"} strokeWidth={5} />
          {f > 0.02 &&
            [0, 1, 2].map((i) => (
              <path key={i} className="flame" d={`M${w / 2 - 28 + i * 28} ${h - 14}q-9-${14 + 30 * f} 0-${22 + 40 * f}q9 ${8 + 12 * f} 0 ${22 + 40 * f}z`} fill={`hsl(${20 + 25 * f} 95% 55%)`} style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          {txt(w / 2, 108, fin(Ts) ? `saída ${fmt(Ts, 0, " °C")}` : "forno", 10, "middle", 700)}
          {fin(fire) && txt(w / 2, 122, `chama ${fmt(fire, 0, " kW")}`, 9)}
        </>
      );
    }
    case "sphere": {
      const P = live?.P,
        psv = live?.psv;
      const Pset = num(p, "Pset", 10);
      const ratio = fin(P) ? clamp(P / Pset, 0, 1.1) : 0;
      const col = ratio > 0.95 ? "#e5342b" : ratio > 0.75 ? "#f2b705" : "#2fb344";
      const relieving = fin(psv) && psv > 1;
      return (
        <>
          <circle cx={w / 2} cy={h / 2 + 6} r={42} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <path d={`M${w / 2 - 42} ${h / 2 + 6}A42 42 0 0 0 ${w / 2 + 42} ${h / 2 + 6}`} fill={col} opacity={0.25} />
          {[-26, 0, 26].map((x) => (
            <line key={x} x1={w / 2 + x * 0.8} y1={h / 2 + 46} x2={w / 2 + x * 1.2} y2={h - 6} stroke={stroke} strokeWidth={2.5} />
          ))}
          <line x1={w / 2} y1={h / 2 - 36} x2={w / 2} y2={22} stroke={stroke} strokeWidth={2} />
          <path d={`M${w / 2 - 8} 22l8-12l8 12z`} fill={relieving ? "#e5342b" : "#fff"} stroke={stroke} strokeWidth={1.5} />
          {relieving && <path className="flame" d={`M${w / 2 - 6} 8q6-14 12 0q-6 6-12 0z`} fill="#f97316" />}
          {txt(w / 2, h / 2 + 4, fin(P) ? fmt(P, 1, " bar") : "GLP", 12, "middle", 700)}
          {txt(w / 2, h / 2 + 20, `PSV ${fmt(Pset, 0)} bar`, 9)}
        </>
      );
    }
  }
  return null;
}
