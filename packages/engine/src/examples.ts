// Projetos de exemplo para começar.

import { newComponent } from "./components/registry";
import "./components";
import { emptyProject } from "./project";
import type { ProjectIR } from "./types";

type P = Record<string, number | string | boolean>;

export function build(
  name: string,
  comps: { id: string; type: string; label?: string; params?: P; pos: [number, number] }[],
  conns: [string, string, string, string][],
  sim?: Partial<ProjectIR["simulation"]>,
): ProjectIR {
  const p = emptyProject(name);
  for (const c of comps) {
    const inst = newComponent(c.type, c.id, c.label);
    for (const [k, v] of Object.entries(c.params ?? {})) inst.params[k] = { ...inst.params[k], value: v };
    p.components.push(inst);
    p.layout!.positions[c.id] = { x: c.pos[0], y: c.pos[1] };
  }
  conns.forEach(([a, ap, b, bp], i) =>
    p.connections.push({ id: `w${i + 1}`, from: { component: a, port: ap }, to: { component: b, port: bp } }),
  );
  p.simulation = { ...p.simulation, ...sim };
  return p;
}

/** Malha fechada: degrau → soma → PID → planta de 2ª ordem → realimentação. */
export function examplePidLoop(): ProjectIR {
  return build(
    "Malha fechada com PID",
    [
      { id: "ref", type: "signal.step", label: "Referência", params: { t_step: 1, v0: 0, v1: 1 }, pos: [0, 120] },
      { id: "soma", type: "math.sum", label: "Erro", params: { signs: "+-" }, pos: [220, 120] },
      { id: "pid", type: "control.pid", label: "PID", params: { Kp: 8, Ki: 6, Kd: 1.5, N: 50 }, pos: [440, 120] },
      { id: "planta", type: "control.tf", label: "Planta", params: { num: "1", den: "1 3 2" }, pos: [680, 120] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [920, 120] },
    ],
    [
      ["ref", "out", "soma", "in1"],
      ["soma", "out", "pid", "in"],
      ["pid", "out", "planta", "in"],
      ["planta", "out", "soma", "in2"],
      ["planta", "out", "scope", "in1"],
      ["ref", "out", "scope", "in2"],
    ],
    { tf: 10 },
  );
}

/** Sistema de 1ª ordem com degrau, o primeiro exemplo de aula. */
export function exampleFirstOrder(): ProjectIR {
  return build(
    "Resposta de 1ª ordem",
    [
      { id: "ref", type: "signal.step", label: "Degrau", params: { t_step: 0, v1: 1 }, pos: [0, 80] },
      { id: "g", type: "control.tf", label: "G(s) = 1/(s+1)", params: { num: "1", den: "1 1" }, pos: [260, 80] },
      { id: "scope", type: "sink.scope", label: "Scope", pos: [520, 80] },
    ],
    [
      ["ref", "out", "g", "in"],
      ["g", "out", "scope", "in1"],
    ],
    { tf: 6 },
  );
}

export const EXAMPLES: { id: string; title: string; description: string; make: () => ProjectIR }[] = [
  {
    id: "first-order",
    title: "Resposta de 1ª ordem",
    description: "Degrau aplicado a G(s) = 1/(s+1). Constante de tempo de 1 s.",
    make: exampleFirstOrder,
  },
  {
    id: "pid-loop",
    title: "Malha fechada com PID",
    description: "PID controlando uma planta de 2ª ordem. Mexa nos ganhos com a simulação rodando.",
    make: examplePidLoop,
  },
];
