import { describe, it, expect } from "vitest";
import { designSeq, buildSeqCircuit, SEQ_EXAMPLES, Simulation, type SeqSpec, type SeqResult } from "../src/index";

function stateAt(sim: Simulation, nBits: number, t: number): number {
  const tv = sim.series.timeView();
  let i = 0;
  while (i < tv.length - 1 && tv[i] < t) i++;
  let s = 0;
  for (let b = 0; b < nBits; b++) {
    const j = sim.signals.findIndex((x) => x.id === `ff_${b}.q`);
    s = (s << 1) | (sim.series.colView(j)[i] >= 0.5 ? 1 : 0);
  }
  return s;
}

describe("lógica sequencial", () => {
  for (const ex of SEQ_EXAMPLES) {
    for (const ff of ["D", "T", "JK"] as const) {
      it(`${ex.title} com FF ${ff}: equações conferem e o circuito segue a tabela`, () => {
        const spec: SeqSpec = { ...ex.spec, ff };
        const r = designSeq(spec);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.verified.ok).toBe(true);
        const nIn = spec.inputs.length;
        for (let x = 0; x < (1 << nIn); x++) {
          const ir = buildSeqCircuit("t", spec, r as SeqResult, 1);
          ir.simulation = { ...ir.simulation, t0: 0, tf: 12.6, h: 0.01 };
          spec.inputs.forEach((_, i) => {
            const c = ir.components.find((k) => k.id === `in_${i}`)!;
            c.params.on = { ...c.params.on, value: ((x >> (nIn - 1 - i)) & 1) === 1 };
          });
          const sim = new Simulation(ir);
          expect(sim.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
          sim.runToEnd();
          let s = 0;
          for (let k = 0; k <= 12; k++) {
            expect(stateAt(sim, r.nBits, k + 0.3)).toBe(s);
            s = spec.next[s][x];
          }
        }
      });
    }
  }
  it("erros de entrada", () => {
    expect(designSeq({ nStates: 20, inputs: [], ff: "D", next: [], outputs: [] }).ok).toBe(false);
    expect(designSeq({ nStates: 8, inputs: ["X", "Y", "Z"], ff: "D", next: [], outputs: [] }).ok).toBe(false);
    expect(designSeq({ nStates: 4, inputs: [], ff: "D", next: [[1]], outputs: [] }).ok).toBe(false);
  });
  it("detector 101: equações mínimas conhecidas", () => {
    const r = designSeq(SEQ_EXAMPLES[2].spec);
    if (!r.ok) throw new Error();
    expect(r.outFns[0].min.text).toBe("AB");
  });
});
