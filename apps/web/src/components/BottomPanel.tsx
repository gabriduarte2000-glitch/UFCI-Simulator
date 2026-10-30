import { useMemo, useState } from "react";
import { stepMetrics } from "@ufci/engine";
import { useLive } from "../live";
import { useProject } from "../store";
import { useUi, type BottomTab } from "../ui";
import { useScopes } from "../scopes";
import { download, fmtNum, PALETTE, safeName, seriesToCsv } from "../util";
import { Chart } from "./Chart";
import { Gauge } from "./Gauge";
import { Icon } from "./Icon";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "graficos", label: "Gráficos" },
  { id: "tabelas", label: "Tabelas" },
  { id: "indicadores", label: "Indicadores" },
];

function useScopeSignalList() {
  const scopes = useScopes();
  return useMemo(() => [...new Set(scopes.flatMap((s) => s.sigs))], [scopes]);
}

function Placeholder({ text }: { text: string }) {
  return <div className="bottom-empty">{text}</div>;
}

function Dashboard() {
  const scopes = useScopes();
  const status = useLive((s) => s.status);
  const signals = useLive((s) => s.signals);
  const current = useLive((s) => s.current);
  const version = useLive((s) => s.version);
  const t0 = useLive((s) => s.t0);
  const list = useScopeSignalList();
  const gaugeSigs = list.slice(0, 3);
  void version;
  if (scopes.length === 0) return <Placeholder text="Adicione um Scope e ligue os sinais que quer acompanhar. Os gráficos e instrumentos aparecem aqui." />;
  return (
    <div className="dash">
      <div className="dash-charts">
        {scopes.map((sc) => (
          <div className="card chart-card" key={sc.id}>
            <div className="card-title">{sc.label}</div>
            {sc.wired === 0 ? (
              <div className="chart-empty">Ligue sinais às entradas deste Scope</div>
            ) : sc.sigs.length === 0 ? (
              <div className="chart-empty">{status === "idle" ? "Clique em Simular para ver as curvas" : "Sem dados"}</div>
            ) : (
              <>
                <div className="chart-legend">
                  {sc.sigs.map((i, k) => (
                    <span key={i}>
                      <i style={{ background: PALETTE[k % PALETTE.length] }} />
                      {signals[i]?.label}
                    </span>
                  ))}
                </div>
                <Chart sigs={sc.sigs} height={170} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="dash-side">
        <div className="card">
          <div className="card-title">Instrumentos</div>
          <div className="gauges">
            {gaugeSigs.length === 0 ? (
              <div className="chart-empty small">Os instrumentos mostram os sinais do Scope durante a simulação.</div>
            ) : (
              gaugeSigs.map((i, k) => <Gauge key={i} label={(signals[i]?.label ?? "").split(" · ")[0]} value={current[i]} unit={signals[i]?.unit} color={k} resetKey={t0 + (status === "idle" ? 1 : 0)} />)
            )}
          </div>
        </div>
        <VariablesTable compact />
      </div>
    </div>
  );
}

function VariablesTable({ compact = false }: { compact?: boolean }) {
  const signals = useLive((s) => s.signals);
  const current = useLive((s) => s.current);
  const status = useLive((s) => s.status);
  return (
    <div className="card vars">
      <div className="card-title">Variáveis do sistema</div>
      {signals.length === 0 ? (
        <div className="chart-empty small">Os valores aparecem durante a simulação.</div>
      ) : (
        <div className="table-scroll" style={{ maxHeight: compact ? 120 : undefined }}>
          <table>
            <thead>
              <tr>
                <th>Variável</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s, i) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td className="num">
                    {fmtNum(current[i])} {s.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status === "idle" && signals.length > 0 && <small className="hint">Simulação parada.</small>}
    </div>
  );
}

function Graficos() {
  const signals = useLive((s) => s.signals);
  const scopeSigs = useScopeSignalList();
  const chosen = useUi((s) => s.chartSignal);
  const setChosen = useUi((s) => s.setChartSignal);
  const valid = chosen.filter((i) => i < signals.length);
  const sigs = valid.length ? valid : scopeSigs;
  if (signals.length === 0) return <Placeholder text="Clique em Simular. Depois você escolhe aqui quais sinais comparar no mesmo gráfico." />;
  return (
    <div className="graficos">
      <div className="sig-list">
        <div className="card-title">Sinais</div>
        {signals.map((s, i) => (
          <label key={s.id} className="check">
            <input
              type="checkbox"
              checked={sigs.includes(i)}
              onChange={(e) => setChosen(e.target.checked ? [...sigs, i] : sigs.filter((x) => x !== i))}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </div>
      <div className="big-chart card">
        <div className="chart-legend">
          {sigs.map((i, k) => (
            <span key={i}>
              <i style={{ background: PALETTE[k % PALETTE.length] }} />
              {signals[i]?.label}
            </span>
          ))}
          <span className="ev-key">
            <i className="ev" />
            mudança de parâmetro
          </span>
        </div>
        <Chart sigs={sigs} height={190} />
      </div>
    </div>
  );
}

function Tabelas() {
  const signals = useLive((s) => s.signals);
  const series = useLive((s) => s.series);
  const version = useLive((s) => s.version);
  const name = useProject((s) => s.project.meta.name);
  void version;
  if (signals.length === 0) return <Placeholder text="Simule para gerar a tabela de dados." />;
  const n = series.n;
  const step = Math.max(1, Math.floor(n / 60));
  const rows: number[] = [];
  for (let r = 0; r < n; r += step) rows.push(r);
  if (rows[rows.length - 1] !== n - 1 && n > 0) rows.push(n - 1);
  return (
    <div className="tabelas">
      <div className="tab-actions">
        <span className="hint">{n.toLocaleString("pt-BR")} pontos registrados. A tabela mostra uma amostra; o CSV tem todos.</span>
        <button className="btn" onClick={() => download(`${safeName(name)}.csv`, seriesToCsv(series, signals), "text/csv")}>
          <Icon name="download" /> Exportar CSV
        </button>
      </div>
      <div className="table-scroll big">
        <table>
          <thead>
            <tr>
              <th className="num">t (s)</th>
              {signals.map((s) => (
                <th key={s.id} className="num">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td className="num">{fmtNum(series.t[r], 5)}</td>
                {signals.map((s, j) => (
                  <td key={s.id} className="num">
                    {fmtNum(series.cols[j][r])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Indicadores() {
  const signals = useLive((s) => s.signals);
  const series = useLive((s) => s.series);
  const status = useLive((s) => s.status);
  const events = useLive((s) => s.events);
  const version = useLive((s) => s.version);
  const project = useProject((s) => s.project);
  const scopeSigs = useScopeSignalList();
  const [sel, setSel] = useState<number | null>(null);
  const [tStart, setTStart] = useState<string>("");
  void version;
  if (signals.length === 0) return <Placeholder text="Simule para calcular ultrapassagem, tempo de subida e tempo de acomodação." />;
  const sig = sel !== null && sel < signals.length ? sel : (scopeSigs[0] ?? 0);
  const stepSrc = project.components.find((c) => c.type === "signal.step");
  const defStart = stepSrc ? Number(stepSrc.params.t_step?.value ?? 0) : 0;
  const ts = tStart.trim() === "" ? defStart : Number(tStart.replace(",", "."));
  const done = status === "finished" || status === "paused";
  const m = Number.isFinite(ts) && series.n > 2 ? stepMetrics(series.timeView(), series.colView(sig), ts) : null;
  const unit = signals[sig]?.unit ?? "";
  return (
    <div className="indic">
      <div className="indic-controls card">
        <label>
          Sinal
          <select className="input" value={sig} onChange={(e) => setSel(Number(e.target.value))}>
            {signals.map((s, i) => (
              <option key={s.id} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Instante do degrau (s)
          <input className="input" value={tStart} placeholder={String(defStart)} onChange={(e) => setTStart(e.target.value)} inputMode="decimal" />
        </label>
        <small className="hint">Vale para resposta a um degrau. {done ? "" : "Os valores finais só são confiáveis quando a simulação termina."}</small>
      </div>
      <div className="metrics">
        {[
          ["Valor final", m ? `${fmtNum(m.final)} ${unit}` : "—"],
          ["Ultrapassagem", m ? `${fmtNum(m.overshootPct, 3)} %` : "—"],
          ["Tempo de pico", m ? `${fmtNum(m.peakTime - ts, 3)} s` : "—"],
          ["Tempo de subida (10–90%)", m?.riseTime != null ? `${fmtNum(m.riseTime, 3)} s` : "—"],
          ["Acomodação (2%)", m?.settlingTime != null ? `${fmtNum(m.settlingTime, 3)} s` : "—"],
        ].map(([k, v]) => (
          <div className="metric" key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="card events">
        <div className="card-title">Mudanças durante a simulação</div>
        {events.length === 0 ? (
          <small className="hint">Nenhuma. Mexa em um parâmetro com a simulação rodando e o instante aparece aqui e no gráfico.</small>
        ) : (
          <ul>
            {events.slice(-30).map((e, i) => {
              const c = project.components.find((x) => x.id === e.componentId);
              return (
                <li key={i}>
                  <b>t = {fmtNum(e.t, 4)} s</b> {e.kind === "param" ? `${c?.label ?? e.componentId}: ${e.key} de ${String(e.from)} para ${String(e.to)}` : (e.note ?? "")}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function BottomPanel() {
  const tab = useUi((s) => s.bottomTab);
  const setTab = useUi((s) => s.setBottomTab);
  const open = useUi((s) => s.bottomOpen);
  const setOpen = useUi((s) => s.setBottomOpen);
  return (
    <section className={`bottom ${open ? "" : "collapsed"}`} aria-label="Resultados">
      <div className="tabs bottom-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => (setTab(t.id), setOpen(true))}>
            {t.label}
          </button>
        ))}
        <button className="tb collapse" title={open ? "Recolher painel" : "Expandir painel"} onClick={() => setOpen(!open)}>
          <Icon name={open ? "chevron" : "chevronUp"} />
        </button>
      </div>
      {open && (
        <div className="bottom-body">
          {tab === "dashboard" && <Dashboard />}
          {tab === "graficos" && <Graficos />}
          {tab === "tabelas" && <Tabelas />}
          {tab === "indicadores" && <Indicadores />}
        </div>
      )}
    </section>
  );
}
