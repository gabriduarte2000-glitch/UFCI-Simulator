// Ações que o assistente propõe: validação rigorosa, montagem de circuitos e correções automáticas.
// Nada é aplicado sem o usuário clicar no botão.

import { checkPortPair } from "./compile";
import { getDef, newComponent, portsOf } from "./components/registry";
import { lintProject } from "./assist";
import { emptyProject } from "./project";
import type { ComponentInstance, ParamValue, ProjectIR } from "./types";

export type PageId = "montagem" | "dashboard" | "graficos" | "tabelas" | "indicadores" | "math";
export type MathTabId = "analise" | "equacao" | "frequencia";

export interface SpecComp {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, string | number | boolean>;
}
export interface SpecWire {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}
export interface SpecSetParam {
  component: string;
  key: string;
  value: string | number | boolean;
}
export interface Patch {
  components?: SpecComp[];
  connections?: SpecWire[];
  setParams?: SpecSetParam[];
}

export type AssistAction =
  | { type: "go"; label: string; page: PageId; tab?: MathTabId }
  | { type: "open_situation"; label: string; situation: string }
  | { type: "build_equation"; label: string; equation: string; realization?: string }
  | ({ type: "build_circuit"; label: string; tf?: number } & Required<Pick<Patch, "components" | "connections">>)
  | ({ type: "patch"; label: string } & Patch)
  | { type: "run"; label: string }
  | { type: "open_cloud"; label: string };

const PAGES: PageId[] = ["montagem", "dashboard", "graficos", "tabelas", "indicadores", "math"];
const TABS: MathTabId[] = ["analise", "equacao", "frequencia"];
const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function parseParams(v: unknown): Record<string, string | number | boolean> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const p of v.slice(0, 20)) {
    if (p && typeof p === "object" && typeof (p as { key?: unknown }).key === "string") {
      const val = (p as { value?: unknown }).value;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") out[(p as { key: string }).key] = val;
    }
  }
  return out;
}
function parseComps(v: unknown): SpecComp[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    return [{ id: str(o.id, 24), type: str(o.type, 40), label: str(o.label, 60) || undefined, params: parseParams(o.params) }];
  });
}
function parseWires(v: unknown): SpecWire[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 120).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    return [{ from: str(o.from, 24), fromPort: str(o.fromPort, 24), to: str(o.to, 24), toPort: str(o.toPort, 24) }];
  });
}
function parseSet(v: unknown): SpecSetParam[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const val = o.value;
    if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") return [];
    return [{ component: str(o.component, 24), key: str(o.key, 24), value: val }];
  });
}

