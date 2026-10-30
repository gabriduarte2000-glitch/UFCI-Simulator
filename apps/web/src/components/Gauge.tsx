import { useRef } from "react";
import { PALETTE, fmtNum } from "../util";

/** Instrumento virtual: arco proporcional ao maior valor observado. */
export function Gauge({ label, value, unit, color, resetKey }: { label: string; value: number | undefined; unit?: string; color: number; resetKey: number }) {
  const max = useRef({ m: 0, k: resetKey });
  if (max.current.k !== resetKey) max.current = { m: 0, k: resetKey };
  if (value !== undefined && Number.isFinite(value)) max.current.m = Math.max(max.current.m, Math.abs(value));
  const m = max.current.m || 1;
  const frac = value !== undefined && Number.isFinite(value) ? Math.min(1, Math.abs(value) / m) : 0;
  const R = 30,
    C = 2 * Math.PI * R;
  const arc = C * 0.75;
  return (
    <div className="gauge" title={`${label}: o arco mostra o valor em relação ao maior valor visto (${fmtNum(m, 3)})`}>
      <div className="gauge-title">{label}</div>
      <svg viewBox="0 0 80 80" width="78" height="78" role="img" aria-label={`${label}: ${fmtNum(value)}`}>
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(143,163,194,0.2)" strokeWidth="7" strokeDasharray={`${arc} ${C}`} transform="rotate(135 40 40)" strokeLinecap="round" />
        <circle cx="40" cy="40" r={R} fill="none" stroke={PALETTE[color % PALETTE.length]} strokeWidth="7" strokeDasharray={`${arc * frac} ${C}`} transform="rotate(135 40 40)" strokeLinecap="round" />
        <text x="40" y="41" textAnchor="middle" fontSize="13" fontWeight="600" fill="#e6edf9">
          {fmtNum(value, 3)}
        </text>
        {unit && (
          <text x="40" y="55" textAnchor="middle" fontSize="8.5" fill="#8fa3c2">
            {unit}
          </text>
        )}
      </svg>
    </div>
  );
}
