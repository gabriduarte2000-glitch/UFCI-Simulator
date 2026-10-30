// Integradores numéricos.
//
// euler  : primeira ordem. Só para mostrar em aula por que passos grandes falham.
// rk4    : Runge-Kutta clássico de quarta ordem, passo fixo, sem estimativa de erro.
// rk45   : Dormand-Prince 5(4), passo adaptativo com controle de erro. Falha em sistemas rígidos
//          (o passo colapsa), e o motor detecta isso e avisa.
//
// Todos recebem f(t, x, dx) e escrevem a derivada em dx.

import type { SolverId } from "./types";

export type Deriv = (t: number, x: Float64Array, dx: Float64Array) => void;

export class SolverError extends Error {
  code: "min-step" | "non-finite" | "max-steps" | "no-converge" | "event-loop";
  t: number;
  constructor(code: SolverError["code"], t: number, message: string) {
    super(message);
    this.code = code;
    this.t = t;
  }
}

export interface IntegratorConfig {
  solver: SolverId;
  /** Passo fixo (euler, rk4). */
  h: number;
  rtol: number;
  atol: number;
  /** Passo máximo para o rk45. */
  hmax: number;
  hmin?: number;
}

export interface StepResult {
  /** Passo realmente usado. */
  h: number;
  /** Número de avaliações de f nesta chamada. */
  evals: number;
  /** Quantas tentativas foram rejeitadas (rk45). */
  rejected: number;
}

// Coeficientes de Dormand-Prince.
const C2 = 1 / 5,
  C3 = 3 / 10,
  C4 = 4 / 5,
  C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40,
  A32 = 9 / 40;
const A41 = 44 / 45,
  A42 = -56 / 15,
  A43 = 32 / 9;
const A51 = 19372 / 6561,
  A52 = -25360 / 2187,
  A53 = 64448 / 6561,
  A54 = -212 / 729;
const A61 = 9017 / 3168,
  A62 = -355 / 33,
  A63 = 46732 / 5247,
  A64 = 49 / 176,
  A65 = -5103 / 18656;
const A71 = 35 / 384,
  A73 = 500 / 1113,
  A74 = 125 / 192,
  A75 = -2187 / 6784,
  A76 = 11 / 84;
const E1 = 71 / 57600,
  E3 = -71 / 16695,
  E4 = 71 / 1920,
  E5 = -17253 / 339200,
  E6 = 22 / 525,
  E7 = -1 / 40;

/** Menor deslocamento para avaliar o limite à esquerda de um instante. */
export function leftLimit(t: number): number {
  return t - Math.max(Math.abs(t), 1) * 1e-13;
}

export class Integrator {
  readonly n: number;
  cfg: IntegratorConfig;
  private f: Deriv;
  private k: Float64Array[];
  private tmp: Float64Array;
  private xn: Float64Array;
  private fsalValid = false;
  /** Passo atual do rk45. */
  hCur = 0;
  /** Contador de avaliações. */
  totalEvals = 0;
  totalRejected = 0;

  constructor(f: Deriv, n: number, cfg: IntegratorConfig) {
    this.f = f;
    this.n = n;
    this.cfg = cfg;
    this.k = [];
    for (let i = 0; i < 7; i++) this.k.push(new Float64Array(n));
    this.tmp = new Float64Array(n);
    this.xn = new Float64Array(n);
  }

  /** Descarta a derivada reaproveitada (depois de evento, parâmetro novo ou ponto de quebra). */
  invalidate(): void {
    this.fsalValid = false;
  }

