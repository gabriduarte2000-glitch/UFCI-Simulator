import { useLive } from "../live";
import { useScopes } from "../scopes";
import { fmtNum } from "../util";
import { useTimeUnit } from "../timeunit";
import { Chart } from "../components/Chart";
import { Gauge } from "../components/Gauge";
import { LiveInputs } from "../components/LiveInputs";
import { PALETTE } from "../util";
import { useUi } from "../ui";
import { GraficosView } from "./GraficosPage";
import { groupByUnit, NoData, useScopeSignalList } from "./common";

function PainelView() {
  const scopes = useScopes();
  const signals = useLive((s) => s.signals);
  const current = useLive((s) => s.current);
  const status = useLive((s) => s.status);
  const t0 = useLive((s) => s.t0);
  const t = useLive((s) => s.t);
  const unit = useTimeUnit();
  const list = useScopeSignalList();
  if (signals.length === 0) return <NoData what="Dashboard" />;
  return (
    <div className="page dash-page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <span className="muted">
          Tempo simulado: {fmtNum(t, 4)} {unit}
        </span>
      </div>
      <LiveInputs inline />
      <div className="dash-grid">
        <section className="dash-main">
          {scopes.length === 0 && <div className="card chart-empty">Adicione um Scope e ligue os sinais que quer acompanhar.</div>}
          <div className="dash-charts">
            {scopes.map((sc) => (
              <div className="card chart-card" key={sc.id}>
                <div className="card-title">{sc.label}</div>
                {sc.sigs.length === 0 ? (
                  <div className="chart-empty">Ligue sinais às entradas deste Scope</div>
                ) : (
                  <>
                    <div className="chart-legend">
                      {sc.sigs.map((i, k) => (
                        <span key={i}>
                          <i style={{ background: PALETTE[k % PALETTE.length] }} />
                          {signals[i]?.label}
                          {signals[i]?.unit ? ` (${signals[i].unit})` : ""}
                        </span>
                      ))}
                    </div>
                    {groupByUnit(sc.sigs, signals).map((g) => (
                      <Chart key={g.unit} sigs={g.sigs} height={groupByUnit(sc.sigs, signals).length > 1 ? 170 : 230} colorOffset={sc.sigs.indexOf(g.sigs[0])} />
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
        <aside className="dash-side">
          <div className="card">
            <div className="card-title">Instrumentos</div>
            <div className="gauges wrap">
              {list.map((i, k) => (
                <Gauge key={i} label={signals[i]?.label ?? ""} value={current[i]} unit={signals[i]?.unit} color={k} resetKey={t0 + (status === "idle" ? 1 : 0)} />
              ))}
              {list.length === 0 && <div className="chart-empty small">Os instrumentos mostram os sinais ligados a um Scope.</div>}
            </div>
          </div>
          <div className="card vars">
            <div className="card-title">Variáveis do sistema</div>
            <div className="table-scroll" style={{ maxHeight: 360 }}>
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
          </div>
        </aside>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const view = useUi((s) => s.dashView);
  const setView = useUi((s) => s.setDashView);
  const empty = useLive((s) => s.signals.length === 0);
  if (empty) return <NoData what="Dashboard" />;
  return (
    <div className="page-stack">
      <div className="view-bar">
        <div className="seg small" role="tablist" aria-label="Visão">
          <button role="tab" aria-selected={view === "painel"} className={view === "painel" ? "on" : ""} onClick={() => setView("painel")}>
            Painel
          </button>
          <button role="tab" aria-selected={view === "graficos"} className={view === "graficos" ? "on" : ""} onClick={() => setView("graficos")}>
            Gráficos
          </button>
        </div>
      </div>
      {view === "painel" ? <PainelView /> : <GraficosView />}
    </div>
  );
}
