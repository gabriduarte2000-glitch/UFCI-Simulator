// Criação, validação de formato e migração do arquivo do projeto.

import { SCHEMA_VERSION, type ProjectIR } from "./types";

export function emptyProject(name = "Novo projeto"): ProjectIR {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name, createdAt: now, updatedAt: now },
    components: [],
    connections: [],
    simulation: { solver: "rk45", t0: 0, tf: 10, h: 0.01, rtol: 1e-6, atol: 1e-9 },
    layout: { positions: {} },
  };
}

export function nextId(existing: Iterable<string>, prefix: string): string {
  const used = new Set(existing);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Confere o formato de um arquivo lido de fora. Não confere a física (isso é o compilador). */
export function parseProject(raw: unknown): { ok: true; project: ProjectIR } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: "O arquivo não é um projeto do UFCI Simulator." };
  const ver = raw.schemaVersion;
  if (typeof ver !== "string") return { ok: false, error: "O arquivo não tem versão. Ele não parece ser um projeto do UFCI Simulator." };
  const major = Number(ver.split(".")[0]);
  const curMajor = Number(SCHEMA_VERSION.split(".")[0]);
  if (!Number.isFinite(major) || major > curMajor)
    return { ok: false, error: `O arquivo é da versão ${ver}, mais nova que esta (${SCHEMA_VERSION}). Atualize o simulador.` };
  if (!isObj(raw.meta) || typeof raw.meta.name !== "string") return { ok: false, error: "O projeto não tem nome." };
  if (!Array.isArray(raw.components) || !Array.isArray(raw.connections))
    return { ok: false, error: "O projeto não tem a lista de componentes ou de conexões." };
  for (const c of raw.components) {
    if (!isObj(c) || typeof c.id !== "string" || typeof c.type !== "string")
      return { ok: false, error: "Há um componente sem identificador ou sem tipo." };
    if (c.params !== undefined && !isObj(c.params)) return { ok: false, error: `Os parâmetros de ${c.id} estão em formato inválido.` };
  }
  for (const c of raw.connections) {
    if (!isObj(c) || typeof c.id !== "string" || !isObj(c.from) || !isObj(c.to))
      return { ok: false, error: "Há uma conexão em formato inválido." };
  }
  const sim = raw.simulation;
  if (!isObj(sim) || typeof sim.tf !== "number" || typeof sim.t0 !== "number")
    return { ok: false, error: "As configurações de simulação estão ausentes ou inválidas." };
  const project = structuredClone(raw) as unknown as ProjectIR;
  for (const c of project.components) c.params = c.params ?? {};
  project.layout = project.layout ?? { positions: {} };
  project.simulation = { ...emptyProject().simulation, ...project.simulation };
  return { ok: true, project };
}
