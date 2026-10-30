import { useState } from "react";
import { stepMetrics } from "@ufci/engine";
import { useLive } from "../live";
import { useProject } from "../store";
import { useTimeUnit } from "../timeunit";
import { fmtNum } from "../util";
import { NoData, useScopeSignalList } from "./common";

export function IndicadoresPage() {
  const signals = useLive((s) => s.signals);
  const series = useLive((s) => s.series);
  const status = useLive((s) => s.status);
  const events = useLive((s) => s.events);
  const version = useLive((s) => s.version);
  const project = useProject((s) => s.project);
  const unit = useTimeUnit();
  const scopeSigs = useScopeSignalList();
  const [sel, setSel] = useState<number | null>(null);
  const [tStart, setTStart] = useState("");
  void version;
  if (signals.length === 0) return <NoData what="Indicadores" />;
  const sig = sel !== null && sel < signals.length ? sel : (scopeSigs[0] ?? 0);
  const stepSrc = project.components.find((c) => c.type === "signal.step");
  const defStart = stepSrc ? Number(stepSrc.params.t_step?.value ?? 0) : 0;
  const ts = tStart.trim() === "" ? defStart : Number(tStart.replace(",", "."));
  const done = status === "finished" || status === "paused";
  const m = Number.isFinite(ts) && series.n > 2 ? stepMetrics(series.timeView(), series.colView(sig), ts) : null;
  const su = signals[sig]?.unit ?? "";
  const cards: [string, string][] = [
    ["Valor final", m ? `${fmtNum(m.final)} ${su}` : "—"],
    ["Ultrapassagem", m ? `${fmtNum(m.overshootPct, 3)} %` : "—"],
    ["Tempo de pico", m ? `${fmtNum(m.peakTime - ts, 3)} ${unit}` : "—"],
    ["Tempo de subida (10 a 90%)", m?.riseTime != null ? `${fmtNum(m.riseTime, 3)} ${unit}` : "—"],
    ["Acomodação (faixa de 2%)", m?.settlingTime != null ? `${fmtNum(m.settlingTime, 3)} ${unit}` : "—"],
  ];
  return (
    <div className="page indic-page">
      <div className="page-head">
        <h1>Indicadores</h1>
        <span className="muted">Resposta a um degrau. {done ? "" : "Os valores finais só valem quando a simulação termina."}</span>
      </div>
      <div className="indic-grid">
        <div className="card indic-controls">
          <label>
            Sinal analisado
            <select className="input" value={sig} onChange={(e) => setSel(Number(e.target.value))}>
              {signals.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Instante do degrau ({unit})
            <input className="input" value={tStart} placeholder={String(defStart)} onChange={(e) => setTStart(e.target.value)} inputMode="decimal" />
          </label>
        </div>
        <div className="metrics">
          {cards.map(([k, v]) => (
            <div className="metric" key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <div className="card events">
          <div className="card-title">Mudanças durante a simulação</div>
          {events.length === 0 ? (
            <small className="hint">Nenhuma. Mexa em um parâmetro com a simulação rodando e o instante aparece aqui e nos gráficos.</small>
          ) : (
            <ul>
              {events.slice(-40).map((e, i) => {
                const c = project.components.find((x) => x.id === e.componentId);
                return (
                  <li key={i}>
                    <b>
                      t = {fmtNum(e.t, 4)} {unit}
                    </b>{" "}
                    {e.kind === "param" ? `${c?.label ?? e.componentId}: ${e.key} de ${String(e.from)} para ${String(e.to)}` : (e.note ?? "")}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
