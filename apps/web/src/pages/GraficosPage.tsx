import { useMemo } from "react";
import { useLive } from "../live";
import { useUi, type ChartMode } from "../ui";
import { PALETTE } from "../util";
import { Chart } from "../components/Chart";
import { LiveInputs } from "../components/LiveInputs";
import { groupByUnit, NoData, useScopeSignalList } from "./common";

export function GraficosPage() {
  const signals = useLive((s) => s.signals);
  const scopeSigs = useScopeSignalList();
  const chosen = useUi((s) => s.chartSignal);
  const setChosen = useUi((s) => s.setChartSignal);
  const mode = useUi((s) => s.chartMode);
  const setMode = useUi((s) => s.setChartMode);
  const valid = chosen.filter((i) => i < signals.length);
  const sigs = valid.length ? valid : scopeSigs;
  // Agrupa a lista por componente.
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: number[] }>();
    signals.forEach((s, i) => {
      const key = s.componentId ?? "—";
      const name = s.label.split(" · ")[0];
      if (!m.has(key)) m.set(key, { label: name, items: [] });
      m.get(key)!.items.push(i);
    });
    return [...m.values()];
  }, [signals]);
  if (signals.length === 0) return <NoData what="Gráficos" />;
  const panels: { key: string; title: string; sigs: number[]; offset: number }[] =
    mode === "all"
      ? [{ key: "all", title: "", sigs, offset: 0 }]
      : mode === "each"
        ? sigs.map((i, k) => ({ key: String(i), title: signals[i].label, sigs: [i], offset: k }))
        : groupByUnit(sigs, signals).map((g) => ({ key: g.unit || "-", title: g.unit ? `Em ${g.unit}` : "Sem unidade (adimensional)", sigs: g.sigs, offset: sigs.indexOf(g.sigs[0]) }));
  const label = (i: number) => {
    const s = signals[i];
    return (s.label.split(" · ")[1] ?? s.label) + (s.unit ? ` (${s.unit})` : "");
  };
  return (
    <div className="page graficos-page">
      <div className="sig-list">
        <div className="card-title">Sinais</div>
        <div className="sig-actions">
          <button className="link-btn" onClick={() => setChosen(signals.map((_, i) => i))}>
            Todos
          </button>
          <button className="link-btn" onClick={() => setChosen([])}>
            Do Scope
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.label} className="sig-group">
            <div className="sig-group-name">{g.label}</div>
            {g.items.map((i) => (
              <label key={i} className="check">
                <input type="checkbox" checked={sigs.includes(i)} onChange={(e) => setChosen(e.target.checked ? [...sigs, i] : sigs.filter((x) => x !== i))} />
                <span className="swatch" style={{ background: sigs.includes(i) ? PALETTE[sigs.indexOf(i) % PALETTE.length] : "transparent" }} />
                <span>{label(i)}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="graph-area">
        <div className="graph-bar">
          <label className="inline-select">
            <span>Organizar</span>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as ChartMode)}>
              <option value="unit">Um gráfico por unidade</option>
              <option value="each">Um gráfico por sinal</option>
              <option value="all">Tudo no mesmo gráfico</option>
            </select>
          </label>
          <span className="ev-key">
            <i className="ev" />
            instante de mudança de parâmetro
          </span>
          <LiveInputs inline />
        </div>
        <div className={`graph-stack ${panels.length > 2 ? "scroll" : ""}`}>
          {sigs.length === 0 ? (
            <div className="chart-empty">Escolha ao menos um sinal na lista.</div>
          ) : (
            panels.map((pn) => (
              <div className="card graph-card" key={pn.key}>
                {pn.title && <div className="card-title">{pn.title}</div>}
                <Chart sigs={pn.sigs} height="fill" legend colorOffset={pn.offset} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
