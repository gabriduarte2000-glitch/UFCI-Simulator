// Lógica digital passo a passo: enunciado, tabela, formas canônicas, mapa de Karnaugh, equação mínima e circuito.
// Três pontos de partida: equação, tabela-verdade ou o circuito montado no quadro.

import { useMemo, useState } from "react";
import {
  buildLogicCircuit,
  canonical,
  circuitTable,
  getDef,
  kmapLayout,
  logicIO,
  minimize,
  parseLogic,
  sopScene,
  verifyMin,
  type Cell,
  type KMap,
  type Minimized,
} from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Tex } from "../components/Tex";
import { SceneSvg } from "../components/DatasheetDialog";

const NAMES = ["A", "B", "C", "D", "E"];
const COLORS = ["#e5484d", "#2f7df6", "#2fb36b", "#e39b1c", "#9b59d0", "#16a6b6", "#d6409f", "#7a8b99"];
const SHOW = (c: Cell) => (c === 2 ? "X" : String(c));

const EXAMPLES: { title: string; vars: number; text: string; goal: string }[] = [
  { title: "Maioria de 3", vars: 3, text: "S = AB + AC + BC", goal: "A saída fica em 1 quando pelo menos duas das três entradas valem 1 (votação por maioria)." },
  { title: "Alarme", vars: 3, text: "S = A'B + AC", goal: "Alarme: dispara se a porta (B) está aberta com o sistema desarmado (A = 0), ou se o sensor (C) atua com o sistema armado (A = 1)." },
  { title: "Detector 4 bits", vars: 4, text: "S = A'B'C'D + A'BC'D + ABC'D + AB'C'D + A'B'CD'", goal: "Saída 1 para algumas combinações de 4 bits." },
  { title: "Paridade", vars: 3, text: "S = A ^ B ^ C", goal: "Saída 1 quando o número de entradas em 1 é ímpar. Não reduz: o mapa fica em xadrez." },
];

