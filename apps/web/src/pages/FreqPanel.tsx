// Resposta em frequência do circuito montado: Bode, ganho e fase em uma frequência, margens.

import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { analyzeMath, bode, polyTex, responseAt, type MathReport } from "@ufci/engine";
import { useProject } from "../store";
import { Tex } from "../components/Tex";

const AXIS = "#8fa3c2";
const GRID = "rgba(143,163,194,0.14)";

function BodePlot({ x, y, label, xLabel, color, height, markX }: { x: number[]; y: number[]; label: string; xLabel: string; color: string; height: number; markX?: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const opts: uPlot.Options = {
      width: Math.max(220, el.clientWidth),
      height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, sync: { key: "bode" }, points: { size: 6 } },
      padding: [8, 12, 0, 0],
      scales: { x: { time: false, distr: 3, log: 10 }, y: { auto: true } },
      axes: [
        { stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, font: "11px system-ui", label: xLabel, labelFont: "11px system-ui", labelSize: 16, size: 38 },
        { stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, font: "11px system-ui", size: 54, label, labelFont: "11px system-ui", labelSize: 16 },
      ],
      series: [{ label: xLabel }, { label, stroke: color, width: 2, points: { show: false } }],
      hooks: {
        draw: [
          (u) => {
            if (!markX || !(markX > 0)) return;
            const px = Math.round(u.valToPos(markX, "x", true));
            if (px < u.bbox.left || px > u.bbox.left + u.bbox.width) return;
            const c = u.ctx;
            c.save();
            c.setLineDash([4, 4]);
            c.strokeStyle = "rgba(250,204,21,0.85)";
            c.beginPath();
            c.moveTo(px, u.bbox.top);
            c.lineTo(px, u.bbox.top + u.bbox.height);
            c.stroke();
            c.restore();
          },
        ],
      },
    };
    const u = new uPlot(opts, [x, y] as uPlot.AlignedData, el);
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(220, el.clientWidth), height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [x, y, label, xLabel, color, height, markX]);
  return <div ref={host} className="bode-plot" />;
}

const f4 = (v: number) => String(+v.toPrecision(4)).replace(".", ",");

