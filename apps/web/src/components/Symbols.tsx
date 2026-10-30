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
    case "tank":
    case "htank":
      return { w: 96, h: 96 };
    case "boiler":
      return { w: 104, h: 104 };
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
    case "note": {
      const t = str(p, "text", "");
      const lines = wrapNote(t, 22);
      return { w: 184, h: Math.max(56, 26 + lines.length * 16) };
    }
    default:
      return { w: 92, h: 56 };
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
      const lvl = 0.55;
      const top = 10,
        bot = h - 12,
        l = 14,
        r = w - 14;
      const y = bot - (bot - top) * lvl;
      return (
        <>
          <rect x={l} y={y} width={r - l} height={bot - y} fill={water} opacity={0.55} />
          <path d={`M${l} ${top}V${bot}H${r}V${top}`} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${l + 4} ${y}q6 -3 12 0t12 0t12 0t12 0`} fill="none" stroke="#2a6bd6" strokeWidth={1.2} />
          <path d={`M${r} ${bot - 6}h10`} stroke={stroke} strokeWidth={2} />
        </>
      );
    }
    case "htank": {
      const top = 10,
        bot = h - 12,
        l = 14,
        r = w - 14;
      return (
        <>
          <rect x={l} y={top + 14} width={r - l} height={bot - top - 14} fill={water} opacity={0.5} />
          <path d={`M${l} ${top}V${bot}H${r}V${top}`} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${l + 10} ${bot - 10}h${r - l - 20}M${l + 10} ${bot - 10}q4 -8 8 0t8 0t8 0t8 0t8 0`} fill="none" stroke="#d6502a" strokeWidth={1.8} />
          {txt(cx, top + 30, "°C", 13, "middle", 700)}
        </>
      );
    }
    case "boiler": {
      const top = 14,
        bot = h - 10,
        l = 12,
        r = w - 12;
      return (
        <>
          <rect x={l} y={top + 34} width={r - l} height={bot - top - 34} fill={water} opacity={0.5} />
          <path d={`M${l} ${top + 14}Q${l} ${top} ${cx} ${top}Q${r} ${top} ${r} ${top + 14}V${bot}H${l}Z`} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${cx - 6} ${top}v-8M${cx + 4} ${top}v-8`} stroke="#8a9bb5" strokeWidth={2} strokeLinecap="round" />
          <path d={`M${l + 10} ${bot - 9}h${r - l - 20}M${l + 10} ${bot - 9}q4 -8 8 0t8 0t8 0t8 0t8 0`} fill="none" stroke="#d6502a" strokeWidth={1.8} />
          {txt(cx, top + 22, "vapor", 11)}
        </>
      );
    }
    case "valve": {
      const my = cy + 4;
      return (
        <>
          <path d={`M4 ${my - 14}L${cx} ${my}L4 ${my + 14}ZM${w - 4} ${my - 14}L${cx} ${my}L${w - 4} ${my + 14}Z`} fill="#fff" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
          <path d={`M${cx} ${my}V${my - 18}`} stroke={stroke} strokeWidth={1.8} />
          <path d={`M${cx - 12} ${my - 18}Q${cx} ${my - 32} ${cx + 12} ${my - 18}Z`} fill="#fff" stroke={stroke} strokeWidth={1.8} />
        </>
      );
    }
    case "pump":
      return (
        <>
          <circle cx={cx} cy={cy + 2} r={22} fill="#fff" stroke={stroke} strokeWidth={1.8} />
          <path d={`M${cx} ${cy - 20}H${w - 6}M${cx - 16} ${cy + 18}L${cx} ${cy + 2}L${cx + 16} ${cy + 18}`} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      );
    case "heater":
      return (
        <>
          {box}
          <path d={`M10 ${cy + 8}H${w - 10}`} stroke="#9fb1cc" strokeWidth={1} />
          <path d={`M10 ${cy + 8}q5 -16 10 0t10 0t10 0t10 0t10 0`} fill="none" stroke="#d6502a" strokeWidth={2} />
          {txt(cx, cy - 13, "kW", 11, "middle", 700)}
        </>
      );
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
    default:
      return (
        <>
          {box}
          {txt(cx, cy, "?", 16)}
        </>
      );
  }
}
