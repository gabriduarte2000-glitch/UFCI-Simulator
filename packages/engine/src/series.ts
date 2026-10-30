// Armazenamento das curvas simuladas. Cresce conforme a simulação avança e,
// ao passar do limite, descarta metade dos pontos (mantendo os dois lados dos saltos).

export class Series {
  nSignals: number;
  maxPoints: number;
  n = 0;
  t: Float64Array;
  cols: Float64Array[];
  private cap: number;

  constructor(nSignals: number, maxPoints = 200_000) {
    this.nSignals = nSignals;
    this.maxPoints = maxPoints;
    this.cap = 1024;
    this.t = new Float64Array(this.cap);
    this.cols = Array.from({ length: nSignals }, () => new Float64Array(this.cap));
  }

  private grow() {
    this.cap *= 2;
    const nt = new Float64Array(this.cap);
    nt.set(this.t.subarray(0, this.n));
    this.t = nt;
    this.cols = this.cols.map((c) => {
      const nc = new Float64Array(this.cap);
      nc.set(c.subarray(0, this.n));
      return nc;
    });
  }

  push(t: number, sig: Float64Array): void {
    if (this.n >= this.maxPoints) this.decimate();
    if (this.n >= this.cap) this.grow();
    this.t[this.n] = t;
    for (let j = 0; j < this.nSignals; j++) this.cols[j][this.n] = sig[j];
    this.n++;
  }

  /** Mantém um ponto em cada dois, exceto pares com o mesmo instante (saltos). */
  decimate(): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const jump = (i > 0 && this.t[i] === this.t[i - 1]) || (i < this.n - 1 && this.t[i] === this.t[i + 1]);
      if (i % 2 === 0 || jump || i === this.n - 1) {
        this.t[w] = this.t[i];
        for (let j = 0; j < this.nSignals; j++) this.cols[j][w] = this.cols[j][i];
        w++;
      }
    }
    this.n = w;
  }

  clear(): void {
    this.n = 0;
  }

  timeView(): Float64Array {
    return this.t.subarray(0, this.n);
  }

  colView(j: number): Float64Array {
    return this.cols[j].subarray(0, this.n);
  }
}
