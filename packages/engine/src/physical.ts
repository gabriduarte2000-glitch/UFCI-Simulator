// Montador dos domínios físicos (mecânico, elétrico, eletromecânico).
// Fase 3 em diante. Por enquanto nenhum componente físico está registrado.

import type { PhysBuild, PhysCtx } from "./internal";

export function buildPhysical(_ctx: PhysCtx): PhysBuild {
  return { units: [], netSignal: new Map() };
}