/** Aceita só ações bem formadas. O resto é descartado sem erro. */
export function parseActions(raw: unknown): AssistAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistAction[] = [];
  for (const a of raw.slice(0, 6)) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const label = str(o.label, 60);
    if (!label) continue;
    switch (o.type) {
      case "go": {
        const page = PAGES.find((p) => p === o.page);
        if (!page) break;
        out.push({ type: "go", label, page, tab: TABS.find((t) => t === o.tab) });
        break;
      }
      case "open_situation": {
        const s = str(o.situation, 40);
        if (s) out.push({ type: "open_situation", label, situation: s });
        break;
      }
      case "build_equation": {
        const e = str(o.equation, 300);
        if (e) out.push({ type: "build_equation", label, equation: e, realization: str(o.realization, 20) || undefined });
        break;
      }
      case "build_circuit": {
        const components = parseComps(o.components);
        if (components.length) out.push({ type: "build_circuit", label, components, connections: parseWires(o.connections), tf: typeof o.tf === "number" && o.tf > 0 ? o.tf : undefined });
        break;
      }
      case "patch": {
        const components = parseComps(o.components);
        const connections = parseWires(o.connections);
        const setParams = parseSet(o.setParams);
        if (components.length || connections.length || setParams.length) out.push({ type: "patch", label, components, connections, setParams });
        break;
      }
      case "run":
        out.push({ type: "run", label });
        break;
      case "open_cloud":
        out.push({ type: "open_cloud", label });
        break;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ aplicação

function coerce(inst: ComponentInstance, key: string, v: string | number | boolean): { ok: true; value: ParamValue["value"] } | { ok: false; error: string } {
  const def = getDef(inst.type);
  const pd = def?.params.find((p) => p.key === key);
  if (!pd) return { ok: false, error: `${inst.id}: o parâmetro "${key}" não existe em ${def?.label ?? inst.type}.` };
  if (pd.kind === "number" || pd.kind === "int") {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (!Number.isFinite(n)) return { ok: false, error: `${inst.id}: "${key}" precisa ser um número.` };
    if (pd.min !== undefined && n < pd.min) return { ok: false, error: `${inst.id}: "${key}" = ${n} é menor que o mínimo (${pd.min}).` };
    if (pd.max !== undefined && n > pd.max) return { ok: false, error: `${inst.id}: "${key}" = ${n} é maior que o máximo (${pd.max}).` };
    return { ok: true, value: pd.kind === "int" ? Math.round(n) : n };
  }
  if (pd.kind === "bool") return { ok: true, value: v === true || v === "true" };
  if (pd.kind === "select") {
    const s = String(v);
    if (!pd.options?.some((o) => o.value === s)) return { ok: false, error: `${inst.id}: "${key}" aceita só ${pd.options?.map((o) => o.value).join(", ")}.` };
    return { ok: true, value: s };
  }
  return { ok: true, value: String(v) };
}

export type ApplyResult = { ok: true; ir: ProjectIR } | { ok: false; errors: string[] };

function place(ir: ProjectIR, ids: string[]) {
  const pos = (ir.layout ??= { positions: {} }).positions;
  const existing = Object.entries(pos).filter(([k]) => !ids.includes(k));
  const idSet = new Set(ids);
  // profundidade por busca em largura a partir de quem não recebe sinal
  const adj = new Map<string, string[]>();
  const hasIn = new Set<string>();
  for (const w of ir.connections) {
    if (!idSet.has(w.from.component) && !idSet.has(w.to.component)) continue;
    (adj.get(w.from.component) ?? adj.set(w.from.component, []).get(w.from.component)!).push(w.to.component);
    (adj.get(w.to.component) ?? adj.set(w.to.component, []).get(w.to.component)!).push(w.from.component);
    const def = getDef(ir.components.find((c) => c.id === w.to.component)?.type ?? "");
    const inst = ir.components.find((c) => c.id === w.to.component);
    const p = def && inst ? portsOf(def, inst.params).find((q) => q.name === w.to.port) : undefined;
    if (p?.dir === "in") hasIn.add(w.to.component);
  }
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) if (!hasIn.has(id)) (depth.set(id, 0), queue.push(id));
  if (!queue.length && ids.length) (depth.set(ids[0], 0), queue.push(ids[0]));
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of adj.get(c) ?? []) if (idSet.has(n) && !depth.has(n)) (depth.set(n, depth.get(c)! + 1), queue.push(n));
  }
  const col = new Map<number, number>();
  const baseX = existing.length ? Math.max(...existing.map(([, p]) => p.x)) + 260 : 0;
  const baseY = existing.length ? Math.min(...existing.map(([, p]) => p.y)) : 0;
  const useBase = existing.length > 0;
  for (const id of ids) {
    const d = depth.get(id) ?? 0;
    const k = col.get(d) ?? 0;
    col.set(d, k + 1);
    pos[id] = { x: (useBase ? baseX : 0) + d * 230, y: baseY + k * 150 };
  }
}

