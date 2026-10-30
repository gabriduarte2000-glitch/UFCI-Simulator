// Sessão de simulação: guarda o estado, avança no tempo, registra as curvas e aceita
// mudanças de parâmetro com a simulação em andamento.

import { compile, type CompiledModel } from "./compile";
import { Integrator, leftLimit, SolverError } from "./solvers";
import { Series } from "./series";
import type { ChangeEvent, Diagnostic, ParamValue, ProjectIR, SignalMeta } from "./types";

export interface SimOptions {
  /** Guarda as curvas na própria sessão. Desligue quando outro lugar guarda (ex.: interface). */
  keepSeries?: boolean;
  /** Chamada a cada linha registrada (t e todos os sinais). O vetor é reaproveitado. */
  onRow?: (t: number, sig: Float64Array) => void;
}

export type SimStatus = "idle" | "running" | "finished" | "error";

export interface ParamChangeResult {
  ok: boolean;
  /** A mudança exigiu reiniciar a simulação. */
  reset?: boolean;
  /** O valor só será usado ao reiniciar. */
  pending?: boolean;
  message?: string;
}

const MAX_STEPS = 5_000_000;

export class Simulation {
  project: ProjectIR;
  model!: CompiledModel;
  diagnostics: Diagnostic[] = [];
  compiled = false;
  status: SimStatus = "idle";
  t = 0;
  x: Float64Array = new Float64Array(0);
  series!: Series;
  events: ChangeEvent[] = [];
  steps = 0;
  private integ!: Integrator;
  private bps: number[] = [];
  private bpIdx = 0;

  private opts: SimOptions;

  constructor(project: ProjectIR, opts: SimOptions = {}) {
    this.opts = { keepSeries: true, ...opts };
    this.project = structuredClone(project);
    this.build();
  }

  get signals(): SignalMeta[] {
    return this.compiled ? this.model.signals : [];
  }

  get edgeSignal(): Record<string, number | null> {
    return this.compiled ? this.model.edgeSignal : {};
  }

  /** Compila e reinicia. Mantém os eventos antigos se `keepEvents`. */
  private build(keepEvents = false): boolean {
    const r = compile(this.project);
    this.diagnostics = r.diagnostics;
    this.compiled = r.ok && !!r.model;
    if (!this.compiled) {
      this.status = "error";
      return false;
    }
    this.model = r.model!;
    this.resetState(keepEvents);
    return true;
  }

  private resetState(keepEvents: boolean) {
    const sc = this.project.simulation;
    this.diagnostics = this.diagnostics.filter((d) => !d.code.startsWith("solver-"));
    this.t = sc.t0;
    this.x = this.model.x0();
    this.steps = 0;
    this.series = new Series(this.model.signals.length);
    if (!keepEvents) this.events = [];
    this.integ = new Integrator(this.model.f, this.model.nx, {
      solver: sc.solver,
      h: sc.h,
      rtol: sc.rtol,
      atol: sc.atol,
      hmax: this.model.suggestedMaxStep(sc.t0, sc.tf),
    });
    this.refreshBreakpoints();
    this.record(this.t);
    this.status = "idle";
  }

  private refreshBreakpoints() {
    this.bps = this.model.breakpoints(this.t, this.project.simulation.tf);
    this.bpIdx = 0;
    while (this.bpIdx < this.bps.length && this.bps[this.bpIdx] <= this.t) this.bpIdx++;
    const sc = this.project.simulation;
    this.integ.cfg.hmax = this.model.suggestedMaxStep(sc.t0, sc.tf);
  }

  private record(t: number, atLeftLimit = false) {
    const sig = this.model.evaluate(atLeftLimit ? leftLimit(t) : t, this.x);
    if (this.opts.keepSeries) this.series.push(t, sig);
    this.opts.onRow?.(t, sig);
  }

  /** Reinicia do instante inicial, relendo todos os parâmetros. */
  reset(): boolean {
    return this.build(false);
  }

  get finished(): boolean {
    return this.status === "finished";
  }

