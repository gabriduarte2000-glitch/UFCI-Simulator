import { describe, expect, it } from "vitest";
import { catalogText, describeProject, lintProject, SITUATIONS, emptyProject, newComponent } from "../src";

describe("assistente: contexto e verificações", () => {
  it("descreve uma situação pronta", () => {
    const ir = SITUATIONS.find((s) => s.id === "rlc")?.make() ?? SITUATIONS[0].make();
    const t = describeProject(ir);
    expect(t).toContain("Componentes (");
    expect(t).toContain("Conexões (");
    expect(t.length).toBeLessThan(9000);
  });
  it("avisa falta de terra e de saída", () => {
    const p = emptyProject("x");
    p.components.push(newComponent("elec.resistor", "r1", "R"), newComponent("elec.vsource", "v1", "V"));
    const codes = lintProject(p).map((d) => d.code);
    expect(codes).toContain("lint-no-ground");
    expect(codes).toContain("lint-no-output");
  });
  it("degrau depois do fim", () => {
    const p = emptyProject("x");
    const s = newComponent("signal.step", "u", "Degrau");
    s.params.t_step = { value: 99 } as never;
    p.components.push(s);
    expect(lintProject(p).map((d) => d.code)).toContain("lint-step-late");
  });
  it("catálogo compacto", () => {
    const c = catalogText();
    expect(c).toContain("elec.resistor");
    expect(c.length).toBeLessThan(14000);
  });
});
