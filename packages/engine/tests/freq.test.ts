import { describe, expect, it } from "vitest";
import { bode, responseAt } from "../src";

describe("resposta em frequência", () => {
  it("1ª ordem: -3 dB e -45° na frequência de corte", () => {
    const r = responseAt([1], [1, 1], 1);
    expect(r.db).toBeCloseTo(-3.0103, 3);
    expect(r.phaseDeg).toBeCloseTo(-45, 6);
    const b = bode([1], [1, 1]);
    expect(b.edges3dB[0]).toBeCloseTo(1, 1);
    expect(b.lowDb).toBeCloseTo(0, 2);
  });
  it("2ª ordem subamortecida: pico perto de ωn√(1-2ζ²)", () => {
    // ωn = 10, ζ = 0,1
    const b = bode([100], [1, 2, 100]);
    expect(b.peak.w).toBeCloseTo(10 * Math.sqrt(1 - 2 * 0.01), 0);
    expect(b.peak.db).toBeCloseTo(-20 * Math.log10(2 * 0.1 * Math.sqrt(1 - 0.01)), 0);
    expect(b.phase[b.phase.length - 1]).toBeLessThan(-170);
  });
  it("malha aberta 10/(s(s+1)(s+10)): margens", () => {
    const b = bode([10], [1, 11, 10, 0]);
    expect(b.gainCross).toBeTruthy();
    expect(b.gainCross!.phaseMarginDeg).toBeGreaterThan(0);
    expect(b.phaseCross).toBeTruthy();
    expect(b.phaseCross!.w).toBeCloseTo(Math.sqrt(10), 1);
    expect(b.phaseCross!.gainMarginDb).toBeCloseTo(20 * Math.log10(11), 0);
  });
  it("passa-faixa: pico no centro e duas bordas", () => {
    const b = bode([2, 0], [1, 2, 25]);
    expect(b.peak.w).toBeCloseTo(5, 0);
    expect(b.edges3dB.length).toBe(2);
  });
});
