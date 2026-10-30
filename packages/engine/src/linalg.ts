// Álgebra linear densa mínima: fatoração LU com pivoteamento parcial.
// Usada na análise nodal dos circuitos e em testes.

export class SingularMatrixError extends Error {
  /** Índice da coluna onde o pivô ficou nulo. */
  column: number;
  constructor(column: number) {
    super("Matriz singular");
    this.column = column;
  }
}

export interface LU {
  n: number;
  lu: Float64Array;
  piv: Int32Array;
}

/** Fatora A (n x n, linha a linha). Lança SingularMatrixError se não houver solução única. */
export function luFactor(a: ArrayLike<number>, n: number): LU {
  const lu = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) lu[i] = a[i];
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(lu[i]));
  const tol = Math.max(scale, 1e-300) * 1e-13;
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(lu[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k]);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (max <= tol) throw new SingularMatrixError(k);
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = lu[k * n + j];
        lu[k * n + j] = lu[p * n + j];
        lu[p * n + j] = tmp;
      }
      const t = piv[k];
      piv[k] = piv[p];
      piv[p] = t;
    }
    const d = lu[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = lu[i * n + k] / d;
      lu[i * n + k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
    }
  }
  return { n, lu, piv };
}

/** Resolve A x = b usando a fatoração. Escreve em out. */
export function luSolve(f: LU, b: ArrayLike<number>, out: Float64Array): void {
  const { n, lu, piv } = f;
  for (let i = 0; i < n; i++) out[i] = b[piv[i]];
  for (let i = 1; i < n; i++) {
    let s = out[i];
    for (let j = 0; j < i; j++) s -= lu[i * n + j] * out[j];
    out[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = out[i];
    for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * out[j];
    out[i] = s / lu[i * n + i];
  }
}
