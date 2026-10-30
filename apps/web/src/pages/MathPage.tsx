// Visão matemática: as equações do circuito montado, na ordem em que se deduz o modelo.

import { useEffect, useState } from "react";
import { analyzeMath, type MathBlock, type MathReport } from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Icon } from "../components/Icon";
import { Tex } from "../components/Tex";
import SynthPanel from "./SynthPanel";

function Block({ b }: { b: MathBlock }) {
  switch (b.kind) {
    case "text":
      return <h3 className="math-h3">{b.text}</h3>;
    case "note":
      return <p className="math-note">{b.text}</p>;
    case "tex":
      return (
        <figure className="math-eq">
          {b.caption && <figcaption>{b.caption}</figcaption>}
          <Tex src={b.tex} />
        </figure>
      );
    case "table":
      return (
        <div className="table-scroll math-table">
          <table>
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{typeof c === "string" ? c : <Tex src={c.tex} display={false} />}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function toLatex(rep: MathReport, name: string): string {
  const out: string[] = [`% ${name}: equações geradas pelo UFCI Simulator`];
  for (const s of rep.sections) {
    out.push(`\n% ---- ${s.title}`);
    for (const b of s.blocks) {
      if (b.kind === "text") out.push(`% ${b.text}`);
      else if (b.kind === "tex") out.push(`${b.caption ? `% ${b.caption}\n` : ""}\\[ ${b.tex} \\]`);
    }
  }
  return out.join("\n");
}

function AnalysePanel() {
  const project = useProject((s) => s.project);
  const [sel, setSel] = useState<{ input?: string; output?: string }>({});
  const [report, setReport] = useState<MathReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
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

  if (empty)
    return (
      <div className="page-empty">
        <h2>Do circuito para a equação</h2>
        <p>Monte um circuito ou abra uma situação. Aqui você vê as equações, as derivadas, a função de transferência e a resolução algébrica das conexões.</p>
        <p>
          Prefere o caminho contrário?{" "}
          <button className="link-btn" onClick={() => useUi.getState().setMathTab("equacao")}>
            Digite a equação e gere o circuito.
          </button>
        </p>
      </div>
    );

  const isOpen = (id: string) => open[id] ?? true;
  const setAll = (v: boolean) => setOpen(Object.fromEntries((report?.sections ?? []).map((s) => [s.id, v])));

  return (
    <>
      <div className="page-head">
        <span className="muted">Equações do circuito montado, na ordem em que o modelo é deduzido.</span>
      </div>

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
          <div className="math-actions">
            <button className="btn" onClick={() => setAll(true)}>
              Expandir
            </button>
            <button className="btn" onClick={() => setAll(false)}>
              Recolher
            </button>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(toLatex(report, project.meta.name)).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                });
              }}
            >
              <Icon name="copy" /> {copied ? "Copiado" : "Copiar LaTeX"}
            </button>
          </div>
        </div>
      )}

      {busy && <div className="math-busy">Calculando…</div>}
      {report && !report.ok && <div className="math-error">{report.error}</div>}

      {report?.ok && (
        <>
          <nav className="math-toc" aria-label="Seções">
            {report.sections.map((s) => (
              <a
                key={s.id}
                href={`#math-${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen({ ...open, [s.id]: true });
                  document.getElementById(`math-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {s.title}
              </a>
            ))}
          </nav>
          {report.sections.map((s) => (
            <details key={s.id} id={`math-${s.id}`} className="math-sec" open={isOpen(s.id)} onToggle={(e) => setOpen((o) => ({ ...o, [s.id]: (e.target as HTMLDetailsElement).open }))}>
              <summary>
                <Icon name="chevron" size={14} />
                <h2>{s.title}</h2>
              </summary>
              <div className="math-body">
                {s.lead && <p className="math-lead">{s.lead}</p>}
                {s.blocks.map((b, i) => (
                  <Block key={i} b={b} />
                ))}
              </div>
            </details>
          ))}
          <p className="math-foot muted">
            O cálculo roda no seu navegador. As leis dos elementos, Kirchhoff e a matriz de admitâncias são simbólicas. A redução final (matrizes A, B, C, D, função de transferência e polos) é numérica, por linearização no ponto de operação, e vale para pequenos desvios em torno dele.
          </p>
        </>
      )}
    </>
  );
}

export default function MathPage() {
  const tab = useUi((s) => s.mathTab);
  const setTab = useUi((s) => s.setMathTab);
  return (
    <div className="page math-page">
      <div className="page-head">
        <h1>Matemática</h1>
      </div>
      <div className="seg" role="tablist" aria-label="Sentido da conversão">
        <button role="tab" aria-selected={tab === "analise"} className={tab === "analise" ? "on" : ""} onClick={() => setTab("analise")}>
          Circuito para equação
        </button>
        <button role="tab" aria-selected={tab === "equacao"} className={tab === "equacao" ? "on" : ""} onClick={() => setTab("equacao")}>
          Equação para circuito
        </button>
      </div>
      {tab === "analise" && <AnalysePanel />}
      <div hidden={tab !== "equacao"} className="synth-wrap">
        <SynthPanel />
      </div>
    </div>
  );
}
