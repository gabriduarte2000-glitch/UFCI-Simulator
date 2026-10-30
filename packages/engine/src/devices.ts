// Modelos de dispositivos semicondutores para o solver nodal (Newton-Raphson).
// Cada função devolve correntes e derivadas (condutâncias) em função das tensões nos terminais.
// A exponencial é prolongada por uma reta acima de EXP_MAX para o método de Newton nunca estourar.

/** Tensão térmica a 300 K. */
export const VT = 0.025852;
const EXP_MAX = 40;
const EXP_AT_MAX = Math.exp(EXP_MAX);
/** Condutância mínima em paralelo com as junções, para a matriz nunca ficar singular quando o dispositivo corta. */
export const GMIN = 1e-12;

/** Exponencial limitada: devolve valor e derivada. */
export function expl(x: number, out: { v: number; d: number }): void {
  if (x <= EXP_MAX) {
    const e = Math.exp(x);
    out.v = e;
    out.d = e;
  } else {
    out.v = EXP_AT_MAX * (1 + x - EXP_MAX);
    out.d = EXP_AT_MAX;
  }
}
const ex = { v: 0, d: 0 };
const ex2 = { v: 0, d: 0 };

export interface DiodeP {
  Is: number;
  nVt: number;
  /** Tensão de ruptura (Zener), 0 = sem ruptura. */
  Vz: number;
}
/** Corrente do ânodo para o cátodo e condutância, em função de v = Va − Vk. */
export function diode(v: number, P: DiodeP, out: { i: number; g: number }): void {
  expl(v / P.nVt, ex);
  let i = P.Is * (ex.v - 1) + GMIN * v;
  let g = (P.Is * ex.d) / P.nVt + GMIN;
  if (P.Vz > 0) {
    const Izt = 5e-3;
    expl(-(v + P.Vz) / P.nVt, ex2);
    i -= Izt * ex2.v;
    g += (Izt * ex2.d) / P.nVt;
  }
  out.i = i;
  out.g = g;
}

export interface BjtP {
  Is: number;
  bf: number;
  br: number;
  /** Tensão de Early, 0 = desligada. */
  VA: number;
}
export interface BjtOut {
  ic: number;
  ib: number;
  dicVbe: number;
  dicVbc: number;
  dibVbe: number;
  dibVbc: number;
}
/** Ebers-Moll de transporte para NPN, com vbe = Vb − Ve e vbc = Vb − Vc. ic e ib entram no coletor e na base. */
export function bjt(vbe: number, vbc: number, P: BjtP, o: BjtOut): void {
  expl(vbe / VT, ex);
  expl(vbc / VT, ex2);
  const ef = ex.v,
    def = ex.d / VT;
  const er = ex2.v,
    der = ex2.d / VT;
  const { Is, bf, br, VA } = P;
  const icc = Is * (ef - er);
  let f = 1;
  let df = 0;
  if (VA > 0) {
    f = 1 + (vbe - vbc) / VA;
    if (f < 0) f = 0;
    else df = 1 / VA;
  }
  o.ic = icc * f - (Is / br) * (er - 1) - GMIN * vbc;
  o.ib = (Is / bf) * (ef - 1) + (Is / br) * (er - 1) + GMIN * (vbe + vbc);
  o.dicVbe = Is * def * f + icc * df;
  o.dicVbc = -Is * der * f - icc * df - (Is / br) * der - GMIN;
  o.dibVbe = (Is / bf) * def + GMIN;
  o.dibVbc = (Is / br) * der + GMIN;
}

export interface MosP {
  /** Parâmetro de transcondutância µCox·W/L, em A/V². */
  K: number;
  Vth: number;
  lam: number;
}
/** MOSFET canal N, nível 1 (lei quadrática). Supõe vds >= 0. Devolve id, gm = ∂id/∂vgs e gds = ∂id/∂vds. */
export function mosfet(vgs: number, vds: number, P: MosP, out: { id: number; gm: number; gds: number }): void {
  const vov = vgs - P.Vth;
  if (vov <= 0) {
    out.id = 0;
    out.gm = 0;
    out.gds = 0;
    return;
  }
  const m = 1 + P.lam * vds;
  if (vds < vov) {
    const core = vov * vds - (vds * vds) / 2;
    out.id = P.K * core * m;
    out.gm = P.K * vds * m;
    out.gds = P.K * (vov - vds) * m + P.K * core * P.lam;
  } else {
    out.id = (P.K / 2) * vov * vov * m;
    out.gm = P.K * vov * m;
    out.gds = (P.K / 2) * vov * vov * P.lam;
  }
}

/**
 * Saída do amp-op com saturação suave: centro + meia faixa · g(u), com u = A·vd / meia faixa e
 * g(u) = u / (1 + |u|^8)^(1/8). É linear até uns 60% da faixa e satura sem degrau. Devolve valor e derivada.
 */
export function opamp(vd: number, A: number, vlo: number, vhi: number, out: { v: number; d: number }): void {
  const mid = (vhi + vlo) / 2;
  const span = (vhi - vlo) / 2;
  const u = (A * vd) / span;
  const au = Math.abs(u);
  const q = 1 + Math.pow(au, 8);
  const r = Math.pow(q, -1 / 8);
  out.v = mid + span * u * r;
  out.d = A * r / q;
}
