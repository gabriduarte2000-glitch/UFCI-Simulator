import { useLive } from "../live";
import { useProject } from "../store";
import { useTimeUnit } from "../timeunit";
import { download, fmtNum, safeName, seriesToCsv } from "../util";
import { Icon } from "../components/Icon";
import { NoData } from "./common";

export function TabelasPage() {
  const signals = useLive((s) => s.signals);
  const series = useLive((s) => s.series);
  const version = useLive((s) => s.version);
  const name = useProject((s) => s.project.meta.name);
  const unit = useTimeUnit();
  void version;
  if (signals.length === 0) return <NoData what="Tabelas" />;
  const n = series.n;
  const step = Math.max(1, Math.floor(n / 200));
  const rows: number[] = [];
  for (let r = 0; r < n; r += step) rows.push(r);
  if (n > 0 && rows[rows.length - 1] !== n - 1) rows.push(n - 1);
  return (
    <div className="page tabelas-page">
      <div className="page-head">
        <h1>Tabelas</h1>
        <span className="muted">
          {n.toLocaleString("pt-BR")} pontos registrados. A tabela mostra uma amostra; o CSV tem todos.
        </span>
        <button className="btn" onClick={() => download(`${safeName(name)}.csv`, seriesToCsv(series, signals), "text/csv")}>
          <Icon name="download" /> Exportar CSV
        </button>
      </div>
      <div className="table-scroll full card">
        <table>
          <thead>
            <tr>
              <th className="num">t ({unit})</th>
              {signals.map((s) => (
                <th key={s.id} className="num">
                  {s.label}
                  {s.unit ? ` (${s.unit})` : ""}
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
