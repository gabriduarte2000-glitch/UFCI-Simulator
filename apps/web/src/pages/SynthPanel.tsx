// Do modelo matemático ao circuito: digita a equação, escolhe a realização e monta no quadro.

import { useMemo, useState } from "react";
import {
  canonicalSS,
  odeTex,
  parseEquation,
  parseStateSpace,
  polyRoots,
  realizations,
  ssTex,
  synthesize,
  tfTex,
  verifySynthesis,
  type EqModel,
  type EqResult,
  type RealizationId,
  type RealizationInfo,
} from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Tex } from "../components/Tex";

type Mode = "eq" | "ss";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "Massa-mola", text: "x'' + 2x' + 100x = 5F" },
  { label: "2ª ordem", text: "y'' + 3y' + 2y = 2u" },
  { label: "1ª ordem", text: "y' + 4y = 8u" },
  { label: "Passa-faixa", text: "H(s) = 3s/(s^2 + 2s + 25)" },
  { label: "3ª ordem", text: "H(s) = (s+2)/(s^3 + 4s^2 + 6s + 4)" },
];

const GROUPS: { id: RealizationInfo["group"]; title: string }[] = [
  { id: "blocos", title: "Diagrama de blocos" },
  { id: "circuito", title: "Circuito elétrico" },
  { id: "mecanico", title: "Sistema mecânico" },
];

const f4 = (v: number) => String(+v.toPrecision(4)).replace(".", ",");

function polesText(den: number[]): { text: string; stable: boolean } {
  const rs = polyRoots(den);
  const items = rs
    .filter((r) => r[1] >= -1e-9)
    .map((r) => {
      const re = Math.abs(r[0]) < 1e-9 ? 0 : r[0];
      return Math.abs(r[1]) < 1e-9 ? f4(re) : `${f4(re)} ± ${f4(Math.abs(r[1]))}j`;
    });
  return { text: items.join(";  "), stable: rs.every((r) => r[0] < -1e-9) };
}

