import { useLive } from "../live";
import { useProject } from "../store";
import { useDiag } from "../diagnostics";
import { fmtNum } from "../util";

const TXT = { idle: "Pronto", running: "Simulação em execução", paused: "Simulação pausada", finished: "Simulação concluída", error: "Erro na simulação" } as const;

export function StatusBar() {
  const status = useLive((s) => s.status);
  const t = useLive((s) => s.t);
  const tf = useLive((s) => s.tf);
  const steps = useLive((s) => s.steps);
  const solver = useProject((s) => s.project.simulation.solver);
  const projTf = useProject((s) => s.project.simulation.tf);
  const diag = useDiag((s) => s.list);
  const errs = diag.filter((d) => d.severity === "error").length;
  return (
    <footer className="statusbar">
      <span className={`dot ${status}`} aria-hidden="true" />
      <strong>{TXT[status]}</strong>
      <span className="sep" />
      <span>Método: {solver === "rk45" ? "RK45" : solver === "rk4" ? "RK4" : "Euler"}</span>
      <span className="sep" />
      <span>
        Tempo: {fmtNum(t, 4)} s / {fmtNum(status === "idle" ? projTf : tf)} s
      </span>
      {steps > 0 && (
        <>
          <span className="sep" />
          <span>Passos: {steps.toLocaleString("pt-BR")}</span>
        </>
      )}
      {errs > 0 && (
        <>
          <span className="sep" />
          <span className="st-err">
            {errs} {errs === 1 ? "pendência" : "pendências"} no modelo
          </span>
        </>
      )}
      <span className="grow" />
      <span>Cálculo no seu navegador</span>
      <span className="sep" />
      <span>UFCI Simulator v0.1</span>
    </footer>
  );
}
