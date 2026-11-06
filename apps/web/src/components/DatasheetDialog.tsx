// Datasheet resumido de um CI: pinagem, circuito interno, tabelas, especificações, notas e o que o simulador modela.

import { useEffect, useRef } from "react";
import { getDatasheet, overbar, type Datasheet, type ICItem, type ICPin, type ICScene } from "@ufci/engine";
import { useUi } from "../ui";
import { Icon } from "./Icon";

const INK = "#16233b";
const DIR: Record<ICPin["dir"], { c: string; t: string }> = {
  in: { c: "#1f63c9", t: "entrada" },
  out: { c: "#168a4a", t: "saída" },
  pwr: { c: "#c2410c", t: "alimentação" },
  nc: { c: "#7b8699", t: "sem conexão" },
};

/** Corpo de uma porta lógica com o centro de saída em (x + 40, y). */
function Gate({ it }: { it: Extract<ICItem, { k: "gate" }> }) {
  const { x, y, g } = it;
  const n = it.n ?? 2;
  const hh = n <= 2 ? 14 : n === 3 ? 18 : 22;
  const bubble = g === "nand" || g === "nor" || g === "xnor" || g === "not";
  let body: string;
  if (g === "not" || g === "buf") body = `M${x} ${y - 12}L${x + 40} ${y}L${x} ${y + 12}Z`;
  else if (g === "and" || g === "nand") body = `M${x} ${y - hh}H${x + 20}A20 ${hh} 0 0 1 ${x + 20} ${y + hh}H${x}Z`;
  else body = `M${x} ${y - hh}Q${x + 24} ${y - hh} ${x + 40} ${y}Q${x + 24} ${y + hh} ${x} ${y + hh}Q${x + 10} ${y} ${x} ${y - hh}Z`;
  const label = g === "and" || g === "nand" ? "&" : g === "or" || g === "nor" ? "≥1" : g === "xor" || g === "xnor" ? "=1" : "";
  return (
    <g>
      <path d={body} fill="#fff" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      {(g === "xor" || g === "xnor") && <path d={`M${x - 6} ${y - hh}Q${x + 4} ${y} ${x - 6} ${y + hh}`} fill="none" stroke={INK} strokeWidth={1.5} />}
      {label && (
        <text x={x + 19} y={y + 4} fontSize={11} textAnchor="middle" fill={INK} fontWeight={600}>
          {label}
        </text>
      )}
      {bubble && <circle cx={x + 43} cy={y} r={3} fill="#fff" stroke={INK} strokeWidth={1.4} />}
    </g>
  );
}

function PinText({ x, y, name }: { x: number; y: number; name: string }) {
  const bar = name.startsWith("!");
  const text = bar ? name.slice(1) : name;
  return (
    <text x={x} y={y} fontSize={11} fill={INK} fontWeight={600} textAnchor="middle" dominantBaseline="middle" textDecoration={bar ? "overline" : undefined} style={bar ? { textDecoration: "overline" } : undefined}>
      {text}
    </text>
  );
}

