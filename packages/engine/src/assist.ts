// Material para o assistente: descrição textual do projeto, catálogo de componentes e verificações de bom senso.

import { compile } from "./compile";
import { allDefs, CATEGORIES, getDef, portsOf } from "./components/registry";
import type { ComponentInstance, Diagnostic, ProjectIR } from "./types";

const fmt = (v: unknown) => (typeof v === "number" ? String(+v.toPrecision(6)) : String(v));

export function labelOf(c: ComponentInstance): string {
  return c.label?.trim() || getDef(c.type)?.label || c.type;
}

/** Verificações de bom senso além dos erros do compilador. */
export function lintProject(ir: ProjectIR): Diagnostic[] {
  const out: Diagnostic[] = [];
  const comps = ir.components.filter((c) => c.type !== "note.text");
  if (!comps.length) return out;
  const has = (re: RegExp) => comps.filter((c) => re.test(c.type));
  const hasOut = comps.some((c) => c.type === "sink.scope" || getDef(c.type)?.category === "sinks");
  if (!hasOut && !comps.some((c) => c.type === "elec.voltmeter")) {
    out.push({ severity: "info", code: "lint-no-output", message: "Nada vai aparecer nos gráficos: ligue algum sinal a um Scope (grupo Saídas e medição). Os componentes físicos têm saídas pequenas, como a tensão do capacitor ou a posição da massa." });
  }
  const elec = has(/^elec\./).filter((c) => c.type !== "elec.ground");
  if (elec.length && !has(/^elec\.ground$/).length) {
    out.push({ severity: "warning", code: "lint-no-ground", message: "O circuito elétrico não tem terra. Todo circuito precisa de um ponto de referência: adicione um Terra e ligue-o ao negativo da fonte.", componentIds: elec.map((c) => c.id) });
  }
  const mech = has(/^mech\./).filter((c) => c.type !== "mech.ground");
  if (mech.length && !comps.some((c) => c.type === "mech.ground" || c.type === "mech.velocity")) {
    out.push({ severity: "warning", code: "lint-no-wall", message: "O sistema mecânico não está preso a nenhuma parede. Ligue uma mola ou um amortecedor a uma Parede para ter referência.", componentIds: mech.map((c) => c.id) });
  }
  const rot = has(/^rot\./).filter((c) => c.type !== "rot.ground");
  if (rot.length && !comps.some((c) => c.type === "rot.ground" || c.type === "rot.speed")) {
    out.push({ severity: "warning", code: "lint-no-rot-ref", message: "O sistema rotacional não tem referência fixa. Ligue um amortecedor ou uma mola torcional ao Engaste.", componentIds: rot.map((c) => c.id) });
  }
  const used = new Set<string>();
  for (const w of ir.connections) {
    used.add(w.from.component);
    used.add(w.to.component);
  }
  for (const c of comps) {
    const def = getDef(c.type);
    if (def?.category === "sources" && !used.has(c.id)) {
      out.push({ severity: "info", code: "lint-source-unused", message: `A fonte "${labelOf(c)}" não está ligada a nada.`, componentIds: [c.id] });
    }
    if (c.type === "signal.step") {
      const v0 = Number(c.params.v0?.value ?? 0);
      const v1 = Number(c.params.v1?.value ?? 1);
      const ts = Number(c.params.t_step?.value ?? 1);
      if (v0 === v1) out.push({ severity: "warning", code: "lint-step-flat", message: `O degrau "${labelOf(c)}" tem valor inicial igual ao final: não há salto nenhum.`, componentIds: [c.id] });
      if (ts > ir.simulation.tf) out.push({ severity: "warning", code: "lint-step-late", message: `O degrau "${labelOf(c)}" acontece em ${fmt(ts)} s, depois do fim da simulação (${fmt(ir.simulation.tf)} s). Ele nunca vai ocorrer.`, componentIds: [c.id] });
    }
  }
  const dyn = comps.filter((c) => /^(elec\.(capacitor|inductor)|mech\.mass|rot\.inertia)$/.test(c.type)).length;
  if (dyn === 0 && comps.some((c) => /^elec\.|^mech\.|^rot\./.test(c.type)) && !comps.some((c) => getDef(c.type)?.category !== "sinks" && /^control\.|^math\.integrator|^process\./.test(c.type))) {
    out.push({ severity: "info", code: "lint-static", message: "Não há capacitor, indutor, massa nem inércia: o circuito é estático e a resposta será instantânea, sem transitório." });
  }
  return out;
}

/** Descreve o projeto em texto, para dar contexto ao assistente. */
export function describeProject(ir: ProjectIR, max = { comps: 70, wires: 160 }): string {
  const lines: string[] = [];
  const s = ir.simulation;
  lines.push(`Projeto: "${ir.meta.name}". Simulação de ${fmt(s.t0)} a ${fmt(s.tf)} s, método ${s.solver}.`);
  const comps = ir.components.filter((c) => c.type !== "note.text");
  if (!comps.length) {
    lines.push("O quadro está vazio.");
    return lines.join("\n");
  }
  lines.push(`Componentes (${comps.length}):`);
  for (const c of comps.slice(0, max.comps)) {
    const def = getDef(c.type);
    const ps = (def?.params ?? [])
      .filter((p) => p.group !== "initial" && (p.kind === "number" || p.kind === "text" || p.kind === "select" || p.kind === "bool"))
      .map((p) => {
        const v = c.params[p.key]?.value ?? p.default;
        return `${p.key}=${fmt(v)}${p.unit ? " " + p.unit : ""}`;
      })
      .slice(0, 8);
    lines.push(`- ${labelOf(c)} [${c.id}] tipo ${c.type} (${def?.label ?? "?"})${ps.length ? ": " + ps.join(", ") : ""}`);
  }
  if (comps.length > max.comps) lines.push(`... e mais ${comps.length - max.comps} componentes.`);
  const name = new Map(ir.components.map((c) => [c.id, labelOf(c)]));
  lines.push(`Conexões (${ir.connections.length}):`);
  for (const w of ir.connections.slice(0, max.wires)) lines.push(`- ${name.get(w.from.component) ?? w.from.component}.${w.from.port} -> ${name.get(w.to.component) ?? w.to.component}.${w.to.port}`);
  if (ir.connections.length > max.wires) lines.push(`... e mais ${ir.connections.length - max.wires} conexões.`);
  const diags = [...compile(ir).diagnostics, ...lintProject(ir)].filter((d) => d.code !== "empty");
  lines.push(diags.length ? "Avisos e erros do simulador:" : "O simulador não encontrou avisos nem erros.");
  for (const d of diags) lines.push(`- [${d.severity}] ${d.message}`);
  return lines.join("\n");
}

/** Lista compacta dos componentes disponíveis e suas portas. */
export function catalogText(): string {
  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    const defs = allDefs().filter((d) => d.category === cat.id);
    if (!defs.length) continue;
    lines.push(`${cat.label}:`);
    for (const d of defs) {
      const ports = portsOf(d, Object.fromEntries(d.params.map((p) => [p.key, { value: p.default }]))).map((p) => `${p.name}${p.dir === "out" ? "(saída)" : p.dir === "in" ? "(entrada)" : ""}`);
      lines.push(`- ${d.type} = ${d.label}; portas ${ports.join(", ")}`);
    }
  }
  return lines.join("\n");
}
