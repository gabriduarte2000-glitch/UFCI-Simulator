// Lógica sequencial passo a passo: tabela de estados, excitação dos flip-flops, Karnaugh, equações e circuito.

import { useEffect, useMemo, useState } from "react";
import { buildSeqCircuit, designSeq, SEQ_EXAMPLES, type FFKind, type SeqFn, type SeqSpec } from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Tex } from "../components/Tex";
import { KMapSvg } from "./LogicPanel";

const INPUT_NAMES = ["X", "Y"];
const FF_INFO: Record<FFKind, { title: string; rule: string; table: string[][] }> = {
  D: { title: "Flip-flop D", rule: "O próximo estado do bit é igual a D. Então D = bit do próximo estado.", table: [["Q", "Q⁺", "D"], ["0", "0", "0"], ["0", "1", "1"], ["1", "0", "0"], ["1", "1", "1"]] },
  T: { title: "Flip-flop T", rule: "T = 1 inverte o bit, T = 0 mantém. Então T = bit atual ⊕ bit do próximo estado.", table: [["Q", "Q⁺", "T"], ["0", "0", "0"], ["0", "1", "1"], ["1", "0", "1"], ["1", "1", "0"]] },
  JK: { title: "Flip-flop JK", rule: "J liga o bit, K desliga. X = tanto faz. Cada transição pede um par J, K da tabela.", table: [["Q", "Q⁺", "J", "K"], ["0", "0", "0", "X"], ["0", "1", "1", "X"], ["1", "0", "X", "1"], ["1", "1", "X", "0"]] },
};
const SHOW = (c: number) => (c === 2 ? "X" : String(c));
const tex = (label: string) => `${label[0]}_{${label.slice(1)}}`;

function defaultSpec(): SeqSpec {
  return SEQ_EXAMPLES[2].spec;
}

