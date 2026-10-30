import { useMemo } from "react";
import { useScopes } from "../scopes";
import { useLive, sim } from "../live";
import { useUi } from "../ui";
import { Icon } from "../components/Icon";

export function useScopeSignalList() {
  const scopes = useScopes();
  return useMemo(() => [...new Set(scopes.flatMap((s) => s.sigs))], [scopes]);
}

export function NoData({ what }: { what: string }) {
  const status = useLive((s) => s.status);
  const setPage = useUi((s) => s.setPage);
  return (
    <div className="page-empty">
      <h2>{what}</h2>
      <p>Ainda não há dados. Rode a simulação para ver os resultados aqui.</p>
      <div className="empty-actions">
        <button className="btn primary" onClick={() => sim.play()} disabled={status === "running"}>
          <Icon name="play" /> Simular
        </button>
        <button className="btn" onClick={() => setPage("montagem")}>
          Voltar à montagem
        </button>
      </div>
    </div>
  );
}

/** Agrupa sinais pela unidade, para que grandezas diferentes não dividam o mesmo eixo. */
export function groupByUnit(sigs: number[], signals: { unit: string }[]): { unit: string; sigs: number[] }[] {
  const m = new Map<string, number[]>();
  for (const i of sigs) {
    const u = signals[i]?.unit ?? "";
    if (!m.has(u)) m.set(u, []);
    m.get(u)!.push(i);
  }
  return [...m.entries()].map(([unit, list]) => ({ unit, sigs: list }));
}