  /** Estima o passo inicial do rk45 (algoritmo de Hairer). */
  initialStep(t: number, x: Float64Array, tEnd: number): number {
    const { rtol, atol, hmax } = this.cfg;
    const n = this.n;
    if (n === 0) return Math.min(hmax, tEnd - t);
    const f0 = this.k[0];
    this.f(t, x, f0);
    this.totalEvals++;
    let d0 = 0,
      d1 = 0;
    for (let i = 0; i < n; i++) {
      const sc = atol + rtol * Math.abs(x[i]);
      d0 += (x[i] / sc) ** 2;
      d1 += (f0[i] / sc) ** 2;
    }
    d0 = Math.sqrt(d0 / n);
    d1 = Math.sqrt(d1 / n);
    const h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : (0.01 * d0) / d1;
    const x1 = this.tmp;
    for (let i = 0; i < n; i++) x1[i] = x[i] + h0 * f0[i];
    const f1 = this.k[1];
    this.f(t + h0, x1, f1);
    this.totalEvals++;
    let d2 = 0;
    for (let i = 0; i < n; i++) {
      const sc = atol + rtol * Math.abs(x[i]);
      d2 += ((f1[i] - f0[i]) / sc) ** 2;
    }
    d2 = Math.sqrt(d2 / n) / h0;
    const h1 = !Number.isFinite(d2) || !Number.isFinite(h0) ? 1e-3 * Math.max(1e-6, Number.isFinite(h0) ? h0 : 1e-6) : Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / 5);
    return Math.min(100 * h0, h1, hmax, Math.max(tEnd - t, 0));
  }

  /**
   * Avança de t até no máximo tLimit, atualizando x no lugar.
   * endsAtBreakpoint: o fim do passo é um ponto de descontinuidade, então os estágios
   * que tocam o fim do passo usam o limite à esquerda.
   * Retorna o novo t em result.tNew.
   */
  step(t: number, x: Float64Array, tLimit: number, endsAtBreakpoint: boolean): StepResult & { tNew: number } {
    const { solver } = this.cfg;
    if (this.n === 0) {
      // Sem estados não há o que integrar: só o tempo avança.
      const h = Math.min(this.cfg.hmax, tLimit - t);
      const tNew = t + h >= tLimit - 1e-12 * Math.max(1, Math.abs(tLimit)) ? tLimit : t + h;
      return { h: tNew - t, evals: 0, rejected: 0, tNew };
    }
    if (solver === "rk45") return this.stepRk45(t, x, tLimit, endsAtBreakpoint);
    return this.stepFixed(t, x, tLimit, endsAtBreakpoint, solver === "rk4");
  }

  private stepFixed(t: number, x: Float64Array, tLimit: number, bp: boolean, rk4: boolean) {
    const n = this.n;
    let h = this.cfg.h;
    let hitLimit = false;
    // Evita um passo final minúsculo que só acumula erro de arredondamento.
    if (t + h >= tLimit - 1e-12 * Math.max(1, Math.abs(tLimit))) {
      h = tLimit - t;
      hitLimit = true;
    }
    const tEnd = hitLimit ? tLimit : t + h;
    const tEvalEnd = hitLimit && bp ? leftLimit(tEnd) : tEnd;
    const [k1, k2, k3, k4] = this.k;
    const xt = this.tmp;
    this.f(t, x, k1);
    let evals = 1;
    if (!rk4) {
      for (let i = 0; i < n; i++) x[i] += h * k1[i];
    } else {
      for (let i = 0; i < n; i++) xt[i] = x[i] + 0.5 * h * k1[i];
      this.f(t + 0.5 * h, xt, k2);
      for (let i = 0; i < n; i++) xt[i] = x[i] + 0.5 * h * k2[i];
      this.f(t + 0.5 * h, xt, k3);
      for (let i = 0; i < n; i++) xt[i] = x[i] + h * k3[i];
      this.f(tEvalEnd, xt, k4);
      evals += 3;
      for (let i = 0; i < n; i++) x[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    this.totalEvals += evals;
    this.checkFinite(x, tEnd);
    return { h, evals, rejected: 0, tNew: tEnd };
  }

  private stepRk45(t: number, x: Float64Array, tLimit: number, bp: boolean) {
    const n = this.n;
    const { rtol, atol, hmax } = this.cfg;
    const hmin = this.cfg.hmin ?? 1e-12 * Math.max(1, Math.abs(tLimit));
    const [k1, k2, k3, k4, k5, k6, k7] = this.k;
    const xt = this.tmp;
    const xn = this.xn;
    let evals = 0;
    let rejected = 0;
    if (!this.fsalValid) {
      this.f(t, x, k1);
      evals++;
      this.fsalValid = true;
    }
    if (this.hCur <= 0) this.hCur = this.initialStep(t, x, tLimit);
    for (;;) {
      let h = Math.min(this.hCur, hmax);
      let hitLimit = false;
      if (t + h >= tLimit - 1e-12 * Math.max(1, Math.abs(tLimit))) {
        h = tLimit - t;
        hitLimit = true;
      }
      const tEnd = hitLimit ? tLimit : t + h;
      const tEvalEnd = hitLimit && bp ? leftLimit(tEnd) : tEnd;
      for (let i = 0; i < n; i++) xt[i] = x[i] + h * A21 * k1[i];
      this.f(t + C2 * h, xt, k2);
      for (let i = 0; i < n; i++) xt[i] = x[i] + h * (A31 * k1[i] + A32 * k2[i]);
      this.f(t + C3 * h, xt, k3);
      for (let i = 0; i < n; i++) xt[i] = x[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
      this.f(t + C4 * h, xt, k4);
      for (let i = 0; i < n; i++) xt[i] = x[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
      this.f(t + C5 * h, xt, k5);
      for (let i = 0; i < n; i++)
        xt[i] = x[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
      this.f(tEvalEnd, xt, k6);
      for (let i = 0; i < n; i++)
        xn[i] = x[i] + h * (A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
      this.f(tEvalEnd, xn, k7);
      evals += 6;
      let errSum = 0;
      let finite = true;
      for (let i = 0; i < n; i++) {
        const e = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
        const sc = atol + rtol * Math.max(Math.abs(x[i]), Math.abs(xn[i]));
        const r = e / sc;
        errSum += r * r;
        if (!Number.isFinite(xn[i])) finite = false;
      }
      const err = finite ? Math.sqrt(errSum / n) : Infinity;
      this.totalEvals += evals;
      evals = 0;
      if (err <= 1) {
        for (let i = 0; i < n; i++) x[i] = xn[i];
        const factor = err === 0 ? 10 : Math.min(10, 0.9 * err ** (-1 / 5));
        if (!hitLimit) this.hCur = Math.min(h * factor, hmax);
        else this.hCur = Math.max(this.hCur, Math.min(h * factor, hmax));
        // FSAL: k7 vira k1 do próximo passo, exceto quando o fim é uma descontinuidade.
        if (bp && hitLimit) {
          this.fsalValid = false;
        } else {
          k1.set(k7);
        }
        this.totalRejected += rejected;
        return { h, evals: 7, rejected, tNew: tEnd };
      }
      rejected++;
      if (!finite) this.hCur = h * 0.2;
      else this.hCur = h * Math.max(0.2, 0.9 * err ** (-1 / 5));
      if (this.hCur < hmin) {
        if (!finite)
          throw new SolverError("non-finite", t, "O cálculo gerou um valor inválido (NaN ou infinito).");
        throw new SolverError("min-step", t, "O solver precisou de passos menores que o limite mínimo.");
      }
    }
  }

  private checkFinite(x: Float64Array, t: number) {
    for (let i = 0; i < this.n; i++) {
      if (!Number.isFinite(x[i])) throw new SolverError("non-finite", t, "O cálculo gerou um valor inválido (NaN ou infinito).");
    }
  }
}
