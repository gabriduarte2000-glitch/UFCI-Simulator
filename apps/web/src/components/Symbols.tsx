// Símbolos dos blocos, no estilo dos livros de controle (D'Azzo, Ogata): caixas com a função
// de transferência, círculo somador, triângulo de ganho.

import type { ParamValue } from "@ufci/engine";

type Params = Record<string, ParamValue>;
const num = (p: Params, k: string, d = 0) => {
  const v = p[k]?.value;
  return typeof v === "number" ? v : d;
};
const str = (p: Params, k: string, d = "") => {
  const v = p[k]?.value;
  return v === undefined ? d : String(v);
};

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (n: number) => [...String(n)].map((c) => SUP[+c] ?? c).join("");
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
    default:
      return { w: 92, h: 56 };
  }
}

const stroke = "#1b2a41";

export function SymbolArt({ symbol, params, w, h }: { symbol: string; params: Params; w: number; h: number }) {
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
    default:
      return (
        <>
          {box}
          {txt(cx, cy, "?", 16)}
        </>
      );
  }
}
