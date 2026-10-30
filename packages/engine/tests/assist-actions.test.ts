import { describe, expect, it } from "vitest";
import { buildFromSpec, compile, emptyProject, newComponent, parseActions, patchProject, suggestFixes, type SpecComp, type SpecWire } from "../src";

const rc: { components: SpecComp[]; connections: SpecWire[] } = {
  components: [
    { id: "u", type: "signal.step", label: "Degrau", params: { v1: 5, t_step: 0 } },
    { id: "v", type: "elec.vsource", label: "Fonte" },
    { id: "r", type: "elec.resistor", label: "R", params: { R: 1000 } },
    { id: "c", type: "elec.capacitor", label: "C", params: { C: 0.0001 } },
    { id: "g", type: "elec.ground", label: "Terra" },
    { id: "s", type: "sink.scope", label: "Scope" },
  ],
  connections: [
    { from: "u", fromPort: "out", to: "v", toPort: "u" },
    { from: "v", fromPort: "p", to: "r", toPort: "a" },
    { from: "r", fromPort: "b", to: "c", toPort: "a" },
    { from: "c", fromPort: "b", to: "g", toPort: "a" },
    { from: "v", fromPort: "n", to: "g", toPort: "a" },
    { from: "c", fromPort: "v", to: "s", toPort: "in1" },
  ],
};

describe("ações do assistente", () => {
  it("monta um filtro RC que compila sem erros", () => {
    const r = buildFromSpec(rc, "RC");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(compile(r.ir).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(Object.keys(r.ir.layout!.positions)).toHaveLength(6);
      expect(r.ir.components.find((c) => c.id === "r")!.params.R.value).toBe(1000);
    }
  });
  it("recusa tipo, porta e ligação inválidos", () => {
    const bad = buildFromSpec({ components: [{ id: "x", type: "nao.existe" }, { id: "r", type: "elec.resistor" }], connections: [{ from: "r", fromPort: "zzz", to: "r", toPort: "a" }] }, "x");
    expect(bad.ok).toBe(false);
    const sig = buildFromSpec({ components: [{ id: "u", type: "signal.step" }, { id: "r", type: "elec.resistor" }], connections: [{ from: "u", fromPort: "out", to: "r", toPort: "a" }] }, "x");
    expect(sig.ok).toBe(false);
    const range = buildFromSpec({ components: [{ id: "r", type: "elec.resistor", params: { R: -5 } }], connections: [] }, "x");
    expect(range.ok).toBe(false);
  });
  it("correção automática do terra", () => {
    const p = emptyProject("x");
    p.components.push(newComponent("elec.resistor", "r1", "R"), newComponent("elec.vsource", "v1", "V"));
    const fixes = suggestFixes(p);
    const g = fixes.find((f) => f.code === "lint-no-ground");
    expect(g).toBeTruthy();
    const r = patchProject(p, g!.patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ir.components.some((c) => c.type === "elec.ground")).toBe(true);
  });
  it("muda parâmetro por patch e rejeita valor fora da faixa", () => {
    const r0 = buildFromSpec(rc, "RC");
    if (!r0.ok) throw new Error();
    const ok = patchProject(r0.ir, { setParams: [{ component: "r", key: "R", value: "2200" }] });
    expect(ok.ok && ok.ir.components.find((c) => c.id === "r")!.params.R.value).toBe(2200);
    expect(patchProject(r0.ir, { setParams: [{ component: "r", key: "R", value: -1 }] }).ok).toBe(false);
  });
  it("filtra ações malformadas", () => {
    const a = parseActions([
      { type: "go", label: "Ver gráficos", page: "graficos" },
      { type: "go", label: "x", page: "inexistente" },
      { type: "run", label: "Simular" },
      { type: "build_circuit", label: "Montar", components: [{ id: "r", type: "elec.resistor", params: [{ key: "R", value: "100" }] }], connections: [] },
      { type: "hack", label: "x" },
      { label: "sem tipo" },
    ]);
    expect(a.map((x) => x.type)).toEqual(["go", "run", "build_circuit"]);
    const bc = a[2];
    if (bc.type === "build_circuit") expect(bc.components[0].params).toEqual({ R: "100" });
  });
});