  /** Avança até que o tempo simulado alcance `target` (ou o fim). Passos inteiros: o resultado não depende do ritmo da chamada. */
  advanceTo(target: number): void {
    if (!this.compiled || this.status === "error" || this.status === "finished") return;
    const tf = this.project.simulation.tf;
    this.status = "running";
    try {
      while (this.t < target && this.t < tf) {
        if (++this.steps > MAX_STEPS)
          throw new SolverError("max-steps", this.t, "A simulação passou do limite de passos.");
        const nextBp = this.bpIdx < this.bps.length ? this.bps[this.bpIdx] : Infinity;
        const tLimit = Math.min(tf, nextBp);
        const endsAtBp = nextBp <= tf && tLimit === nextBp;
        const res = this.integ.step(this.t, this.x, tLimit, endsAtBp);
        this.t = res.tNew;
        if (endsAtBp && this.t >= nextBp) {
          this.t = nextBp;
          this.record(this.t, true);
          this.bpIdx++;
          this.integ.invalidate();
          this.record(this.t);
        } else {
          this.record(this.t);
        }
      }
      if (this.t >= tf) this.status = "finished";
    } catch (e) {
      this.status = "error";
      if (e instanceof SolverError) this.diagnostics.push(this.solverDiagnostic(e));
      else throw e;
    }
  }

  runToEnd(): void {
    this.advanceTo(this.project.simulation.tf);
  }

  private solverDiagnostic(e: SolverError): Diagnostic {
    const when = `em t = ${e.t.toPrecision(4)} s`;
    const text: Record<SolverError["code"], string> = {
      "min-step": `O método precisou de passos pequenos demais ${when}. O sistema pode ser instável ou rígido (dinâmicas muito rápidas e muito lentas juntas). Tente reduzir ganhos, aumentar a tolerância ou revisar os parâmetros.`,
      "non-finite": `O cálculo gerou um valor inválido (NaN ou infinito) ${when}. Costuma indicar instabilidade, divisão por zero ou parâmetro fora de faixa.`,
      "max-steps": `A simulação passou de ${MAX_STEPS.toLocaleString("pt-BR")} passos ${when}. Aumente o passo ou reduza o tempo final.`,
    };
    return { severity: "error", code: `solver-${e.code}`, message: text[e.code] };
  }

  /**
   * Muda um parâmetro. Se a mudança for simples, a simulação continua do estado atual
   * e o instante fica registrado. Se alterar a estrutura, reinicia.
   */
  setParam(compId: string, key: string, value: number | boolean | string): ParamChangeResult {
    if (!this.compiled) {
      return this.setParamStructural(compId, key, value);
    }
    const comp = this.project.components.find((c) => c.id === compId);
    const from = comp?.params[key]?.value;
    const r = this.model.setParam(compId, key, value);
    if (!r.ok) return { ok: false, message: r.message };
    if (r.needsReset) return this.setParamStructural(compId, key, value);
    this.events.push({ t: this.t, kind: "param", componentId: compId, key, from, to: value });
    if (!r.appliedNow) return { ok: true, pending: true };
    this.integ.invalidate();
    this.refreshBreakpoints();
    if (this.status !== "error") this.record(this.t);
    return { ok: true };
  }

  private setParamStructural(compId: string, key: string, value: number | boolean | string): ParamChangeResult {
    const comp = this.project.components.find((c) => c.id === compId);
    if (!comp) return { ok: false, message: "Componente não encontrado." };
    const prev = comp.params[key];
    comp.params[key] = { ...(prev ?? ({} as ParamValue)), value };
    const ok = this.build(false);
    if (!ok) {
      // Mantém o erro visível e deixa o usuário corrigir; não volta o valor.
      return { ok: true, reset: true, message: "A mudança deixou o modelo com erro. Veja os avisos." };
    }
    this.events.push({ t: this.project.simulation.t0, kind: "reset", componentId: compId, key, to: value, note: "Mudança estrutural: a simulação foi reiniciada." });
    return { ok: true, reset: true };
  }

  /** Aplica um projeto novo (edição de topologia). Reinicia. */
  loadProject(project: ProjectIR): boolean {
    this.project = structuredClone(project);
    return this.build(false);
  }

  /** Valores atuais de todos os sinais. */
  currentSignals(): Float64Array {
    if (!this.compiled) return new Float64Array(0);
    return Float64Array.from(this.model.evaluate(this.t, this.x));
  }
}
