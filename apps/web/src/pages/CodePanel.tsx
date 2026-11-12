// Do código para a simulação: o usuário escreve ou envia o código, o programa reconhece as situações
// possíveis e ele escolhe qual quer simular (ou descreve a sua).

import { useMemo, useRef, useState } from "react";
import { build, ladderDiagram, ladderEquations, languageWarning, LANGS, parseLadder, projectFor, recognize, type Candidate, type Lang } from "@ufci/engine";
import { useProject } from "../store";
import { useUi } from "../ui";

const EXT: Record<string, Lang> = { py: "python", m: "matlab", c: "c", h: "c", cpp: "cpp", cc: "cpp", ino: "arduino", js: "javascript", jl: "julia", r: "r", il: "ladder", st: "ladder", txt: "texto" };

type PyState = { status: "idle" | "loading" | "running" | "done" | "error"; out: string };

async function runPython(code: string, onStatus: (s: string) => void): Promise<string> {
  const w = window as unknown as { loadPyodide?: (o: object) => Promise<any> };
  if (!w.loadPyodide) {
    onStatus("Baixando o Python do navegador (cerca de 10 MB, só na primeira vez)...");
    await new Promise<void>((ok, fail) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      s.onload = () => ok();
      s.onerror = () => fail(new Error("Não consegui baixar o Python. Confira a conexão com a internet."));
      document.head.appendChild(s);
    });
  }
  const py = await w.loadPyodide!({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
  let out = "";
  py.setStdout({ batched: (t: string) => (out += t + "\n") });
  py.setStderr({ batched: (t: string) => (out += t + "\n") });
  onStatus("Carregando as bibliotecas usadas no código...");
  try {
    await py.loadPackagesFromImports(code);
  } catch {
    /* segue: a instalação pelo pip tenta de novo abaixo */
  }
  for (let tries = 0; tries < 4; tries++) {
    onStatus("Executando...");
    try {
      await py.runPythonAsync(code);
      return out.trim() || "(O código rodou e não imprimiu nada. Use print() para ver valores.)";
    } catch (e) {
      const msg = String(e);
      const m = /No module named '([\w.]+)'/.exec(msg);
      if (!m || tries === 3) return (out + msg).trim();
      onStatus(`Instalando ${m[1].split(".")[0]} pelo pip...`);
      await py.loadPackage("micropip");
      try {
        await py.pyimport("micropip").install(m[1].split(".")[0]);
      } catch {
        return `${out}Não achei o pacote “${m[1]}” para instalar no navegador.`.trim();
      }
    }
  }
  return out.trim();
}

export default function CodePanel() {
  const [lang, setLang] = useState<Lang>("python");
  const [code, setCode] = useState(LANGS[0].example);
  const [picked, setPicked] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [py, setPy] = useState<PyState>({ status: "idle", out: "" });
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const warning = useMemo(() => languageWarning(lang, code), [lang, code]);
  const ladder = useMemo(() => (lang === "ladder" ? parseLadder(code) : null), [lang, code]);
  const cands: Candidate[] = useMemo(() => {
    try {
      return recognize(code, lang);
    } catch {
      return [];
    }
  }, [code, lang]);
  const chosen = cands.find((c) => c.id === picked);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (["xlsx", "xls", "png", "jpg", "jpeg", "pdf"].includes(ext)) {
      setMsg("Este espaço lê arquivos de código e texto. Para imagem, PDF ou planilha, descreva a conta no campo da opção Sistema contínuo ou use o assistente.");
      return;
    }
    const text = await f.text();
    setCode(text);
    if (EXT[ext]) setLang(EXT[ext]);
    setPicked("");
    setMsg(`Arquivo ${f.name} lido${EXT[ext] ? ` como ${LANGS.find((l) => l.id === EXT[ext])?.label}` : ""}.`);
  };

  const open = (ir: ReturnType<typeof projectFor>, notice: string) => {
    if (!ir) return;
    const st = useProject.getState();
    if (st.project.components.length > 0 && !window.confirm("Montar no lugar do projeto atual? Salve o atual em arquivo antes se quiser guardá-lo.")) return;
    st.replaceProject(ir);
    st.setNotice(notice);
    useUi.getState().setPage("montagem");
  };

  const follow = () => {
    const ui = useUi.getState();
    if (picked === "__custom") {
      const ir = build("Expectativa do usuário", [{ id: "n1", type: "note.text", label: "Expectativa", params: { text: `Quero simular: ${custom.trim()}\n\nCódigo de partida (${lang}):\n${code.slice(0, 600)}` }, pos: [0, 0] }], [], { tf: 10, rtol: 1e-6, atol: 1e-8 });
      open(ir, "Anotei sua expectativa no quadro. Monte com os componentes da biblioteca ou peça ao assistente.");
      return;
    }
    if (!chosen) return;
    const a = chosen.action;
    if (a.kind === "tf") {
      ui.setHandoff({ kind: "tf", text: a.text });
      ui.setMathTab("equacao");
    } else if (a.kind === "ss") {
      ui.setHandoff({ kind: "ss", A: a.A, B: a.B, C: a.C, D: a.D });
      ui.setMathTab("equacao");
    } else if (a.kind === "logic") {
      ui.setHandoff({ kind: "logic", eq: a.eq });
      ui.setMathTab("logica");
    } else open(projectFor(a), `Situação montada a partir do código: ${chosen.title}. ${chosen.why}`);
  };

  const run = async () => {
    setPy({ status: "loading", out: "" });
    try {
      const out = await runPython(code, (s) => setPy({ status: "running", out: s }));
      setPy({ status: "done", out });
    } catch (e) {
      setPy({ status: "error", out: e instanceof Error ? e.message : String(e) });
    }
  };

  const canFollow = picked === "__custom" ? custom.trim().length > 3 : !!chosen;

  return (
    <div className="code-panel">
      <p className="math-lead">Escreva ou envie o código. O programa reconhece as situações possíveis e você escolhe qual quer simular. Se nenhuma servir, descreva a sua.</p>

      <section className="card code-card">
        <div className="code-bar">
          <label className="synth-field code-lang">
            <span>Linguagem</span>
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value as Lang);
                setPicked("");
              }}
              aria-label="Linguagem do código"
            >
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            onClick={() => {
              setCode(LANGS.find((l) => l.id === lang)?.example ?? "");
              setPicked("");
            }}
          >
            Exemplo
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Enviar arquivo
          </button>
          <input ref={fileRef} type="file" hidden accept=".py,.m,.c,.h,.cpp,.cc,.ino,.js,.jl,.r,.R,.il,.st,.txt,.csv" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
        </div>

        <textarea
          className="code-area"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPicked("");
          }}
          rows={12}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Código"
          placeholder="Cole ou escreva o código aqui"
        />

        {warning && (
          <div className="code-warn" role="alert">
            <span>{warning.message}</span>
            <button className="btn" onClick={() => setLang(warning.suggest)}>
              Trocar a linguagem
            </button>
          </div>
        )}
        {msg && <p className="muted code-msg">{msg}</p>}
      </section>

      {ladder && (
        <section className="card code-card">
          <h3>Diagrama ladder</h3>
          {ladder.ok ? (
            <>
              <pre className="ladder-pre">{ladderDiagram(ladder.lines)}</pre>
              <p className="muted">Equações: {ladderEquations(ladder.lines).join("   ")}</p>
              {ladder.unsupported.length > 0 && <p className="muted">Não leio memória nem tempo (S, R, TON...): {ladder.unsupported.join(", ")}.</p>}
            </>
          ) : (
            <p className="code-err">{ladder.error}</p>
          )}
        </section>
      )}

      <section className="card code-card">
        <h3>O que eu reconheci</h3>
        {cands.length === 0 ? <p className="muted">Não reconheci uma situação conhecida neste código. Descreva a sua abaixo.</p> : <p className="muted">Escolha a simulação que você espera.</p>}
        <div className="cand-list" role="radiogroup" aria-label="Situações reconhecidas">
          {cands.map((c) => (
            <label key={c.id} className={`cand ${picked === c.id ? "on" : ""}`}>
              <input type="radio" name="cand" checked={picked === c.id} onChange={() => setPicked(c.id)} />
              <span>
                <b>{c.title}</b>
                <em>{c.why}</em>
              </span>
            </label>
          ))}
          <label className={`cand ${picked === "__custom" ? "on" : ""}`}>
            <input type="radio" name="cand" checked={picked === "__custom"} onChange={() => setPicked("__custom")} />
            <span>
              <b>Outra: descrever o que eu quero simular</b>
              <em>Nenhuma das opções serve.</em>
            </span>
          </label>
        </div>
        {picked === "__custom" && <textarea className="code-custom" value={custom} onChange={(e) => setCustom(e.target.value)} rows={3} placeholder="Ex.: aquecimento de um tanque com resistência e controle liga-desliga" aria-label="Descreva a expectativa" />}
        <button className="btn primary" disabled={!canFollow} onClick={follow}>
          Seguir com esta escolha
        </button>
      </section>

      {lang === "python" && (
        <section className="card code-card">
          <h3>Executar o Python</h3>
          <p className="muted">Roda no seu navegador, com numpy, scipy, sympy, pandas e matplotlib. Bibliotecas em Python puro, como python-control, são instaladas na hora. Precisa de internet na primeira vez. Gráficos do matplotlib não aparecem aqui.</p>
          <button className="btn" onClick={run} disabled={py.status === "loading" || py.status === "running"}>
            {py.status === "loading" || py.status === "running" ? "Executando..." : "Executar"}
          </button>
          {py.out && <pre className="code-out">{py.out}</pre>}
        </section>
      )}
      {lang === "matlab" && <p className="muted code-foot">MATLAB e Octave não rodam no navegador. O programa lê o código e reconhece as situações, mas não o executa.</p>}
      <p className="muted code-foot">Este espaço não instala as bibliotecas de todas as linguagens. Ele lê padrões conhecidos do código (funções de transferência, matrizes, PID, lógica, ladder, Arduino, liga-desliga). Para outros códigos, use a opção Outra.</p>
    </div>
  );
}
