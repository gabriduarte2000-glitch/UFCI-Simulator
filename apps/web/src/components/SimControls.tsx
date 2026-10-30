import { useState } from "react";
import type { SolverId } from "@ufci/engine";
import { useLive, sim } from "../live";
import { useProject } from "../store";
import { fmtNum } from "../util";
import { Icon } from "./Icon";
import { LiveInputs } from "./LiveInputs";
import { useTimeUnit, TIME_UNITS } from "../timeunit";

const SPEEDS: { v: number; label: string }[] = [
  { v: 0.25, label: "0,25×" },
  { v: 0.5, label: "0,5×" },
  { v: 1, label: "1×" },
  { v: 2, label: "2×" },
  { v: 5, label: "5×" },
  { v: 1000, label: "Máxima" },
];

function Config() {
  const unit = useTimeUnit();
  const sc = useProject((s) => s.project.simulation);
  const setSim = useProject((s) => s.setSim);
  const [open, setOpen] = useState(true);
  const num = (key: "t0" | "tf" | "h" | "rtol" | "atol", label: string, unit?: string) => (
    <label className="cfg-row" key={key}>
      <span>
        {label}
        {unit && <em> ({unit})</em>}
      </span>
      <input
        className="input"
        defaultValue={String(sc[key])}
        key={`${key}-${sc[key]}`}
        inputMode="decimal"
        onBlur={(e) => {
          const v = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(v) && v !== sc[key] && (key === "t0" || v > 0)) setSim({ [key]: v });
          else e.target.value = String(sc[key]);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
  return (
    <div className="config">
      <button className="cfg-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Configuração da simulação</span>
        <Icon name={open ? "chevronUp" : "chevron"} size={14} />
      </button>
      {open && (
        <div className="cfg-body">
          <label className="cfg-row">
            <span>Método</span>
            <select className="input" value={sc.solver} onChange={(e) => setSim({ solver: e.target.value as SolverId })}>
              <option value="rk45">RK45 (passo adaptativo)</option>
              <option value="rk4">RK4 (passo fixo)</option>
              <option value="euler">Euler (didático)</option>
            </select>
          </label>
          <label className="cfg-row">
            <span>Unidade de tempo</span>
            <select className="input" value={unit} onChange={(e) => setSim({ timeUnit: e.target.value as "s" | "min" | "h" | "dia" })}>
              {TIME_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          {num("t0", "Início", unit)}
          {num("tf", "Fim", unit)}
          {sc.solver !== "rk45" ? num("h", "Passo", unit) : num("rtol", "Tolerância relativa")}
          {sc.solver === "rk45" && num("atol", "Tolerância absoluta")}
          <small className="hint">Mudar a configuração reinicia a simulação. A unidade de tempo só muda os rótulos: os blocos de processo usam segundos nas suas equações.</small>
        </div>
      )}
    </div>
  );
}

export function SimControls() {
  const unit = useTimeUnit();
  const status = useLive((s) => s.status);
  const t = useLive((s) => s.t);
  const t0 = useLive((s) => s.t0);
  const tf = useLive((s) => s.tf);
  const speed = useLive((s) => s.speed);
  const projTf = useProject((s) => s.project.simulation.tf);
  const projT0 = useProject((s) => s.project.simulation.t0);
  const end = status === "idle" ? projTf : tf;
  const start = status === "idle" ? projT0 : t0;
  const pct = end > start ? Math.min(100, Math.max(0, ((status === "idle" ? start : t) - start) / (end - start)) * 100) : 0;
  const running = status === "running";
  const canPause = running;
  return (
    <section className="controls" aria-label="Controles da simulação">
      <h2 className="panel-title">Controles de simulação</h2>
      <div className="ctl-buttons">
        <button className="btn primary" onClick={() => (running ? sim.pause() : sim.play())}>
          <Icon name={running ? "pause" : "play"} /> {running ? "Pausar" : status === "paused" ? "Continuar" : "Simular"}
        </button>
        <button className="btn" disabled={status === "idle"} onClick={() => sim.stop()}>
          <Icon name="stop" /> Parar
        </button>
        <button className="btn wide" disabled={status === "idle"} onClick={() => sim.restart()}>
          <Icon name="restart" /> Reiniciar
        </button>
      </div>
      <div className="time-block">
        <div className="time-row">
          <span>Tempo de simulação</span>
          <b>
            {fmtNum(status === "idle" ? start : t, 4)} {unit}
          </b>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={start} aria-valuemax={end} aria-valuenow={t}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="time-ends">
          <span>{fmtNum(start)} {unit}</span>
          <span>{fmtNum(end)} {unit}</span>
        </div>
      </div>
      <label className="cfg-row speed">
        <span>Velocidade</span>
        <select className="input" value={speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <small className="hint">A velocidade só muda o ritmo na tela. O resultado numérico é o mesmo.</small>
      <LiveInputs />
      <Config />
      {!canPause && status === "finished" && <small className="hint ok">Simulação concluída. Clique em Reiniciar para rodar de novo.</small>}
    </section>
  );
}
