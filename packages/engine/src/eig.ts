// Álgebra linear pequena para a visão matemática: autovalores de matriz real, resolução com números
// complexos, raízes de polinômio e polinômio a partir das raízes. Matrizes são arrays de linhas.

export type Cx = [number, number];
export type Mat = number[][];

export const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
export const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const cabs = (a: Cx) => Math.hypot(a[0], a[1]);
export const carg = (a: Cx) => Math.atan2(a[1], a[0]);

export const zeros = (n: number, m = n): Mat => Array.from({ length: n }, () => new Array<number>(m).fill(0));
export const copyMat = (a: Mat): Mat => a.map((r) => r.slice());

const sign = (a: number, b: number) => (b >= 0 ? Math.abs(a) : -Math.abs(a));

/** Autovalores de uma matriz real (balanceamento, redução de Hessenberg e QR com deslocamento). */
export function eigvals(input: Mat): Cx[] {
  const n = input.length;
  if (n === 0) return [];
  const a = copyMat(input);
  // balanceamento
  const RADIX = 2,
    sq = RADIX * RADIX;
  let done = false;
  while (!done) {
    done = true;
    for (let i = 0; i < n; i++) {
      let r = 0,
        c = 0;
      for (let j = 0; j < n; j++)
        if (j !== i) {
          c += Math.abs(a[j][i]);
          r += Math.abs(a[i][j]);
        }
      if (c !== 0 && r !== 0) {
        let g = r / RADIX,
          f = 1;
        const s = c + r;
        while (c < g) {
          f *= RADIX;
          c *= sq;
        }
        g = r * RADIX;
        while (c > g) {
          f /= RADIX;
          c /= sq;
        }
        if ((c + r) / f < 0.95 * s) {
          done = false;
          g = 1 / f;
          for (let j = 0; j < n; j++) a[i][j] *= g;
          for (let j = 0; j < n; j++) a[j][i] *= f;
        }
      }
    }
  }
  // Hessenberg por eliminação
  for (let m = 1; m < n - 1; m++) {
    let x = 0,
      i = m;
    for (let j = m; j < n; j++)
      if (Math.abs(a[j][m - 1]) > Math.abs(x)) {
        x = a[j][m - 1];
        i = j;
      }
    if (i !== m) {
      for (let j = m - 1; j < n; j++) [a[i][j], a[m][j]] = [a[m][j], a[i][j]];
      for (let j = 0; j < n; j++) [a[j][i], a[j][m]] = [a[j][m], a[j][i]];
    }
    if (x !== 0) {
      for (i = m + 1; i < n; i++) {
        let y = a[i][m - 1];
        if (y !== 0) {
          y /= x;
          a[i][m - 1] = y;
          for (let j = m; j < n; j++) a[i][j] -= y * a[m][j];
          for (let j = 0; j < n; j++) a[j][m] += y * a[j][i];
        }
      }
    }
  }
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
  // QR
  const wr = new Array<number>(n).fill(0),
    wi = new Array<number>(n).fill(0);
  let nn = n - 1,
    t = 0,
    anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
  let l = 0,
    p = 0,
    q = 0,
    r = 0,
    s = 0,
    w = 0,
    x = 0,
    y = 0,
    z = 0;
  while (nn >= 0) {
    let its = 0;
    do {
      for (l = nn; l >= 1; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error("eigvals: não convergiu");
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 0; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            if ((s = sign(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const out: Cx[] = [];
  for (let i = 0; i < n; i++) out.push([wr[i], wi[i]]);
  return out;
}

/** Resolve (A) x = b com A e b complexos, eliminação com pivô parcial. Devolve null se singular. */
export function csolve(A: Cx[][], b: Cx[]): Cx[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r.map((v) => [v[0], v[1]] as Cx), [b[i][0], b[i][1]] as Cx]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let i = c + 1; i < n; i++) if (cabs(M[i][c]) > cabs(M[piv][c])) piv = i;
    if (cabs(M[piv][c]) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = cdiv(M[i][c], M[c][c]);
      if (f[0] === 0 && f[1] === 0) continue;
      for (let j = c; j <= n; j++) M[i][j] = csub(M[i][j], cmul(f, M[c][j]));
    }
  }
  const x: Cx[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s: Cx = M[i][n];
    for (let j = i + 1; j < n; j++) s = csub(s, cmul(M[i][j], x[j]));
    x[i] = cdiv(s, M[i][i]);
  }
  return x;
}

/** Coeficientes (maior potência primeiro) do polinômio mônico com as raízes dadas, que devem vir em pares conjugados. */
export function polyFromRoots(roots: Cx[]): number[] {
  let c: Cx[] = [[1, 0]];
  for (const r of roots) {
    const nc: Cx[] = new Array(c.length + 1).fill(null).map(() => [0, 0] as Cx);
    for (let i = 0; i < c.length; i++) {
      nc[i] = cadd(nc[i], c[i]);
      nc[i + 1] = csub(nc[i + 1], cmul(c[i], r));
    }
    c = nc;
  }
  return c.map((v) => v[0]);
}

/** Raízes de um polinômio (maior potência primeiro) pelos autovalores da matriz companheira. */
export function polyRoots(coef: number[]): Cx[] {
  let k = 0;
  while (k < coef.length - 1 && coef[k] === 0) k++;
  const c = coef.slice(k);
  const n = c.length - 1;
  if (n < 1) return [];
  const C = zeros(n);
  for (let j = 0; j < n; j++) C[0][j] = -c[j + 1] / c[0];
  for (let i = 1; i < n; i++) C[i][i - 1] = 1;
  return eigvals(C);
}

/** Agrupa raízes em pares conjugados exatos (parte imaginária pequena vira zero). */
export function cleanRoots(roots: Cx[], relTol = 1e-9): Cx[] {
  const scale = Math.max(1e-300, ...roots.map(cabs));
  const rs = roots.map((r): Cx => (Math.abs(r[1]) <= relTol * scale ? [r[0], 0] : r));
  const used = new Array(rs.length).fill(false);
  const out: Cx[] = [];
  for (let i = 0; i < rs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    if (rs[i][1] === 0) {
      out.push(rs[i]);
      continue;
    }
    let best = -1,
      bd = Infinity;
    for (let j = i + 1; j < rs.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(rs[j][0] - rs[i][0], rs[j][1] + rs[i][1]);
      if (d < bd) (bd = d), (best = j);
    }
    if (best >= 0) {
      used[best] = true;
      const re = (rs[i][0] + rs[best][0]) / 2,
        im = (Math.abs(rs[i][1]) + Math.abs(rs[best][1])) / 2;
      out.push([re, im], [re, -im]);
    } else out.push([rs[i][0], 0]);
  }
  return out;
}

export function polyEvalC(coef: number[], s: Cx): Cx {
  let acc: Cx = [0, 0];
  for (const c of coef) acc = cadd(cmul(acc, s), [c, 0]);
  return acc;
}
