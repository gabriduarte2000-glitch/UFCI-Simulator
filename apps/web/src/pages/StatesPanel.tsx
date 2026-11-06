// Lê a máquina de estados do circuito montado no quadro: tabela de estados, saídas e diagrama.

import { useEffect, useMemo, useState } from "react";
import { readStateMachine, type FsmRead } from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";

function Diagram({ f }: { f: FsmRead }) {
  const nodes = f.states.filter((s) => s.reachable);
  const n = nodes.length;
  const R = n <= 1 ? 0 : 105;
  const cx = 190;
  const cy = 150;
  const pos = new Map(nodes.map((s, i) => [s.state, { x: cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }]));
  const r = 22;
  return (
    <svg className="fsm-svg" viewBox="0 -40 380 350" role="img" aria-label="Diagrama de estados">
      <defs>
        <marker id="fsm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      {f.edges.map((e, i) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        if (e.from === e.to) {
          const dx = a.x - cx || 0;
          const dy = a.y - cy || -1;
          const L = Math.hypot(dx, dy) || 1;
          const ux = dx / L;
          const uy = dy / L;
          const sx = a.x + ux * r;
          const sy = a.y + uy * r;
          const px = -uy;
          const py = ux;
          const d = `M${sx - px * 8},${sy - py * 8} C${sx + ux * 36 - px * 22},${sy + uy * 36 - py * 22} ${sx + ux * 36 + px * 22},${sy + uy * 36 + py * 22} ${sx + px * 8},${sy + py * 8}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} markerEnd="url(#fsm-arrow)" />
              {e.label && (
                <text x={sx + ux * 46} y={sy + uy * 46 + 3} textAnchor="middle" className="fsm-lbl">
                  {e.label}
                </text>
              )}
            </g>
          );
        }
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1;
        const qx = mx - (dy / L) * 22;
        const qy = my + (dx / L) * 22;
        const ang1 = Math.atan2(qy - a.y, qx - a.x);
        const ang2 = Math.atan2(qy - b.y, qx - b.x);
        const x1 = a.x + Math.cos(ang1) * r;
        const y1 = a.y + Math.sin(ang1) * r;
        const x2 = b.x + Math.cos(ang2) * (r + 3);
        const y2 = b.y + Math.sin(ang2) * (r + 3);
        const lx = 0.25 * x1 + 0.5 * qx + 0.25 * x2;
        const ly = 0.25 * y1 + 0.5 * qy + 0.25 * y2;
        return (
          <g key={i}>
            <path d={`M${x1},${y1} Q${qx},${qy} ${x2},${y2}`} fill="none" stroke="currentColor" strokeWidth={1.5} markerEnd="url(#fsm-arrow)" />
            {e.label && (
              <text x={lx} y={ly - 3} textAnchor="middle" className="fsm-lbl">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((s) => {
        const p = pos.get(s.state)!;
        return (
          <g key={s.state}>
            <circle cx={p.x} cy={p.y} r={r} className={`fsm-node ${s.state === f.init ? "init" : ""}`} />
            {s.state === f.init && <circle cx={p.x} cy={p.y} r={r - 4} className="fsm-node-in" />}
            <text x={p.x} y={p.y - 1} textAnchor="middle" className="fsm-name">
              S{s.state}
            </text>
            <text x={p.x} y={p.y + 11} textAnchor="middle" className="fsm-code">
              {s.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function StatesPanel({ active }: { active: boolean }) {
  const project = useProject((s) => s.project);
  const [n, setN] = useState(0);
  const f = useMemo(() => readStateMachine(project), [project, n]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (active) setN((x) => x + 1);
  }, [active]);

  if (!f.ok)
    return (
      <div className="logic">
        <section className="card logic-step">
          <p className="math-lead">Lê os flip-flops do quadro e mostra a tabela de estados, as saídas e o diagrama.</p>
          <p className="math-error">{f.error}</p>
        </section>
      </div>
    );

  const nIn = f.inputs.length;
  const combos = 1 << nIn;
  const inCombo = (c: number) => (nIn ? c.toString(2).padStart(nIn, "0") : "");
  const rows = f.states.filter((s) => showAll || s.reachable);
  const unreach = f.states.filter((s) => !s.reachable).length;
  const outs = f.outputs;

  const reuse = () => {
    if (!f.spec) return;
    useUi.getState().setSeqImport(f.spec);
    useUi.getState().setMathTab("sequencial");
  };

  return (
    <div className="logic">
      <p className="math-lead">Esta é a máquina de estados do circuito do quadro, lida dos flip-flops e das portas.</p>

      <section className="card logic-step">
        <h3>
          <span className="step-n">1</span> O que foi lido
        </h3>
        <div className="table-scroll math-table">
          <table className="tt legend">
            <thead>
              <tr>
                <th>Letra</th>
                <th>Elemento</th>
                <th>Papel</th>
              </tr>
            </thead>
            <tbody>
              {f.bits.map((b, i) => (
                <tr key={b.name}>
                  <td>
                    <b>{b.name}</b>
                  </td>
                  <td className="left">{b.label}</td>
                  <td className="left">bit de estado {i === 0 ? "(mais pesado)" : ""}</td>
                </tr>
              ))}
              {f.inputs.map((x) => (
                <tr key={x.name}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td className="left">{x.label}</td>
                  <td className="left">entrada (chave)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="math-note">
          {f.nBits} flip-flop{f.nBits > 1 ? "s" : ""} ({f.ffKind === "misto" ? "tipos misturados" : f.ffKind}) dão até {1 << f.nBits} estados. Estado inicial: S{f.init} (código {f.initCode}).
        </p>
        <h4 className="logic-h4">Entradas dos flip-flops, como foram desenhadas</h4>
        <ul className="fsm-eqs">
          {f.excitation.map((e) => (
            <li key={e.label}>
              <b>{e.label}</b> <span className="logic-mono">= {e.structure}</span>
            </li>
          ))}
        </ul>
        {f.warnings.map((w) => (
          <p key={w} className="math-note">
            {w}
          </p>
        ))}
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">2</span> Tabela de estados
        </h3>
        <p className="math-note">
          Para cada estado, o próximo estado em cada combinação das entradas. Nas linhas de saída, o valor do LED.
          {unreach > 0 ? ` ${unreach} código${unreach > 1 ? "s" : ""} nunca ${unreach > 1 ? "são alcançados" : "é alcançado"} a partir de S${f.init}.` : ""}
        </p>
        {unreach > 0 && (
          <label className="check dc-check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            <span>Mostrar também os estados inalcançáveis</span>
          </label>
        )}
        <div className="table-scroll math-table">
          <table className="tt">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Código {f.bits.map((b) => b.name).join("")}</th>
                {Array.from({ length: combos }, (_, c) => (
                  <th key={c}>{nIn ? `${f.inputs.map((x) => x.name).join("")} = ${inCombo(c)}` : "Próximo"}</th>
                ))}
                {outs.map((o) => (
                  <th key={o.label} title={o.structure}>
                    {o.label}
                    {o.moore ? "" : " (Mealy)"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.state} className={s.reachable ? "" : "rx"}>
                  <td>
                    <b>S{s.state}</b>
                    {s.state === f.init ? " ▶" : ""}
                  </td>
                  <td>{s.code}</td>
                  {s.next.map((t, c) => (
                    <td key={c}>S{t}</td>
                  ))}
                  {outs.map((o) => (
                    <td key={o.label}>
                      <b>{o.moore ? o.byState[s.state] : o.byStateInput[s.state].join(" ")}</b>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {outs.length > 0 && (
          <ul className="fsm-eqs">
            {outs.map((o) => (
              <li key={o.label}>
                <b>{o.label}</b> <span className="logic-mono">= {o.structure}</span> {o.moore ? "(só do estado: Moore)" : "(depende também da entrada: Mealy)"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">3</span> Diagrama de estados
        </h3>
        <p className="math-note">Cada círculo é um estado (nome e código). O duplo é o inicial. As setas mostram a transição e a entrada que a provoca.</p>
        <div className="fsm-wrap">
          <Diagram f={f} />
        </div>
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">4</span> Refazer o projeto
        </h3>
        <p className="math-note">Leva esta tabela para o projetista de máquinas de estado. Lá você troca o tipo de flip-flop e vê as equações mínimas com Karnaugh.</p>
        <div className="logic-actions">
          <button className="btn primary" onClick={reuse} disabled={!f.spec}>
            Abrir no projetista de máquina de estados
          </button>
          {!f.spec && <p className="math-note">Não cabe no projetista (limite de 2 entradas e 5 variáveis no mapa).</p>}
        </div>
      </section>
    </div>
  );
}