export default function FreqPanel() {
  const project = useProject((s) => s.project);
  const [sel, setSel] = useState<{ input?: string; output?: string }>({});
  const [report, setReport] = useState<MathReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [hz, setHz] = useState(false);
  const [freq, setFreq] = useState("");
  const empty = project.components.filter((c) => c.type !== "note.text").length === 0;

  useEffect(() => {
    if (empty) {
      setReport(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = window.setTimeout(() => {
      try {
        setReport(analyzeMath(project, sel));
      } catch (e) {
        setReport({ ok: false, error: e instanceof Error ? e.message : String(e), sections: [], inputs: [], outputs: [], order: 0 });
      }
      setBusy(false);
    }, 120);
    return () => window.clearTimeout(id);
  }, [project, sel, empty]);

  const k = hz ? 1 / (2 * Math.PI) : 1;
  const b = useMemo(() => (report?.tf ? bode(report.tf.num, report.tf.den) : null), [report]);
  const xs = useMemo(() => (b ? b.w.map((v) => v * k) : []), [b, k]);
  const unit = hz ? "Hz" : "rad/s";
  const fNum = Number(freq.replace(",", "."));
  const wMeas = Number.isFinite(fNum) && fNum > 0 ? (hz ? fNum * 2 * Math.PI : fNum) : null;
  const at = report?.tf && wMeas ? responseAt(report.tf.num, report.tf.den, wMeas) : null;
  const num = report?.tf?.num ?? [0];
  const den = report?.tf?.den ?? [1];
  const isZero = num.every((v) => v === 0);

  if (empty)
    return (
      <div className="page-empty">
        <h2>Resposta em frequência</h2>
        <p>Monte um circuito ou abra uma situação para medir ganho e fase.</p>
      </div>
    );

  return (
    <>
      <p className="math-lead">Ganho e fase da saída em relação à entrada, para senoides de qualquer frequência. O cálculo parte do modelo linearizado do circuito montado.</p>
      {report?.ok && (
        <div className="math-controls card">
          <label>
            <span>Entrada (fonte)</span>
            <select value={report.input ?? ""} onChange={(e) => setSel({ ...sel, input: e.target.value || undefined })} disabled={!report.inputs.length}>
              {!report.inputs.length && <option value="">sem fontes</option>}
              {report.inputs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Saída (grandeza)</span>
            <select value={report.output ?? ""} onChange={(e) => setSel({ ...sel, output: e.target.value || undefined })}>
              {report.outputs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="seg small" role="group" aria-label="Unidade de frequência">
            <button className={!hz ? "on" : ""} onClick={() => setHz(false)}>
              rad/s
            </button>
            <button className={hz ? "on" : ""} onClick={() => setHz(true)}>
              Hz
            </button>
          </div>
        </div>
      )}
      {busy && <div className="math-busy">Calculando…</div>}
      {report && !report.ok && <div className="math-error">{report.error}</div>}
      {report?.ok && !report.tf && <div className="math-error">Não foi possível obter G(s) para essa entrada e saída. O circuito pode ter mais de 40 estados ou não ter fonte de entrada.</div>}
      {report?.ok && report.tf && isZero && <div className="math-error">A saída escolhida não depende da entrada escolhida. Escolha outra combinação.</div>}

      {report?.ok && report.tf && !isZero && b && (
        <>
          <figure className="math-eq card">
            <figcaption>Função de transferência usada</figcaption>
            <Tex src={`G(s)=\\frac{${polyTex(num)}}{${polyTex(den)}}`} />
          </figure>

          <div className="card bode-card">
            <h3 className="math-h3">Diagrama de Bode</h3>
            <BodePlot x={xs} y={b.magDb} label="Ganho (dB)" xLabel={`Frequência (${unit})`} color="#4da3ff" height={230} markX={wMeas ? wMeas * k : undefined} />
            <BodePlot x={xs} y={b.phase} label="Fase (graus)" xLabel={`Frequência (${unit})`} color="#f5a524" height={230} markX={wMeas ? wMeas * k : undefined} />
          </div>

          <div className="card bode-meas">
            <h3 className="math-h3">Medir em uma frequência</h3>
            <label className="synth-field">
              <span>Frequência ({unit})</span>
              <input inputMode="decimal" value={freq} onChange={(e) => setFreq(e.target.value)} placeholder={hz ? "ex.: 50" : "ex.: 10"} />
            </label>
            {at && wMeas && (
              <table className="bode-table">
                <tbody>
                  <tr>
                    <th>Ganho</th>
                    <td>
                      {f4(at.gain)} ({f4(at.db)} dB)
                    </td>
                  </tr>
                  <tr>
                    <th>Fase</th>
                    <td>{f4(at.phaseDeg)}°</td>
                  </tr>
                  <tr>
                    <th>Em rad/s</th>
                    <td>{f4(wMeas)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {!at && <p className="muted synth-hint">Digite a frequência de uma senoide para ver o ganho e a fase da saída em relação à entrada.</p>}
          </div>

          <div className="card bode-meas">
            <h3 className="math-h3">Resumo</h3>
            <table className="bode-table">
              <tbody>
                {b.lowDb !== undefined && (
                  <tr>
                    <th>Ganho em baixa frequência</th>
                    <td>{f4(b.lowDb)} dB</td>
                  </tr>
                )}
                <tr>
                  <th>Pico de ganho</th>
                  <td>
                    {f4(b.peak.db)} dB em {f4(b.peak.w * k)} {unit}
                  </td>
                </tr>
                {b.edges3dB.length > 0 && (
                  <tr>
                    <th>Queda de 3 dB</th>
                    <td>{b.edges3dB.map((w) => `${f4(w * k)} ${unit}`).join(" e ")}</td>
                  </tr>
                )}
                {b.gainCross && (
                  <tr>
                    <th>Ganho = 0 dB</th>
                    <td>
                      {f4(b.gainCross.w * k)} {unit}, margem de fase {f4(b.gainCross.phaseMarginDeg)}°
                    </td>
                  </tr>
                )}
                {b.phaseCross && (
                  <tr>
                    <th>Fase = −180°</th>
                    <td>
                      {f4(b.phaseCross.w * k)} {unit}, margem de ganho {f4(b.phaseCross.gainMarginDb)} dB
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="muted synth-hint">As margens valem para malha aberta. Para ver a malha fechada, escolha como saída o sinal depois da realimentação.</p>
          </div>
        </>
      )}
    </>
  );
}
