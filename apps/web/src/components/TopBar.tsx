import { useRef, useState } from "react";
import { useProject } from "../store";
import { useLive, sim } from "../live";
import { download, fmtNum, projectToFile, safeName } from "../util";
import { Icon } from "./Icon";
import { useUi, type Page } from "../ui";
import { useAssist } from "../assistant";
import { useTimeUnit } from "../timeunit";

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: "montagem", label: "Montagem", icon: "build" },
  { id: "dashboard", label: "Dashboard", icon: "dash" },
  { id: "graficos", label: "Gráficos", icon: "chartLine" },
  { id: "tabelas", label: "Tabelas", icon: "table" },
  { id: "indicadores", label: "Indicadores", icon: "gauge" },
  { id: "math", label: "Matemática", icon: "sigma" },
];

export function TopBar() {
  const name = useProject((s) => s.project.meta.name);
  const status = useLive((s) => s.status);
  const t = useLive((s) => s.t);
  const file = useRef<HTMLInputElement>(null);
  const running = status === "running";
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  const unit = useTimeUnit();
  const [menu, setMenu] = useState(false);

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
          <div className="brand-sub">Controle e sistemas físicos</div>
        </div>
      </div>
      <nav className="page-nav" aria-label="Páginas">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? "on" : ""} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
            <Icon name={p.icon} size={15} /> <span>{p.label}</span>
          </button>
        ))}
      </nav>
      <label className="project-name">
        <span>Projeto:</span>
        <input value={name} onChange={(e) => useProject.getState().setName(e.target.value)} aria-label="Nome do projeto" />
      </label>
      <div className="more-wrap">
        <button className="btn icon" aria-label="Mais ações" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <Icon name="more" />
        </button>
        {menu && (
          <>
            <div className="menu-scrim" onClick={() => setMenu(false)} />
            <div className="menu" role="menu" onClick={() => setMenu(false)}>
              <button role="menuitem" onClick={() => confirmReplace() && useProject.getState().newProject()}>
                <Icon name="file" /> Novo projeto
              </button>
              <button role="menuitem" onClick={() => file.current?.click()}>
                <Icon name="open" /> Abrir arquivo
              </button>
              <button role="menuitem" onClick={() => useAssist.getState().setOpen(true)}>
                <Icon name="sparkle" /> Assistente
              </button>
              <button role="menuitem" onClick={() => useUi.getState().setCloudOpen(true)}>
                <Icon name="cloud" /> Nuvem
              </button>
              <button role="menuitem" onClick={() => download(`${safeName(name)}.ufci.json`, projectToFile(useProject.getState().project))}>
                <Icon name="save" /> Salvar em arquivo
              </button>
            </div>
          </>
        )}
      </div>
      <div className="top-actions">
        <button className="btn" title="Novo projeto" onClick={() => confirmReplace() && useProject.getState().newProject()}>
          <Icon name="file" /> <span className="lbl">Novo</span>
        </button>
        <button className="btn" title="Abrir arquivo de projeto" onClick={() => file.current?.click()}>
          <Icon name="open" /> <span className="lbl">Abrir</span>
        </button>
        <button className="btn" onClick={() => download(`${safeName(name)}.ufci.json`, projectToFile(useProject.getState().project))} title="Baixa o projeto como arquivo. Guarde uma cópia: é o seu backup.">
          <Icon name="save" /> <span className="lbl">Salvar</span>
        </button>
        <button className="btn assist-btn" title="Assistente: tira dúvidas e confere a montagem" onClick={() => useAssist.getState().setOpen(!useAssist.getState().open)}>
          <Icon name="sparkle" /> <span className="lbl">Assistente</span>
        </button>
        <button className="btn" title="Salvar e abrir projetos na nuvem" onClick={() => useUi.getState().setCloudOpen(true)}>
          <Icon name="cloud" /> <span className="lbl">Nuvem</span>
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
          <Icon name={running ? "pause" : "play"} /> <span className="run-lbl">{running ? "Pausar" : status === "paused" ? "Continuar" : "Simular"}</span>
        </button>
        <button className="btn icon stop" disabled={status === "idle"} onClick={() => sim.stop()} title="Parar e voltar ao início" aria-label="Parar">
          <Icon name="stop" />
        </button>
        <div className="time-chip" aria-live="off">
          <span className="time-lbl">Tempo: </span>{" "}
          {fmtNum(t, 4)} {unit}
        </div>
      </div>
    </header>
  );
}
