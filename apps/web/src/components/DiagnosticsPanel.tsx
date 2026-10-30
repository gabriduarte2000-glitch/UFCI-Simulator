import { useState } from "react";
import { useDiag } from "../diagnostics";
import { useLive } from "../live";
import { useProject } from "../store";
import { Icon } from "./Icon";

export function DiagnosticsPanel() {
  const list = useDiag((s) => s.list);
  const runtime = useLive((s) => s.runtimeDiagnostics);
  const [open, setOpen] = useState(true);
  const all = [...list, ...runtime.filter((r) => !list.some((d) => d.code === r.code && d.message === r.message))];
  if (all.length === 0) return null;
  const errors = all.filter((d) => d.severity === "error").length;
  const warns = all.length - errors;
  return (
    <div className="diag-panel">
      <button className="diag-head" onClick={() => setOpen(!open)}>
        <Icon name={errors ? "err" : "warn"} />
        <span>
          {errors > 0 && `${errors} ${errors === 1 ? "erro" : "erros"}`}
          {errors > 0 && warns > 0 && " e "}
          {warns > 0 && `${warns} ${warns === 1 ? "aviso" : "avisos"}`}
        </span>
        <Icon name={open ? "chevron" : "chevronUp"} />
      </button>
      {open && (
        <ul>
          {all.map((d, i) => (
            <li
              key={i}
              className={`diag-${d.severity}`}
              onClick={() => d.componentIds?.length && useProject.getState().select([d.componentIds[0]], [])}
              title={d.componentIds?.length ? "Clique para selecionar o componente" : undefined}
            >
              {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
