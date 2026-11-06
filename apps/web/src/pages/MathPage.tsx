// Visão matemática: as equações do circuito montado, na ordem em que se deduz o modelo.

import { useEffect, useState } from "react";
import { analyzeMath, type MathBlock, type MathReport } from "@ufci/engine";
import { useProject } from "../store";
import { useUi, type MathTab } from "../ui";
import { Icon } from "../components/Icon";
import { Tex } from "../components/Tex";
import SynthPanel from "./SynthPanel";
import FreqPanel from "./FreqPanel";
import LogicPanel from "./LogicPanel";
import SeqPanel from "./SeqPanel";
import StatesPanel from "./StatesPanel";

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

function DigitalHint() {
  const project = useProject((s) => s.project);
  const digital = project.components.some((c) => c.type.startsWith("dig.") || c.type.startsWith("ic."));
  if (!digital) return null;
  const seq = project.components.some((c) => /^dig\.(dff|tff|jkff)$/.test(c.type));
  return (
    <p className="math-note digital-hint">
      Este projeto tem blocos digitais. A conta deles é a lógica.{" "}
      <button className="link-btn" onClick={() => useUi.getState().setMathTab("logicaCirc")}>
        Ver a lógica das portas
      </button>
      {seq && (
        <>
          {" · "}
          <button className="link-btn" onClick={() => useUi.getState().setMathTab("estados")}>
            Ver a máquina de estados
          </button>
        </>
      )}
    </p>
  );
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
          {report.sections.some((x) => ["tf", "polos", "degrau"].includes(x.id)) && (
            <div className="math-answer">
              <b>Respostas principais:</b>
              {report.sections
                .filter((x) => ["tf", "polos", "degrau"].includes(x.id))
                .map((x) => (
                  <button
                    key={x.id}
                    className="link-btn"
                    onClick={() => {
                      setOpen({ ...open, [x.id]: true });
                      document.getElementById(`math-${x.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {x.title}
                  </button>
                ))}
              <span className="muted"> As outras seções mostram como se chega nelas.</span>
            </div>
          )}
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

type Mode = "conta" | "circuito";
interface Opt {
  tab: MathTab;
  title: string;
  desc: string;
  answer: string;
}
const MODES: Record<Mode, { title: string; sub: string; menu: MathTab; options: Opt[] }> = {
  conta: {
    title: "Da conta para o circuito",
    sub: "Tenho a equação, a tabela ou o enunciado. Quero o circuito montado.",
    menu: "menuConta",
    options: [
      { tab: "equacao", title: "Sistema contínuo", desc: "Digite a função de transferência H(s) ou as matrizes de estado. O programa monta o diagrama ou o circuito e confere.", answer: "O circuito montado no quadro e a conferência de G(s)." },
      { tab: "logica", title: "Lógica combinacional", desc: "Parta da tabela-verdade ou da equação booleana. O programa reduz com Karnaugh e desenha as portas.", answer: "Equação final (passo 5) e o circuito de portas (passo 6)." },
      { tab: "sequencial", title: "Contador ou máquina de estados", desc: "Descreva os estados e para onde cada um vai. O programa acha as equações dos flip-flops e monta o circuito.", answer: "Equações finais (passo 5) e o circuito com flip-flops (passo 6)." },
    ],
  },
  circuito: {
    title: "Do circuito para a conta",
    sub: "Já montei no quadro. Quero ver a conta por trás dele.",
    menu: "menuCircuito",
    options: [
      { tab: "analise", title: "Equações do sistema", desc: "Circuitos elétricos, mecânicos, térmicos e blocos de controle: equações, função de transferência e polos.", answer: "Seções Função de transferência e Polos, zeros e estabilidade. As outras mostram como se chega nelas." },
      { tab: "frequencia", title: "Ganho e fase", desc: "Resposta em frequência (Bode) do circuito montado.", answer: "As curvas de ganho e fase e a tabela de pontos." },
      { tab: "logicaCirc", title: "Lógica das portas", desc: "Lê as portas e os LEDs do quadro. Mostra a equação de cada saída, a tabela-verdade, o Karnaugh e a equação mínima.", answer: "Equação de cada saída, e a equação final de cada uma no passo 5." },
      { tab: "estados", title: "Máquina de estados", desc: "Lê os flip-flops do quadro (contador ou máquina de estados). Mostra a tabela de estados e o diagrama.", answer: "A tabela de estados (passo 2) e o diagrama (passo 3)." },
    ],
  },
};
const modeOfTab = (t: MathTab): Mode | null => {
  if (t === "inicio") return null;
  if (t === "menuConta" || MODES.conta.options.some((o) => o.tab === t)) return "conta";
  return "circuito";
};

function boardInfo(project: ReturnType<typeof useProject.getState>["project"]) {
  const comps = project.components.filter((c) => c.type !== "note.text" && !c.type.startsWith("sink."));
  const dig = comps.filter((c) => c.type.startsWith("dig.") || c.type.startsWith("ic."));
  const ffs = comps.filter((c) => /^dig\.(dff|tff|jkff)$/.test(c.type));
  const leds = comps.filter((c) => c.type === "dig.led");
  const cont = comps.length - dig.length;
  return { total: comps.length, dig: dig.length, ffs: ffs.length, leds: leds.length, cont };
}

function Landing() {
  const project = useProject((s) => s.project);
  const info = boardInfo(project);
  const go = (t: MathTab) => useUi.getState().setMathTab(t);
  return (
    <div className="math-landing">
      <p className="math-lead">O que você quer fazer?</p>
      <div className="mode-grid">
        <button className="mode-card" onClick={() => go("menuConta")}>
          <span className="mode-n">1</span>
          <b>{MODES.conta.title}</b>
          <span>{MODES.conta.sub}</span>
          <em>Sistema contínuo, lógica combinacional ou sequencial</em>
        </button>
        <button className="mode-card" onClick={() => go("menuCircuito")}>
          <span className="mode-n">2</span>
          <b>{MODES.circuito.title}</b>
          <span>{MODES.circuito.sub}</span>
          <em>
            {info.total === 0
              ? "O quadro está vazio. Monte um circuito ou abra uma situação antes."
              : `No quadro agora: ${info.total} componentes${info.dig ? `, ${info.dig} digitais` : ""}${info.ffs ? `, ${info.ffs} flip-flop${info.ffs > 1 ? "s" : ""}` : ""}.`}
          </em>
        </button>
      </div>
    </div>
  );
}

function recommended(tab: MathTab, project: ReturnType<typeof useProject.getState>["project"]): boolean {
  const i = boardInfo(project);
  if (tab === "analise" || tab === "frequencia") return i.cont > 0;
  if (tab === "logicaCirc") return i.dig > 0 && i.leds > 0;
  if (tab === "estados") return i.ffs > 0;
  return false;
}

function Menu({ mode }: { mode: Mode }) {
  const project = useProject((s) => s.project);
  const m = MODES[mode];
  return (
    <div className="math-landing">
      <p className="math-lead">
        <b>{m.title}.</b> {m.sub} Escolha o tipo de problema:
      </p>
      <div className="opt-grid">
        {m.options.map((o) => {
          const rec = mode === "circuito" && recommended(o.tab, project);
          return (
            <button key={o.tab} className={`mode-card small ${rec ? "rec" : ""}`} onClick={() => useUi.getState().setMathTab(o.tab)}>
              <b>{o.title}</b>
              <span>{o.desc}</span>
              {rec && <em>O quadro tem o que esta opção lê</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MathPage() {
  const tab = useUi((s) => s.mathTab);
  const setTab = useUi((s) => s.setMathTab);
  const mode = modeOfTab(tab);
  const m = mode ? MODES[mode] : null;
  const opt = m?.options.find((o) => o.tab === tab);
  return (
    <div className="page math-page">
      <div className="page-head">
        <h1>Matemática</h1>
      </div>
      {tab !== "inicio" && m && (
        <nav className="math-crumbs" aria-label="Onde você está">
          <button className="link-btn" onClick={() => setTab("inicio")}>
            Início
          </button>
          <span>›</span>
          {opt ? (
            <button className="link-btn" onClick={() => setTab(m.menu)}>
              {m.title}
            </button>
          ) : (
            <b>{m.title}</b>
          )}
          {opt && (
            <>
              <span>›</span>
              <b>{opt.title}</b>
            </>
          )}
        </nav>
      )}
      {opt && m && (
        <>
          <div className="seg" role="tablist" aria-label="Tipo de problema">
            {m.options.map((o) => (
              <button key={o.tab} role="tab" aria-selected={tab === o.tab} className={tab === o.tab ? "on" : ""} onClick={() => setTab(o.tab)}>
                {o.title}
              </button>
            ))}
          </div>
          <p className="math-answer-line">
            <b>Onde está a resposta:</b> {opt.answer}
          </p>
        </>
      )}
      {tab === "inicio" && <Landing />}
      {tab === "menuConta" && <Menu mode="conta" />}
      {tab === "menuCircuito" && <Menu mode="circuito" />}
      {tab === "analise" && <DigitalHint />}
      {tab === "analise" && <AnalysePanel />}
      {tab === "frequencia" && <FreqPanel />}
      {tab === "sequencial" && <SeqPanel />}
      {tab === "estados" && <StatesPanel active />}
      <div hidden={tab !== "logica"} className="logic-wrap">
        <LogicPanel mode="design" />
      </div>
      <div hidden={tab !== "logicaCirc"} className="logic-wrap">
        <LogicPanel mode="board" active={tab === "logicaCirc"} />
      </div>
      <div hidden={tab !== "equacao"} className="synth-wrap">
        <SynthPanel />
      </div>
    </div>
  );
}
