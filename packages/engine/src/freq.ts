// Resposta em frequência (Bode) de G(s) = N(s)/D(s), com ganho, fase e margens.

import { cabs, carg, cdiv, polyEvalC, polyRoots } from "./eig";

export interface BodeResult {
  /** Frequências em rad/s. */
  w: number[];
  magDb: number[];
  /** Fase em graus, sem saltos de 360°. */
  phase: number[];
  /** Pico de ganho. */
  peak: { w: number; db: number };
  /** Frequências onde o ganho cai 3 dB abaixo da referência (valor em baixa frequência, ou o pico se for passa-faixa). */
  edges3dB: number[];
  /** Ganho em baixa frequência (dB), quando o sistema não tem integrador. */
  lowDb?: number;
  /** Cruzamento do ganho por 0 dB e a margem de fase correspondente (útil para malha aberta). */
  gainCross?: { w: number; phaseMarginDeg: number };
  /** Cruzamento da fase por -180° e a margem de ganho correspondente. */
  phaseCross?: { w: number; gainMarginDb: number };
}

/** Ganho (dB) e fase (graus) em uma frequência. */
export function responseAt(num: number[], den: number[], w: number): { db: number; gain: number; phaseDeg: number } {
  const h = cdiv(polyEvalC(num, [0, w]), polyEvalC(den, [0, w]));
  const gain = cabs(h);
  return { gain, db: 20 * Math.log10(gain), phaseDeg: (carg(h) * 180) / Math.PI };
}

function crossings(x: number[], y: number[], level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < x.length; i++) {
    const a = y[i - 1] - level;
    const b = y[i] - level;
    if (a === 0) out.push(x[i - 1]);
    else if (a * b < 0) {
      const f = a / (a - b);
      out.push(Math.exp(Math.log(x[i - 1]) + f * (Math.log(x[i]) - Math.log(x[i - 1]))));
    }
  }
  return out;
}

export function bode(num: number[], den: number[], range?: { wMin?: number; wMax?: number }, n = 500): BodeResult {
  const mags = [...polyRoots(den), ...(num.length > 1 ? polyRoots(num) : [])].map(cabs).filter((v) => v > 1e-9);
  let wMin = range?.wMin ?? (mags.length ? Math.min(...mags) / 100 : 1e-2);
  let wMax = range?.wMax ?? (mags.length ? Math.max(...mags) * 100 : 1e2);
  if (!(wMin > 0)) wMin = 1e-3;
  if (!(wMax > wMin)) wMax = wMin * 1e4;
  const w: number[] = [];
  const magDb: number[] = [];
  const phase: number[] = [];
  const l0 = Math.log10(wMin);
  const l1 = Math.log10(wMax);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const wi = Math.pow(10, l0 + ((l1 - l0) * i) / (n - 1));
    const r = responseAt(num, den, wi);
    let ph = r.phaseDeg;
    if (i > 0) while (ph - prev > 180) ph -= 360;
    if (i > 0) while (ph - prev < -180) ph += 360;
    prev = ph;
    w.push(wi);
    magDb.push(r.db);
    phase.push(ph);
  }
  let pk = 0;
  magDb.forEach((v, i) => {
    if (v > magDb[pk]) pk = i;
  });
  const hasIntegrator = polyRoots(den).some((p) => cabs(p) < 1e-9);
  const lowDb = hasIntegrator || !Number.isFinite(magDb[0]) ? undefined : magDb[0];
  const ref = lowDb !== undefined && magDb[pk] - lowDb < 6 ? lowDb : magDb[pk];
  const edges3dB = crossings(w, magDb, ref - 3);
  const res: BodeResult = { w, magDb, phase, peak: { w: w[pk], db: magDb[pk] }, edges3dB, lowDb };
  const gc = crossings(w, magDb, 0);
  if (gc.length) {
    const wc = gc[0];
    res.gainCross = { w: wc, phaseMarginDeg: 180 + interp(w, phase, wc) };
  }
  const pc = crossings(w, phase, -180);
  if (pc.length) {
    const wp = pc[0];
    res.phaseCross = { w: wp, gainMarginDb: -interp(w, magDb, wp) };
  }
  return res;
}

function interp(x: number[], y: number[], at: number): number {
  for (let i = 1; i < x.length; i++) {
    if (x[i] >= at) {
      const f = (Math.log(at) - Math.log(x[i - 1])) / (Math.log(x[i]) - Math.log(x[i - 1]));
      return y[i - 1] + f * (y[i] - y[i - 1]);
    }
  }
  return y[y.length - 1];
}
