import { useMemo } from "react";
import { useProject } from "../store";
import { fmtNum } from "../util";

/** Controles deslizantes das entradas manuais. Mudam o sistema com a simulação rodando. */
export function LiveInputs({ inline = false }: { inline?: boolean }) {
  const all = useProject((s) => s.project.components);
  const set = useProject((s) => s.setParam);
  const comps = useMemo(() => all.filter((c) => c.type === "signal.manual"), [all]);
  if (!comps.length) return null;
  return (
    <div className={`manuals ${inline ? "inline" : ""}`}>
      {!inline && <div className="card-title">Entradas ao vivo</div>}
      {comps.map((c) => {
        const lo = Number(c.params.min?.value ?? -1),
          hi = Number(c.params.max?.value ?? 1),
          v = Number(c.params.value?.value ?? 0);
        return (
          <label key={c.id} className="manual">
            <span>
              {c.label} <b>{fmtNum(v, 3)}</b>
            </span>
            <input type="range" className="slider" min={lo} max={hi} step={(hi - lo) / 200} value={Math.min(hi, Math.max(lo, v))} onChange={(e) => set(c.id, "value", Number(e.target.value))} />
          </label>
        );
      })}
    </div>
  );
}
