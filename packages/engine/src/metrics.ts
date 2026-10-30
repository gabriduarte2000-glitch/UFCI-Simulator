// Métricas de resposta ao degrau.

export interface StepMetrics {
  initial: number;
  final: number;
  peak: number;
  peakTime: number;
  /** Em %, ou 0 se não houver ultrapassagem. */
  overshootPct: number;
  /** Tempo de subida de 10% a 90%, em s. null se não cruzou. */
  riseTime: number | null;
  /** Tempo de acomodação na faixa de 2%, em s (a partir de tStart). null se não acomodou. */
  settlingTime: number | null;
}

function crossing(t: ArrayLike<number>, y: ArrayLike<number>, i0: number, level: number, up: boolean): number | null {
  for (let i = Math.max(i0, 1); i < t.length; i++) {
    const a = y[i - 1],
      b = y[i];
    if (up ? a < level && b >= level : a > level && b <= level) {
      if (t[i] === t[i - 1] || b === a) return t[i];
      return t[i - 1] + ((level - a) * (t[i] - t[i - 1])) / (b - a);
    }
  }
  return null;
}

/**
 * tStart: instante em que o degrau acontece. O valor inicial é o último ponto antes dele.
 * O valor final é a média do último 5% do tempo registrado.
 */
export function stepMetrics(t: ArrayLike<number>, y: ArrayLike<number>, tStart: number): StepMetrics | null {
  const n = t.length;
  if (n < 3) return null;
  let i0 = 0;
  while (i0 < n - 1 && t[i0 + 1] <= tStart) i0++;
  const initial = y[i0];
  const tEnd = t[n - 1];
  const tTail = tEnd - 0.05 * (tEnd - tStart);
  let sum = 0,
    cnt = 0;
  for (let i = n - 1; i >= 0 && t[i] >= tTail; i--) {
    sum += y[i];
    cnt++;
  }
  const final = cnt > 0 ? sum / cnt : y[n - 1];
  const delta = final - initial;
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-12) return null;
  const dir = delta > 0;
  let peak = initial,
    peakTime = tStart;
  for (let i = i0; i < n; i++) {
    if (dir ? y[i] > peak : y[i] < peak) {
      peak = y[i];
      peakTime = t[i];
    }
  }
  const over = ((peak - final) / delta) * 100;
  const t10 = crossing(t, y, i0, initial + 0.1 * delta, dir);
  const t90 = crossing(t, y, i0, initial + 0.9 * delta, dir);
  let settling: number | null = null;
  const band = 0.02 * Math.abs(delta);
  let last = -1;
  for (let i = i0; i < n; i++) if (Math.abs(y[i] - final) > band) last = i;
  if (last === -1) settling = 0;
  else if (last < n - 1) {
    // Instante em que a curva volta para dentro da faixa depois do último ponto fora.
    const a = Math.abs(y[last] - final),
      b = Math.abs(y[last + 1] - final);
    settling = (a === b ? t[last + 1] : t[last] + ((a - band) / (a - b)) * (t[last + 1] - t[last])) - tStart;
  }
  return {
    initial,
    final,
    peak,
    peakTime,
    overshootPct: Math.max(0, over),
    riseTime: t10 !== null && t90 !== null ? t90 - t10 : null,
    settlingTime: settling,
  };
}