function FnBlock({ f, idx }: { f: SeqFn; idx: number }) {
  const showMap = f.vars.length >= 2;
  return (
    <div className="seq-fn">
      <h4 className="logic-h4">
        <Tex src={tex(f.label)} display={false} /> em função de {f.vars.join(", ")}
      </h4>
      {showMap && (
        <div className="kmap-wrap">
          <KMapSvg vars={f.vars} vals={f.vals} m={f.min} kind="sop" />
        </div>
      )}
      {f.min.constant === null ? (
        <ol className="group-list">
          {f.min.groups.map((g, i) => (
            <li key={i} style={{ borderLeftColor: ["#e5484d", "#2f7df6", "#2fb36b", "#e39b1c", "#9b59d0", "#16a6b6", "#d6409f", "#7a8b99"][i % 8] }}>
              <b>Grupo {i + 1}</b> ({g.cells.length} quadrados: {g.cells.join(", ")}){g.essential ? ", essencial" : ""}: <Tex src={g.tex} display={false} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="math-note">Constante: {f.label} = {f.min.constant}.</p>
      )}
      <Tex src={`${tex(f.label)} = ${f.min.tex}`} />
      <span hidden>{idx}</span>
    </div>
  );
}

export default function SeqPanel() {
  const [goal, setGoal] = useState(SEQ_EXAMPLES[2].goal);
  const [spec, setSpec] = useState<SeqSpec>(defaultSpec());
  const [freq, setFreq] = useState("1");
  const res = useMemo(() => designSeq(spec), [spec]);
  const imp = useUi((s) => s.seqImport);
  useEffect(() => {
    if (!imp) return;
    setSpec(imp);
    setGoal("Máquina lida do circuito do quadro. Ajuste os estados se quiser e refaça o projeto.");
    useUi.getState().setSeqImport(null);
  }, [imp]);
  const nIn = spec.inputs.length;
  const combos = 1 << nIn;

  const resize = (nStates: number, nInputs: number) => {
    const inputs = INPUT_NAMES.slice(0, nInputs);
    const c = 1 << nInputs;
    const next = Array.from({ length: nStates }, (_, s) => Array.from({ length: c }, (_, k) => Math.min(nStates - 1, spec.next[s]?.[k % (spec.next[s]?.length || 1)] ?? (s + 1) % nStates)));
    const outputs = spec.outputs.map((o) => ({ ...o, byState: Array.from({ length: nStates }, (_, s) => o.byState[s] ?? 0) as (0 | 1)[] }));
    setSpec({ ...spec, nStates, inputs, next, outputs });
  };
  const setNext = (s: number, c: number, v: number) => setSpec({ ...spec, next: spec.next.map((r, i) => (i === s ? r.map((x, k) => (k === c ? v : x)) : r)) });
  const toggleOut = (oi: number, s: number) => setSpec({ ...spec, outputs: spec.outputs.map((o, i) => (i === oi ? { ...o, byState: o.byState.map((v, k) => (k === s ? ((1 - v) as 0 | 1) : v)) } : o)) });
  const addOut = () => setSpec({ ...spec, outputs: [...spec.outputs, { name: ["Z", "W", "V"][spec.outputs.length] ?? `Z${spec.outputs.length}`, byState: Array(spec.nStates).fill(0) as (0 | 1)[] }] });
  const delOut = (oi: number) => setSpec({ ...spec, outputs: spec.outputs.filter((_, i) => i !== oi) });
  const renameOut = (oi: number, name: string) => setSpec({ ...spec, outputs: spec.outputs.map((o, i) => (i === oi ? { ...o, name: name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "Z" } : o)) });

  const example = (e: (typeof SEQ_EXAMPLES)[number]) => {
    setGoal(e.goal);
    setSpec({ ...e.spec, ff: spec.ff });
  };

  const place = () => {
    if (!res.ok) return;
    const st = useProject.getState();
    if (st.project.components.length > 0 && !window.confirm("Montar no lugar do projeto atual? Salve o atual em arquivo antes se quiser guardá-lo.")) return;
    const f = Number(freq.replace(",", "."));
    st.replaceProject(buildSeqCircuit("Lógica sequencial", spec, res, Number.isFinite(f) && f > 0 ? f : 1));
    st.setNotice("Circuito sequencial montado: clock, flip-flops, portas e LEDs de estado. Simule e acompanhe os LEDs.");
    useUi.getState().setPage("montagem");
  };

  const ffi = FF_INFO[spec.ff];
  const inCombo = (c: number) => (nIn ? c.toString(2).padStart(nIn, "0") : "");

  return (
    <div className="logic seq">
      <p className="math-lead">
        Projeto de circuito com memória: contador ou máquina de estados. Você descreve os estados e para onde cada um vai. O programa monta a tabela de excitação dos flip-flops, reduz com Karnaugh e monta o circuito.
      </p>

      <section className="card logic-step">
        <h3>
          <span className="step-n">1</span> Enunciado e escolhas
        </h3>
        <label className="logic-lbl">
          O que o circuito deve fazer
          <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex.: contador de 0 a 5 que volta a 0." />
        </label>
        <div className="logic-row">
          <label className="logic-lbl">
            Número de estados
            <select value={spec.nStates} onChange={(e) => resize(Number(e.target.value), nIn)}>
              {Array.from({ length: 15 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} estados ({Math.max(1, Math.ceil(Math.log2(n)))} flip-flop{n > 2 ? "s" : ""})
                </option>
              ))}
            </select>
          </label>
          <label className="logic-lbl">
            Entradas
            <select value={nIn} onChange={(e) => resize(spec.nStates, Number(e.target.value))}>
              <option value={0}>0 (contador livre)</option>
              <option value={1}>1 (X)</option>
              <option value={2}>2 (X, Y)</option>
            </select>
          </label>
          <label className="logic-lbl">
            Tipo de flip-flop
            <select value={spec.ff} onChange={(e) => setSpec({ ...spec, ff: e.target.value as FFKind })}>
              <option value="D">D</option>
              <option value="T">T</option>
              <option value="JK">JK</option>
            </select>
          </label>
        </div>
        <div className="logic-ex">
          {SEQ_EXAMPLES.map((e) => (
            <button key={e.id} className="chip" onClick={() => example(e)}>
              {e.title}
            </button>
          ))}
        </div>
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">2</span> Tabela de estados
        </h3>
        <p className="math-note">
          Cada estado ganha um código binário em ordem (S0 = {"0".repeat(Math.max(1, Math.ceil(Math.log2(spec.nStates))))}, S1, S2...). O estado inicial é S0. Escolha o próximo estado para cada entrada.
          {spec.nStates & (spec.nStates - 1) ? " Os códigos que sobram não são usados e viram X (tanto faz) nos mapas." : ""} Saída de Moore: depende só do estado. Toque na célula para trocar 0 e 1.
        </p>
        <div className="table-scroll math-table">
          <table className="tt">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Código {res.ok ? res.bits.join("") : ""}</th>
                {Array.from({ length: combos }, (_, c) => (
                  <th key={c}>{nIn ? `${spec.inputs.join("")} = ${inCombo(c)}` : "Próximo"}</th>
                ))}
                {spec.outputs.map((o, oi) => (
                  <th key={oi}>
                    <input className="out-name-in" value={o.name} onChange={(e) => renameOut(oi, e.target.value)} aria-label="Nome da saída" />
                    <button className="link-btn" onClick={() => delOut(oi)} aria-label={`Remover saída ${o.name}`}>
                      ×
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.next.map((row, s) => (
                <tr key={s}>
                  <td>
                    <b>S{s}</b>
                  </td>
                  <td>{res.ok ? res.codes[s] : ""}</td>
                  {row.map((v, c) => (
                    <td key={c}>
                      <select className="st-sel" value={v} onChange={(e) => setNext(s, c, Number(e.target.value))} aria-label={`Próximo estado de S${s}`}>
                        {Array.from({ length: spec.nStates }, (_, k) => (
                          <option key={k} value={k}>
                            S{k}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  {spec.outputs.map((o, oi) => (
                    <td key={oi}>
                      <button className={`tt-cell v${o.byState[s]}`} onClick={() => toggleOut(oi, s)}>
                        {o.byState[s]}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {spec.outputs.length < 3 && (
          <button className="btn" onClick={addOut}>
            Adicionar saída
          </button>
        )}
      </section>

      {!res.ok ? (
        <p className="math-error">{res.error}</p>
      ) : (
        <>
          <section className="card logic-step">
            <h3>
              <span className="step-n">3</span> Tabela de excitação do {ffi.title}
            </h3>
            <p className="math-note">
              {ffi.rule} Tabela do flip-flop (Q = bit atual, Q⁺ = bit seguinte):
            </p>
            <div className="table-scroll math-table">
              <table className="tt">
                <tbody>
                  {ffi.table.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="math-note">
              Para cada linha (estado atual e entradas), olhe o próximo estado e preencha as colunas de excitação de cada flip-flop. Os bits de estado são {res.bits.join(", ")} (a primeira letra é o bit mais pesado). Linhas de códigos não usados ficam com X.
            </p>
            <div className="table-scroll math-table">
              <table className="tt">
                <thead>
                  <tr>
                    <th>Estado</th>
                    {res.bits.map((b) => (
                      <th key={b}>{b}</th>
                    ))}
                    {spec.inputs.map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                    <th>Próximo</th>
                    {res.bits.map((b) => (
                      <th key={b}>{b}⁺</th>
                    ))}
                    {res.excitation.map((f) => (
                      <th key={f.label}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.m} className={r.state === null ? "rx" : ""}>
                      <td>{r.state === null ? "—" : `S${r.state}`}</td>
                      {r.code.split("").map((b, i) => (
                        <td key={i}>{b}</td>
                      ))}
                      {r.inp.split("").map((b, i) => (
                        <td key={i}>{b}</td>
                      ))}
                      <td>{r.nextState === null ? "X" : `S${r.nextState}`}</td>
                      {res.bits.map((_, i) => (
                        <td key={i}>{r.nextCode === null ? "X" : r.nextCode[i]}</td>
                      ))}
                      {res.excitation.map((f) => (
                        <td key={f.label}>
                          <b>{SHOW(f.vals[r.m])}</b>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card logic-step">
            <h3>
              <span className="step-n">4</span> Mapas de Karnaugh
            </h3>
            <p className="math-note">
              Um mapa para cada entrada de flip-flop. Os quadrados com X podem entrar nos grupos se ajudarem. Em cada grupo a variável que muda sai.
            </p>
            {res.excitation.map((f, i) => (
              <FnBlock key={f.label} f={f} idx={i} />
            ))}
            {res.outFns.map((f, i) => (
              <FnBlock key={f.label} f={f} idx={i} />
            ))}
          </section>

          <section className="card logic-step">
            <h3>
              <span className="step-n">5</span> Equações finais
            </h3>
            {[...res.excitation, ...res.outFns].map((f) => (
              <Tex key={f.label} src={`${tex(f.label)} = ${f.min.tex}`} />
            ))}
            <p className="math-note">
              <span className={res.verified.ok ? "ok" : "bad"}>{res.verified.message}</span>
            </p>
          </section>

          <section className="card logic-step">
            <h3>
              <span className="step-n">6</span> Circuito
            </h3>
            <p className="math-note">
              Um clock, {res.nBits} flip-flop{res.nBits > 1 ? "s" : ""} {spec.ff}, portas E e OU para cada equação{nIn ? ", chaves para as entradas" : ""} e LEDs para os bits de estado e as saídas. Os flip-flops começam em S0. As portas usam Q e Q negado dos flip-flops.
            </p>
            <div className="logic-row">
              <label className="logic-lbl">
                Frequência do clock (Hz)
                <input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="decimal" />
              </label>
            </div>
            <div className="logic-actions">
              <button className="btn primary" onClick={place}>
                Montar este circuito no quadro
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