export default function SynthPanel() {
  const [mode, setMode] = useState<Mode>("eq");
  const [text, setText] = useState("x'' + 2x' + 100x = 5F");
  const [ss, setSs] = useState({ A: "0 1; -2 -3", B: "0; 1", C: "1 0", D: "0" });
  const [inName, setInName] = useState("");
  const [outName, setOutName] = useState("");
  const [choice, setChoice] = useState<RealizationId>("integrators");
  const [scale, setScale] = useState("");

  const parsed: EqResult = useMemo(
    () => (mode === "eq" ? parseEquation(text, { input: inName.trim() || undefined, output: outName.trim() || undefined }) : parseStateSpace(ss.A, ss.B, ss.C, ss.D)),
    [mode, text, ss, inName, outName],
  );
  const model: EqModel | null = parsed.ok ? parsed.model : null;
  const scaleN = Number(scale.replace(",", "."));
  const opt = { scale: Number.isFinite(scaleN) && scaleN > 0 ? scaleN : undefined };
  const list = useMemo(() => (model ? realizations(model, opt) : []), [model, opt.scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = list.find((r) => r.id === choice && r.available) ?? list.find((r) => r.available);

  const built = useMemo(() => {
    if (!model || !active) return null;
    try {
      const s = synthesize(model, active.id, opt);
      return { s, v: verifySynthesis(model, s) };
    } catch (e) {
      return { s: null, v: { ok: false, maxErr: Infinity, message: e instanceof Error ? e.message : String(e) } };
    }
  }, [model, active?.id, opt.scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const canon = useMemo(() => (model ? (model.ss ?? canonicalSS(model)) : null), [model]);
  const poles = model ? polesText(model.den) : null;

  const place = (goMath: boolean) => {
    if (!built?.s || !model) return;
    const st = useProject.getState();
    if (st.project.components.length > 0 && !window.confirm("Montar no lugar do projeto atual? Salve o atual em arquivo antes se quiser guardá-lo.")) return;
    st.replaceProject(built.s.ir);
    st.setNotice(`Montado a partir da equação: ${active?.title}. ${built.v.ok ? "G(s) conferida com a equação." : ""}`.trim());
    const ui = useUi.getState();
    if (goMath) {
      ui.setMathTab("analise");
      ui.setPage("math");
    } else ui.setPage("montagem");
  };

  return (
    <div className="synth">
      <p className="math-lead">
        Digite a equação do sistema. O programa monta o diagrama ou o circuito e confere se a função de transferência do que foi montado é a mesma da equação.
      </p>

      <div className="card synth-in">
        <div className="seg small" role="tablist" aria-label="Forma de entrada">
          <button className={mode === "eq" ? "on" : ""} onClick={() => setMode("eq")}>
            Equação ou H(s)
          </button>
          <button className={mode === "ss" ? "on" : ""} onClick={() => setMode("ss")}>
            Espaço de estados
          </button>
        </div>

        {mode === "eq" ? (
          <>
            <label className="synth-field">
              <span>Equação diferencial ou função de transferência</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="y'' + 3y' + 2y = u     ou     H(s) = (s+2)/(s^2+3s+2)" />
            </label>
            <div className="synth-chips" aria-label="Exemplos">
              {EXAMPLES.map((e) => (
                <button key={e.label} className="chip-btn" onClick={() => setText(e.text)}>
                  {e.label}
                </button>
              ))}
            </div>
            <details className="synth-adv">
              <summary>Opções</summary>
              <div className="synth-row">
                <label className="synth-field">
                  <span>Nome da entrada</span>
                  <input value={inName} onChange={(e) => setInName(e.target.value)} placeholder="automático" />
                </label>
                <label className="synth-field">
                  <span>Nome da saída</span>
                  <input value={outName} onChange={(e) => setOutName(e.target.value)} placeholder="automático" />
                </label>
              </div>
              <p className="muted synth-hint">Aceita y', y'', dy/dt, d2y/dt2, potências com ^, frações e vírgula decimal. Só equações lineares com coeficientes numéricos.</p>
            </details>
          </>
        ) : (
          <div className="synth-ss">
            {(["A", "B", "C", "D"] as const).map((k) => (
              <label key={k} className="synth-field">
                <span>Matriz {k}</span>
                <input value={ss[k]} onChange={(e) => setSs({ ...ss, [k]: e.target.value })} spellCheck={false} />
              </label>
            ))}
            <p className="muted synth-hint">Linhas separadas por ponto e vírgula, colunas por espaço. Uma entrada e uma saída.</p>
          </div>
        )}
        {!parsed.ok && <div className="math-error synth-err">{parsed.error}</div>}
        {parsed.ok && parsed.model.warnings.map((w) => (
          <p key={w} className="math-note">
            {w}
          </p>
        ))}
      </div>

      {model && canon && poles && (
        <div className="card synth-model">
          <h2 className="synth-h">Modelo lido</h2>
          <figure className="math-eq">
            <figcaption>Equação diferencial (condições iniciais nulas)</figcaption>
            <Tex src={odeTex(model)} />
          </figure>
          <figure className="math-eq">
            <figcaption>Função de transferência</figcaption>
            <Tex src={tfTex(model)} />
          </figure>
          <figure className="math-eq">
            <figcaption>{model.ss ? "Espaço de estados digitado" : "Espaço de estados (forma canônica controlável)"}</figcaption>
            <Tex src={ssTex(canon)} />
          </figure>
          <p className="synth-poles">
            <b>Polos:</b> {poles.text}{" "}
            <span className={poles.stable ? "tag ok" : "tag warn"}>{poles.stable ? "estável" : "não estável"}</span>
          </p>
        </div>
      )}

      {model && (
        <div className="synth-real">
          <h2 className="synth-h">Como montar</h2>
          {GROUPS.map((g) => {
            const items = list.filter((r) => r.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="synth-group">
                <h3 className="math-h3">{g.title}</h3>
                <div className="synth-cards">
                  {items.map((r) => (
                    <button key={r.id} className={`synth-card${active?.id === r.id ? " on" : ""}`} disabled={!r.available} onClick={() => setChoice(r.id)} aria-pressed={active?.id === r.id}>
                      <strong>{r.title}</strong>
                      <span className="synth-desc">{r.available ? r.description : r.why}</span>
                      {r.available && r.values.length > 0 && (
                        <span className="synth-vals">
                          {r.values.slice(0, 6).map((v) => (
                            <code key={v}>{v}</code>
                          ))}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {active && (active.group === "circuito") && (
            <label className="synth-field synth-scale">
              <span>Impedância de referência (Ω)</span>
              <input inputMode="decimal" value={scale} onChange={(e) => setScale(e.target.value)} placeholder="automático" />
              <small className="muted">Muda só a escala de R, L e C. A função de transferência continua a mesma.</small>
            </label>
          )}

          {built && (
            <div className={`synth-check ${built.v.ok ? "ok" : "bad"}`} role="status">
              <strong>{built.v.ok ? "Conferido." : "Não confere."}</strong> {built.v.message}
            </div>
          )}

          <div className="synth-actions">
            <button className="btn primary" disabled={!built?.s} onClick={() => place(false)}>
              Montar no quadro
            </button>
            <button className="btn" disabled={!built?.s} onClick={() => place(true)}>
              Montar e ver as equações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
