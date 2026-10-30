import { useMemo } from "react";
import { useProject } from "./store";
import { useLive } from "./live";

export interface ScopeInfo {
  id: string;
  label: string;
  /** Índices em sinais ao vivo, na ordem das portas. Vazio antes de simular. */
  sigs: number[];
  /** Quantas entradas estão ligadas (existe mesmo sem sessão). */
  wired: number;
}

export function useScopes(): ScopeInfo[] {
  const project = useProject((s) => s.project);
  const edgeSignal = useLive((s) => s.edgeSignal);
  return useMemo(() => {
    return project.components
      .filter((c) => c.type === "sink.scope")
      .map((c) => {
        const conns = project.connections.filter((w) => w.to.component === c.id).sort((a, b) => a.to.port.localeCompare(b.to.port));
        const sigs = conns.map((w) => edgeSignal[w.id]).filter((v): v is number => v !== null && v !== undefined);
        return { id: c.id, label: c.label ?? c.id, sigs, wired: conns.length };
      });
  }, [project.components, project.connections, edgeSignal]);
}