function KMapSvg({ vars, vals, m, kind }: { vars: string[]; vals: Cell[]; m: Minimized; kind: "sop" | "pos" }) {
  const k: KMap = useMemo(() => kmapLayout(vars), [vars]);
  const cs = 46;
  const lx = 64;
  const ly = 40;
  const pw = k.colCodes.length * cs;
  const ph = k.rowCodes.length * cs;
  const gap = 28;
  const planes = k.cells.length;
  const W = lx + planes * pw + (planes - 1) * gap + 12;
  const H = ly + ph + 14 + (planes > 1 ? 16 : 0);
  const cellGroups = (idx: number) => m.groups.map((g, gi) => (g.cells.includes(idx) ? gi : -1)).filter((x) => x >= 0);
  return (
    <svg className="kmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de Karnaugh">
      {k.cells.map((plane, pi) => {
        const ox = lx + pi * (pw + gap);
        return (
          <g key={pi}>
            {k.planeVar && (
              <text x={ox + pw / 2} y={12} textAnchor="middle" className="km-plane">
                {k.planeVar} = {pi}
              </text>
            )}
            <text x={ox - 6} y={ly - 22} textAnchor="end" className="km-corner">
              {k.rowVars.join("")}\{k.colVars.join("")}
            </text>
            {k.colCodes.map((c, ci) => (
              <text key={ci} x={ox + ci * cs + cs / 2} y={ly - 8} textAnchor="middle" className="km-head">
                {c}
              </text>
            ))}
            {k.rowCodes.map((r, ri) => (
              <text key={ri} x={ox - 8} y={ly + ri * cs + cs / 2 + 4} textAnchor="end" className="km-head">
                {r}
              </text>
            ))}
            {plane.map((row, ri) =>
              row.map((idx, ci) => {
                const x = ox + ci * cs;
                const y = ly + ri * cs;
                const v = vals[idx];
                const gs = cellGroups(idx);
                return (
                  <g key={`${ri}-${ci}`}>
                    <rect x={x} y={y} width={cs} height={cs} className="km-cell" />
                    {gs.map((gi, n) => (
                      <rect
                        key={gi}
                        x={x + 3 + n * 4}
                        y={y + 3 + n * 4}
                        width={cs - 6 - n * 8}
                        height={cs - 6 - n * 8}
                        rx={9}
                        fill={COLORS[gi % COLORS.length]}
                        fillOpacity={0.16}
                        stroke={COLORS[gi % COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                    <text x={x + 4} y={y + 11} textAnchor="start" className="km-idx">
                      {idx}
                    </text>
                    <text x={x + cs / 2} y={y + cs / 2 + 6} textAnchor="middle" className={`km-val v${v}`}>
                      {SHOW(v)}
                    </text>
                  </g>
                );
              }),
            )}
          </g>
        );
      })}
      <title>{kind === "sop" ? "Grupos de 1" : "Grupos de 0"}</title>
    </svg>
  );
}

function bitsOf(m: number, n: number) {
  return m.toString(2).padStart(n, "0");
}

function Steps({ vars, vals, out, kind, setKind }: { vars: string[]; vals: Cell[]; out: string; kind: "sop" | "pos"; setKind: (k: "sop" | "pos") => void }) {
  const n = vars.length;
  const can = useMemo(() => canonical(vars, vals), [vars, vals]);
  const min = useMemo(() => minimize(vars, vals, kind), [vars, vals, kind]);
  const ver = useMemo(() => verifyMin(vars, vals, min), [vars, vals, min]);
  const scene = useMemo(() => (kind === "sop" ? sopScene(vars, min, out) : null), [vars, min, kind, out]);
  const ones = can.sum.length;
  const zeros = can.prod.length;
  const care = kind === "sop" ? "1" : "0";
  const sym = kind === "sop" ? "soma de produtos" : "produto de somas";
  const texVar = (s: string) => s.replace(/(\d+)/g, "_{$1}");
  const mT = (list: number[]) => (list.length ? `\\sum m(${list.join(",")})` : "0");
  const MT = (list: number[]) => (list.length ? `\\prod M(${list.join(",")})` : "1");

  const place = () => {
    if (kind !== "sop") return;
    const st = useProject.getState();
    if (st.project.components.length > 0 && !window.confirm("Montar no lugar do projeto atual? Salve o atual em arquivo antes se quiser guardá-lo.")) return;
    st.replaceProject(buildLogicCircuit(`Lógica ${out}`, vars, [{ name: out, min }]));
    st.setNotice("Circuito montado a partir da equação mínima. Use as chaves de entrada e veja o LED.");
    useUi.getState().setPage("montagem");
  };

  return (
    <>
      <section className="card logic-step">
        <h3>
          <span className="step-n">2</span> Tabela-verdade
        </h3>
        <p className="math-note">
          {n} entradas dão {1 << n} linhas. Saída = 1 em {ones} linha{ones === 1 ? "" : "s"}, 0 em {zeros}
          {can.dc.length ? `, indiferente (X) em ${can.dc.length}` : ""}. A coluna m é o número da linha, lendo as entradas em binário.
        </p>
        <div className="table-scroll math-table">
          <table className="tt">
            <thead>
              <tr>
                <th>m</th>
                {vars.map((v) => (
                  <th key={v}>{v}</th>
                ))}
                <th>{out}</th>
              </tr>
            </thead>
            <tbody>
              {vals.map((v, m) => (
                <tr key={m} className={v === 1 ? "r1" : v === 2 ? "rx" : ""}>
                  <td>{m}</td>
                  {bitsOf(m, n)
                    .split("")
                    .map((b, i) => (
                      <td key={i}>{b}</td>
                    ))}
                  <td>
                    <b>{SHOW(v)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">3</span> Formas canônicas
        </h3>
        <p className="math-note">
          Soma de mintermos: um produto para cada linha com saída 1. Produto de maxtermos: uma soma para cada linha com saída 0. Ainda não está reduzida.
        </p>
        <Tex src={`${out} = ${mT(can.sum)}${can.dc.length ? ` + d(${can.dc.join(",")})` : ""}`} />
        <p className="logic-mono">
          {out} = {can.sumText}
        </p>
        <Tex src={`${out} = ${MT(can.prod)}${can.dc.length ? ` \\cdot d(${can.dc.join(",")})` : ""}`} />
        <p className="logic-mono">
          {out} = {can.prodText}
        </p>
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">4</span> Mapa de Karnaugh
        </h3>
        <div className="seg small" role="tablist" aria-label="Tipo de redução">
          <button className={kind === "sop" ? "on" : ""} onClick={() => setKind("sop")}>
            Agrupar os 1 (soma de produtos)
          </button>
          <button className={kind === "pos" ? "on" : ""} onClick={() => setKind("pos")}>
            Agrupar os 0 (produto de somas)
          </button>
        </div>
        <p className="math-note">
          Cada quadrado é uma linha da tabela (número pequeno no canto). As linhas e colunas seguem o código Gray: de um quadrado para o vizinho muda um bit só. Por isso as bordas se
          encostam (a primeira coluna é vizinha da última). Agrupe os {care} em retângulos de 1, 2, 4, 8 ou 16 quadrados, os maiores possíveis. X pode entrar no grupo se ajudar.
        </p>
        <div className="kmap-wrap">
          <KMapSvg vars={vars} vals={vals} m={min} kind={kind} />
        </div>
        {min.constant !== null ? (
          <p className="math-note">A função é constante: {out} = {min.constant}.</p>
        ) : (
          <>
            <h4 className="logic-h4">Leitura dos grupos</h4>
            <p className="math-note">
              Em cada grupo, a variável que muda de valor sai. As que não mudam ficam{kind === "sop" ? ": valor 1 vira a letra, valor 0 vira a letra com apóstrofo (')" : ": no grupo de zeros, valor 0 vira a letra e valor 1 vira a letra com apóstrofo no fator"}.
            </p>
            <ol className="group-list">
              {min.groups.map((g, i) => (
                <li key={i} style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                  <div className="g-head">
                    <b>Grupo {i + 1}</b> · {g.cells.length} quadrados ({g.cells.join(", ")}){g.essential ? " · essencial" : ""}
                  </div>
                  <div className="g-why">{g.why}</div>
                  <div className="g-res">
                    {kind === "sop" ? "Termo" : "Fator"}: <Tex src={g.tex} display={false} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="math-note">
              Havia {min.primeCount} grupo{min.primeCount === 1 ? "" : "s"} possível{min.primeCount === 1 ? "" : "is"} (implicantes primos). Ficam os essenciais, que cobrem um quadrado que nenhum outro cobre, e os
              necessários para cobrir o resto.
            </p>
          </>
        )}
      </section>

      <section className="card logic-step">
        <h3>
          <span className="step-n">5</span> Equação final
        </h3>
        <Tex src={`${out} = ${min.tex}`} />
        <p className="logic-mono">
          {out} = {min.text}
        </p>
        <p className="math-note">
          {min.constant === null ? `Forma ${sym} com ${min.groups.length} ${kind === "sop" ? "termo" : "fator"}${min.groups.length === 1 ? "" : "s"} e ${min.literalCount} letra${min.literalCount === 1 ? "" : "s"}.` : "Constante."}{" "}
          <span className={ver.ok ? "ok" : "bad"}>{ver.ok ? "Conferido linha por linha com a tabela: igual." : `Diferente da tabela nas linhas ${ver.bad.join(", ")}.`}</span>
        </p>
        {kind === "pos" && <p className="math-note">Para montar com portas, use a soma de produtos. Na soma de produtos o circuito é E seguido de OU.</p>}
      </section>

      {scene && (
        <section className="card logic-step">
          <h3>
            <span className="step-n">6</span> Circuito
          </h3>
          <p className="math-note">
            Cada variável tem um fio e um fio invertido (porta NÃO). Cada termo vira uma porta E. Os termos entram numa porta OU.{" "}
            {min.constant === null ? `Portas: ${min.groups.filter((g) => g.literals.length > 1).length} E, ${min.groups.length > 1 ? "1 OU" : "sem OU"}, ${new Set(min.groups.flatMap((g) => g.literals.filter((l) => l.neg).map((l) => l.name))).size} NÃO.` : ""}
          </p>
          <div className="scene-wrap">
            <SceneSvg scene={scene} />
          </div>
          <div className="logic-actions">
            <button className="btn primary" onClick={place}>
              Montar este circuito no quadro
            </button>
          </div>
        </section>
      )}
      <span hidden>{texVar("")}</span>
    </>
  );
}

export default function LogicPanel() {
  const project = useProject((s) => s.project);
  const [goal, setGoal] = useState("");
  const [nVars, setNVars] = useState(3);
  const [out, setOut] = useState("S");
  const [vals, setVals] = useState<Cell[]>(Array(8).fill(0));
  const [eq, setEq] = useState("S = A'B + AC");
  const [eqErr, setEqErr] = useState("");
  const [kind, setKind] = useState<"sop" | "pos">("sop");
  const [circErr, setCircErr] = useState("");
  const [circInfo, setCircInfo] = useState<{ warnings: string[]; parts: { label: string; n: number }[] } | null>(null);
  const [vars, setVars] = useState<string[]>(["A", "B", "C"]);
  const [started, setStarted] = useState(false);

  const resize = (n: number) => {
    setNVars(n);
    setVars(NAMES.slice(0, n));
    setVals(Array(1 << n).fill(0));
    setStarted(true);
  };

  const applyEq = (text = eq) => {
    const eqName = text.includes("=") ? text.split("=")[0].trim() : "";
    const p = parseLogic(text);
    if (!p.ok) return setEqErr(p.error);
    if (p.vars.length < 2) return setEqErr("Use pelo menos duas variáveis.");
    setEqErr("");
    setVars(p.vars);
    setNVars(p.vars.length);
    setVals(p.vals);
    if (eqName && /^[A-Za-z][A-Za-z0-9]*$/.test(eqName)) setOut(eqName.toUpperCase());
    setStarted(true);
  };

  const readCircuit = () => {
    setCircErr("");
    setCircInfo(null);
    try {
      const io = logicIO(project, (t) => getDef(t)?.label ?? t);
      if (io.inputs.length < 2) return setCircErr("O quadro precisa de pelo menos 2 chaves de entrada (Digital > Chave).");
      if (io.inputs.length > 5) return setCircErr("Use no máximo 5 chaves de entrada.");
      const o = io.outputs.find((x) => x.led) ?? io.outputs[0];
      if (!o) return setCircErr("Não achei saída. Ligue um LED à porta que dá o resultado.");
      const t = circuitTable(project, io.inputs.map((i) => i.id), o.signal);
      const names = io.inputs.map((i, k) => (/^[A-Za-z][0-9]*$/.test(i.label) ? i.label.toUpperCase() : NAMES[k]));
      setVars(names.length === new Set(names).size ? names : NAMES.slice(0, names.length));
      setNVars(names.length);
      setVals(t);
      setOut(/^[A-Za-z][A-Za-z0-9]*$/.test(o.label) ? o.label.toUpperCase() : "S");
      setCircInfo({ warnings: io.warnings, parts: io.parts });
      setStarted(true);
    } catch (e) {
      setCircErr(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (m: number) => {
    setVals((v) => v.map((x, i) => (i === m ? (((x + 1) % 3) as Cell) : x)));
    setStarted(true);
  };

  const example = (e: (typeof EXAMPLES)[number]) => {
    setGoal(e.goal);
    setEq(e.text);
    applyEq(e.text);
  };

  const hasData = started;

  return (
    <div className="logic">
      <p className="math-lead">
        Aqui a matemática do circuito digital é a lógica: enunciado, tabela-verdade, mapa de Karnaugh, equação mínima e circuito. Comece pelo que você tem: o enunciado e a tabela, uma equação, ou o circuito já
        montado no quadro.
      </p>

      <section className="card logic-step">
        <h3>
          <span className="step-n">1</span> Enunciado e entradas
        </h3>
        <label className="logic-lbl">
          O que o circuito deve fazer
          <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex.: o alarme dispara se a porta está aberta com o sistema desarmado, ou se o sensor atua com o sistema armado." />
        </label>

        <div className="logic-row">
          <label className="logic-lbl">
            Número de entradas
            <select value={nVars} onChange={(e) => resize(Number(e.target.value))}>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} ({1 << n} linhas)
                </option>
              ))}
            </select>
          </label>
          <label className="logic-lbl">
            Nome da saída
            <input value={out} maxLength={6} onChange={(e) => setOut(e.target.value.toUpperCase() || "S")} />
          </label>
        </div>

        <div className="logic-sources">
          <div className="logic-src">
            <b>A) Pela tabela</b>
            <p className="math-note">Toque nas células da coluna {out} da tabela abaixo (0, 1 ou X). X = tanto faz (combinação que nunca ocorre).</p>
            <div className="table-scroll math-table">
              <table className="tt edit">
                <thead>
                  <tr>
                    <th>m</th>
                    {vars.map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                    <th>{out}</th>
                  </tr>
                </thead>
                <tbody>
                  {vals.map((v, m) => (
                    <tr key={m}>
                      <td>{m}</td>
                      {bitsOf(m, vars.length)
                        .split("")
                        .map((b, i) => (
                          <td key={i}>{b}</td>
                        ))}
                      <td>
                        <button className={`tt-cell v${v}`} onClick={() => toggle(m)} aria-label={`Linha ${m}: saída ${SHOW(v)}. Toque para mudar.`}>
                          {SHOW(v)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="logic-src">
            <b>B) Pela equação</b>
            <p className="math-note">
              Use letras, apóstrofo (A') ou ! para NÃO, + para OU, · ou nada entre as letras para E, ^ para OU exclusivo. Exemplos: A'B + AC · (A+B)(C+D')
            </p>
            <input className="logic-eq" value={eq} onChange={(e) => setEq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyEq()} spellCheck={false} aria-label="Equação lógica" />
            {eqErr && <p className="math-error">{eqErr}</p>}
            <button className="btn" onClick={() => applyEq()}>
              Gerar a tabela da equação
            </button>
            <div className="logic-ex">
              {EXAMPLES.map((e) => (
                <button key={e.title} className="chip" onClick={() => example(e)}>
                  {e.title}
                </button>
              ))}
            </div>
          </div>

          <div className="logic-src">
            <b>C) Pelo circuito do quadro</b>
            <p className="math-note">Usa as chaves de entrada e o LED de saída do projeto aberto. O programa liga cada combinação e anota o resultado.</p>
            <button className="btn" onClick={readCircuit}>
              Ler o circuito do quadro
            </button>
            {circErr && <p className="math-error">{circErr}</p>}
            {circInfo && (
              <div className="math-note">
                {circInfo.parts.length > 0 && <p>Componentes lidos: {circInfo.parts.map((p) => `${p.n}× ${p.label}`).join(", ")}.</p>}
                {circInfo.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {hasData && (
        <>
          {goal.trim() && (
            <p className="logic-goal">
              <b>Objetivo:</b> {goal.trim()}
            </p>
          )}
          <Steps vars={vars} vals={vals} out={out} kind={kind} setKind={setKind} />
        </>
      )}
      {!hasData && <p className="math-note">Escolha uma das três formas acima para ver o passo a passo.</p>}
    </div>
  );
}