export function SceneSvg({ scene }: { scene: ICScene }) {
  return (
    <svg viewBox={`0 0 ${scene.w} ${scene.h}`} width={scene.w} height={scene.h} className="ds-scene" role="img" aria-label="Circuito interno">
      {scene.items.map((it, i) => {
        switch (it.k) {
          case "gate":
            return <Gate key={i} it={it} />;
          case "wire":
            return <polyline key={i} points={it.p.map((q) => q.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />;
          case "dot":
            return <circle key={i} cx={it.x} cy={it.y} r={2.6} fill={INK} />;
          case "text":
            return (
              <text key={i} x={it.x} y={it.y} fontSize={it.size ?? 10} textAnchor={it.a ?? "middle"} fill={it.color ?? INK} fontWeight={it.bold ? 700 : 400}>
                {it.t}
              </text>
            );
          case "box":
            return (
              <g key={i}>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={3} fill={it.fill ?? "#fff"} stroke={INK} strokeWidth={1.5} strokeDasharray={it.dash ? "5 3" : undefined} />
                <text x={it.x + it.w / 2} y={it.y + it.h / 2 - (it.s ? 5 : -4)} fontSize={12} fontWeight={700} textAnchor="middle" fill={INK}>
                  {it.t}
                </text>
                {it.s && (
                  <text x={it.x + it.w / 2} y={it.y + it.h / 2 + 11} fontSize={10} textAnchor="middle" fill="#4a5a78">
                    {it.s}
                  </text>
                )}
                {it.clk?.map((cy, j) => (
                  <path key={j} d={`M${it.x} ${cy - 6}L${it.x + 9} ${cy}L${it.x} ${cy + 6}`} fill="none" stroke={INK} strokeWidth={1.4} />
                ))}
              </g>
            );
          case "pin": {
            const l = it.side === "l",
              r = it.side === "r";
            const tx = l ? it.x - 6 : r ? it.x + 6 : it.x;
            const ty = it.side === "t" ? it.y - 8 : it.side === "b" ? it.y + 12 : it.y;
            const bar = it.name.startsWith("!");
            return (
              <g key={i}>
                <circle cx={it.x} cy={it.y} r={2.2} fill="none" stroke={INK} strokeWidth={1} />
                <text x={tx} y={ty - (l || r ? 6 : 0)} fontSize={9} textAnchor={l ? "end" : r ? "start" : "middle"} fill="#4a5a78">
                  {it.num}
                </text>
                <text x={tx} y={ty + (l || r ? 5 : 0)} fontSize={11} fontWeight={700} textAnchor={l ? "end" : r ? "start" : "middle"} fill={INK} style={bar ? { textDecoration: "overline" } : undefined}>
                  {bar ? it.name.slice(1) : it.name}
                </text>
              </g>
            );
          }
        }
      })}
    </svg>
  );
}

/** Vista de cima do encapsulamento DIP, com o entalhe para cima e o pino 1 no canto superior esquerdo. */
export function DipSvg({ ds }: { ds: Datasheet }) {
  const n = ds.pins.length;
  const half = n / 2;
  const rowH = 26;
  const H = half * rowH + 30;
  const W = 250;
  const byN = new Map(ds.pins.map((p) => [p.n, p]));
  const pinBox = (num: number, left: boolean, y: number) => {
    const p = byN.get(num);
    const col = p ? DIR[p.dir].c : DIR.nc.c;
    return (
      <g key={num}>
        <rect x={left ? 38 : W - 62} y={y - 7} width={24} height={14} fill="#dfe6f2" stroke={INK} strokeWidth={1} />
        <text x={left ? 24 : W - 24} y={y} fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={col}>
          {num}
        </text>
        <g transform={`translate(${left ? 90 : W - 90}, ${y})`}>
          <g style={{ fontSize: 11 }}>
            <text fontSize={11} fontWeight={700} textAnchor={left ? "start" : "end"} dominantBaseline="middle" fill={col} style={p?.name.startsWith("!") ? { textDecoration: "overline" } : undefined}>
              {p ? (p.name.startsWith("!") ? p.name.slice(1) : p.name) : ""}
            </text>
          </g>
        </g>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ds-dip" role="img" aria-label={`Pinagem do ${ds.part}`}>
      <rect x={62} y={8} width={W - 124} height={H - 16} rx={4} fill="#f4f7fc" stroke={INK} strokeWidth={1.6} />
      <path d={`M${W / 2 - 9} 8a9 9 0 0018 0`} fill="none" stroke={INK} strokeWidth={1.4} />
      <text x={W / 2} y={H / 2} fontSize={13} fontWeight={800} fill={INK} textAnchor="middle" transform={`rotate(-90 ${W / 2} ${H / 2})`}>
        {ds.part}
      </text>
      {Array.from({ length: half }, (_, i) => pinBox(i + 1, true, 30 + i * rowH))}
      {Array.from({ length: half }, (_, i) => pinBox(n - i, false, 30 + i * rowH))}
    </svg>
  );
}

export function DatasheetDialog() {
  const part = useUi((s) => s.datasheet);
  const close = () => useUi.getState().setDatasheet(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!part) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [part]);
  if (!part) return null;
  const ds = getDatasheet(part);
  if (!ds) return null;
  return (
    <div className="ds-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="ds-dialog" role="dialog" aria-modal="true" aria-label={`Datasheet do ${ds.part}`} tabIndex={-1} ref={ref}>
        <header className="ds-head">
          <div>
            <h2>{ds.part}</h2>
            <div className="ds-sub">{ds.title}</div>
            <div className="ds-chips">
              <span>{ds.family}</span>
              <span>{ds.pkg}</span>
              <span>{ds.alt}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Fechar o datasheet" title="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="ds-body">
          <p className="ds-desc">{ds.description}</p>

          <section>
            <h3>Pinagem</h3>
            <div className="ds-pins">
              <DipSvg ds={ds} />
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Pino</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Função</th>
                  </tr>
                </thead>
                <tbody>
                  {ds.pins.map((p) => (
                    <tr key={p.n}>
                      <td>{p.n}</td>
                      <td style={{ color: DIR[p.dir].c, fontWeight: 700 }}>{overbar(p.name)}</td>
                      <td>{DIR[p.dir].t}</td>
                      <td>{p.fn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {ds.diagram && (
            <section>
              <h3>{ds.diagramTitle}</h3>
              <div className="ds-diagram">
                <SceneSvg scene={ds.diagram} />
              </div>
            </section>
          )}

          {ds.tables.map((t) => (
            <section key={t.title}>
              <h3>{t.title}</h3>
              <div className="ds-scroll">
                <table className="ds-table ds-fn">
                  <thead>
                    <tr>
                      {t.head.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.note && <p className="ds-note">{t.note}</p>}
            </section>
          ))}

          <section>
            <h3>Especificações</h3>
            <table className="ds-table ds-specs">
              <tbody>
                {ds.specs.map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3>Como usar</h3>
            <ul>
              {ds.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Aplicações</h3>
            <ul>
              {ds.apps.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>No simulador</h3>
            <ul>
              {ds.model.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
          <p className="ds-foot">Valores típicos de catálogo. Confira o datasheet do fabricante antes de montar o circuito.</p>
        </div>
      </div>
    </div>
  );
}
