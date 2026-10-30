import { useRef } from "react";
import { useProject } from "../store";
import { useLive, sim } from "../live";
import { download, fmtNum, projectToFile, safeName } from "../util";
import { Icon } from "./Icon";

export function TopBar() {
  const name = useProject((s) => s.project.meta.name);
  const status = useLive((s) => s.status);
  const t = useLive((s) => s.t);
  const file = useRef<HTMLInputElement>(null);
  const running = status === "running";

  const confirmReplace = () => {
    const st = useProject.getState();
    return st.project.components.length === 0 || window.confirm("Substituir o projeto atual? As alterações não salvas em arquivo ficam no histórico automático do navegador apenas até o próximo projeto.");
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#16294a" />
          <path d="M5 22c4 0 4-12 8-12s4 12 8 12 3-8 6-8" fill="none" stroke="#4da3ff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <div>
          <div className="brand-name">UFCI Simulator</div>
          <div className="brand-sub">Simulador de sistemas de controle e físicos</div>
        </div>
      </div>
      <label className="project-name">
        <span>Projeto:</span>
        <input value={name} onChange={(e) => useProject.getState().setName(e.target.value)} aria-label="Nome do projeto" />
      </label>
      <div className="top-actions">
        <button className="btn" onClick={() => confirmReplace() && useProject.getState().newProject()}>
          <Icon name="file" /> Novo
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          <Icon name="open" /> Abrir
        </button>
        <button className="btn" onClick={() => download(`${safeName(name)}.ufci.json`, projectToFile(useProject.getState().project))} title="Baixa o projeto como arquivo. Guarde uma cópia: é o seu backup.">
          <Icon name="save" /> Salvar
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const err = useProject.getState().openFromText(await f.text());
            if (err) useProject.getState().setNotice(err);
          }}
        />
      </div>
      <div className="run-actions">
        <button className="btn run" onClick={() => (running ? sim.pause() : sim.play())} aria-label={running ? "Pausar" : "Simular"}>
          <Icon name={running ? "pause" : "play"} /> {running ? "Pausar" : status === "paused" ? "Continuar" : "Simular"}
        </button>
        <button className="btn icon stop" disabled={status === "idle"} onClick={() => sim.stop()} title="Parar e voltar ao início" aria-label="Parar">
          <Icon name="stop" />
        </button>
        <div className="time-chip" aria-live="off">
          Tempo: {fmtNum(t, 4)} s
        </div>
      </div>
    </header>
  );
}