function applyParts(base: ProjectIR, patch: Patch): ApplyResult {
  const errors: string[] = [];
  const ir: ProjectIR = structuredClone(base);
  const used = new Set(ir.components.map((c) => c.id));
  const newIds: string[] = [];
  for (const c of patch.components ?? []) {
    if (!ID_RE.test(c.id)) {
      errors.push(`Nome de componente inválido: "${c.id}".`);
      continue;
    }
    if (used.has(c.id)) {
      errors.push(`O nome "${c.id}" já está em uso.`);
      continue;
    }
    const def = getDef(c.type);
    if (!def) {
      errors.push(`Tipo de componente desconhecido: "${c.type}".`);
      continue;
    }
    const inst = newComponent(c.type, c.id, c.label);
    for (const [k, v] of Object.entries(c.params ?? {})) {
      const r = coerce(inst, k, v);
      if (!r.ok) errors.push(r.error);
      else inst.params[k] = { ...inst.params[k], value: r.value };
    }
    used.add(c.id);
    newIds.push(c.id);
    ir.components.push(inst);
  }
  const byId = new Map(ir.components.map((c) => [c.id, c]));
  let n = ir.connections.length;
  const wireIds = new Set(ir.connections.map((w) => w.id));
  const seen = new Set(ir.connections.map((w) => `${w.from.component}.${w.from.port}|${w.to.component}.${w.to.port}`));
  for (const w of patch.connections ?? []) {
    const a = byId.get(w.from);
    const b = byId.get(w.to);
    if (!a || !b) {
      errors.push(`Ligação com componente inexistente: ${w.from} → ${w.to}.`);
      continue;
    }
    const pa = portsOf(getDef(a.type)!, a.params).find((p) => p.name === w.fromPort);
    const pb = portsOf(getDef(b.type)!, b.params).find((p) => p.name === w.toPort);
    if (!pa || !pb) {
      errors.push(`Porta inexistente na ligação ${w.from}.${w.fromPort} → ${w.to}.${w.toPort}.`);
      continue;
    }
    const chk = checkPortPair(pa, a.label ?? a.id, pb, b.label ?? b.id);
    if (!chk.ok) {
      errors.push(`${w.from}.${w.fromPort} → ${w.to}.${w.toPort}: ${chk.message}`);
      continue;
    }
    const key = `${w.from}.${w.fromPort}|${w.to}.${w.toPort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let id = `w${++n}`;
    while (wireIds.has(id)) id = `w${++n}`;
    wireIds.add(id);
    ir.connections.push({ id, from: { component: w.from, port: w.fromPort }, to: { component: w.to, port: w.toPort } });
  }
  for (const s of patch.setParams ?? []) {
    const c = byId.get(s.component);
    if (!c) {
      errors.push(`Componente inexistente: ${s.component}.`);
      continue;
    }
    const r = coerce(c, s.key, s.value);
    if (!r.ok) errors.push(r.error);
    else c.params[s.key] = { ...c.params[s.key], value: r.value };
  }
  if (errors.length) return { ok: false, errors };
  if (newIds.length) place(ir, newIds);
  return { ok: true, ir };
}

/** Monta um projeto novo a partir da descrição. */
export function buildFromSpec(spec: { components: SpecComp[]; connections: SpecWire[]; tf?: number }, name: string): ApplyResult {
  if (!spec.components.length) return { ok: false, errors: ["Nenhum componente na montagem."] };
  const base = emptyProject(name);
  if (spec.tf && spec.tf > 0) base.simulation.tf = spec.tf;
  return applyParts(base, spec);
}

/** Acrescenta componentes e ligações, ou muda parâmetros, num projeto existente. */
export function patchProject(ir: ProjectIR, patch: Patch): ApplyResult {
  return applyParts(ir, patch);
}

// ------------------------------------------------------------------------------------------------ correções automáticas

export interface QuickFix {
  code: string;
  label: string;
  patch: Patch;
}

function freeId(ir: ProjectIR, base: string): string {
  const used = new Set(ir.components.map((c) => c.id));
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}${i}`;
  return id;
}

/** Correções que o navegador sabe aplicar sozinho, ligadas aos avisos de bom senso. */
export function suggestFixes(ir: ProjectIR): QuickFix[] {
  const out: QuickFix[] = [];
  const codes = new Set(lintProject(ir).map((d) => d.code));
  if (codes.has("lint-no-ground")) {
    const v = ir.components.find((c) => c.type === "elec.vsource");
    if (v) {
      const g = freeId(ir, "gnd");
      out.push({ code: "lint-no-ground", label: "Adicionar o Terra", patch: { components: [{ id: g, type: "elec.ground", label: "Terra" }], connections: [{ from: v.id, fromPort: "n", to: g, toPort: "a" }] } });
    }
  }
  if (codes.has("lint-no-output")) {
    const pref = ["v", "x", "i", "out"];
    for (const c of ir.components) {
      const def = getDef(c.type);
      if (!def || def.category === "sources" || def.category === "sinks" || c.type === "note.text") continue;
      const ports = portsOf(def, c.params).filter((p) => p.domain === "signal" && p.dir === "out");
      const port = pref.map((n) => ports.find((p) => p.name === n)).find(Boolean) ?? ports[0];
      if (!port) continue;
      const s = freeId(ir, "scope");
      out.push({ code: "lint-no-output", label: `Ligar ${c.label ?? c.id} a um Scope`, patch: { components: [{ id: s, type: "sink.scope", label: "Scope" }], connections: [{ from: c.id, fromPort: port.name, to: s, toPort: "in1" }] } });
      break;
    }
  }
  for (const c of ir.components) {
    if (c.type === "signal.step" && Number(c.params.t_step?.value ?? 1) > ir.simulation.tf) {
      out.push({ code: "lint-step-late", label: `Mover o degrau para ${Math.min(1, ir.simulation.tf / 4)} s`, patch: { setParams: [{ component: c.id, key: "t_step", value: Math.min(1, ir.simulation.tf / 4) }] } });
    }
  }
  return out;
}
