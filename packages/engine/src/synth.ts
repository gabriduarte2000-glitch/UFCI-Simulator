// Do modelo matemático ao diagrama ou ao circuito: realizações de G(s) = N(s)/D(s).

import { build } from "./examples";
import { canonicalSS, matText, type EqModel } from "./eqparse";
import { cabs, cdiv, polyEvalC, polyRoots } from "./eig";
import { analyzeMath, tn } from "./math";
import type { ProjectIR } from "./types";

export type RealizationId = "tf" | "ss" | "integrators" | "mech2" | "mech1" | "rc-lp" | "rc-hp" | "rlc-c" | "rlc-r";

export interface RealizationInfo {
  id: RealizationId;
  title: string;
  group: "blocos" | "circuito" | "mecanico";
  description: string;
  available: boolean;
  /** Por que não está disponível. */
  why?: string;
  /** Valores calculados dos componentes, para mostrar antes de montar. */
  values: string[];
}

export interface Synthesis {
  ir: ProjectIR;
  inputId: string;
  outputId: string;
}

export interface SynthOptions {
  /** Impedância de referência (Ω) para escalar R, L e C. */
  scale?: number;
}

type P = Record<string, number | string | boolean>;
type Comp = { id: string; type: string; label?: string; params?: P; pos: [number, number] };
type Ref = [string, string];

/** Coeficientes crescentes, a[i] de s^i, com o denominador mônico. */
function coefs(m: EqModel) {
  const a = m.den.slice().reverse();
  const n = a.length - 1;
  const b = Array.from({ length: n + 1 }, (_, i) => m.num.slice().reverse()[i] ?? 0);
  return { a, b, n, degN: Math.max(0, ...b.map((v, i) => (v !== 0 ? i : 0))) };
}

const fmt = (v: number) => tn(v).replace(/\{,\}/g, ",");

/** Tempo de simulação que mostra o transitório inteiro. */
function horizon(m: EqModel): number {
  const poles = polyRoots(m.den);
  const re = poles.map((p) => Math.abs(p[0])).filter((v) => v > 1e-9);
  const mag = poles.map((p) => cabs(p)).filter((v) => v > 1e-9);
  if (re.length === poles.filter((p) => cabs(p) > 1e-9).length && re.length) return Math.min(1e5, 7 / Math.min(...re));
  if (mag.length) return (6 * 2 * Math.PI) / Math.min(...mag);
  return 10;
}

function niceTf(t: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(t)));
  const f = t / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

class Net {
  comps: Comp[] = [];
  conns: [string, string, string, string][] = [];
  private count = new Map<string, number>();
  add(prefix: string, type: string, label: string, params: P | undefined, pos: [number, number]): string {
    const k = (this.count.get(prefix) ?? 0) + 1;
    this.count.set(prefix, k);
    const id = k === 1 ? prefix : `${prefix}${k}`;
    this.comps.push({ id, type, label, params, pos });
    return id;
  }
  wire(a: string, ap: string, b: string, bp: string) {
    this.conns.push([a, ap, b, bp]);
  }
  ir(name: string, tf: number): ProjectIR {
    return build(name, this.comps, this.conns, { tf: niceTf(tf), rtol: 1e-7, atol: 1e-10 });
  }
}

function stepSource(net: Net, pos: [number, number], label: string): string {
  return net.add("u", "signal.step", label, { t_step: 0, v0: 0, v1: 1 }, pos);
}

// ------------------------------------------------------------------------------------------------ blocos

function realizeTf(m: EqModel): Synthesis {
  const net = new Net();
  const u = stepSource(net, [0, 100], "Entrada (degrau)");
  const g = net.add("g", "control.tf", "G(s)", { num: m.num.map((v) => String(+v.toPrecision(12))).join(" "), den: m.den.map((v) => String(+v.toPrecision(12))).join(" ") }, [260, 100]);
  const sc = net.add("scope", "sink.scope", "Entrada e saída", undefined, [520, 100]);
  net.wire(u, "out", g, "in");
  net.wire(g, "out", sc, "in1");
  net.wire(u, "out", sc, "in2");
  return { ir: net.ir("Função de transferência digitada", horizon(m)), inputId: `${u}.out`, outputId: `${g}.out` };
}

function realizeSS(m: EqModel): Synthesis {
  const s = m.ss ?? canonicalSS(m);
  const net = new Net();
  const u = stepSource(net, [0, 100], "Entrada (degrau)");
  const x = net.add("ss", "control.ss", "Espaço de estados", { A: matText(s.A), B: matText(s.B.map((v) => [v])), C: matText([s.C]), D: String(s.D) }, [260, 100]);
  const sc = net.add("scope", "sink.scope", "Entrada e saída", undefined, [520, 100]);
  net.wire(u, "out", x, "in");
  net.wire(x, "out", sc, "in1");
  net.wire(u, "out", sc, "in2");
  return { ir: net.ir("Espaço de estados", horizon(m)), inputId: `${u}.out`, outputId: `${x}.out` };
}

/** Soma ponderada: cada item é um sinal e um sinal de soma. Usa vários somadores quando passa de 4 entradas. */
function sumTree(net: Net, items: { ref: Ref; sign: 1 | -1 }[], pos: [number, number], label: string): Ref {
  let list = items.slice();
  if (list.length === 1 && list[0].sign === 1) return list[0].ref;
  let step = 0;
  for (;;) {
    const take = list.slice(0, 4);
    const rest = list.slice(4);
    const id = net.add("soma", "math.sum", label, { signs: take.map((t) => (t.sign === 1 ? "+" : "-")).join("") }, [pos[0] + step * 40, pos[1] + step * 120]);
    take.forEach((t, i) => net.wire(t.ref[0], t.ref[1], id, `in${i + 1}`));
    step++;
    if (!rest.length) return [id, "out"];
    list = [{ ref: [id, "out"], sign: 1 }, ...rest];
  }
}

function realizeIntegrators(m: EqModel): Synthesis {
  const { a, b, n } = coefs(m);
  const net = new Net();
  const u = stepSource(net, [0, 120], "Entrada (degrau)");
  // derivs[k] = k-ésima derivada de x (x^(n) é a saída do somador)
  const derivs: Ref[] = new Array(n + 1);
  const X0 = 240;
  const DX = 190;
  // os integradores vêm primeiro para que o somador possa ser ligado depois
  const ints: string[] = [];
  for (let i = 0; i < n; i++) ints.push(net.add("int", "math.integrator", `x${n - 1 - i === 0 ? "" : `^(${n - 1 - i})`}`, undefined, [X0 + DX * (i + 1), 100]));
  const items: { ref: Ref; sign: 1 | -1 }[] = [{ ref: [u, "out"], sign: 1 }];
  const gains: string[] = [];
  for (let i = 0; i < n; i++) derivs[n - 1 - i] = [ints[i], "out"];
  for (let i = 0; i < n; i++) {
    if (a[i] === 0) continue;
    if (a[i] === 1) items.push({ ref: derivs[i], sign: -1 });
    else {
      const g = net.add("a", "math.gain", `a${i} = ${fmt(a[i])}`, { K: a[i] }, [X0 + DX * (n - i) - 20, 260 + 90 * i]);
      net.wire(derivs[i][0], derivs[i][1], g, "in");
      gains.push(g);
      items.push({ ref: [g, "out"], sign: -1 });
    }
  }
  const w = sumTree(net, items, [X0, 120], "x^(n) = u − Σ aᵢ x^(i)");
  derivs[n] = w;
  net.wire(w[0], w[1], ints[0], "in");
  for (let i = 1; i < n; i++) net.wire(ints[i - 1], "out", ints[i], "in");
  // saída y = Σ bᵢ x^(i)
  const outItems: { ref: Ref; sign: 1 | -1 }[] = [];
  for (let i = 0; i <= n; i++) {
    if (b[i] === 0) continue;
    if (b[i] === 1) outItems.push({ ref: derivs[i], sign: 1 });
    else {
      const g = net.add("b", "math.gain", `b${i} = ${fmt(b[i])}`, { K: b[i] }, [X0 + DX * (n + 1) - 60 + 60 * (n - i), -40 - 20 * (n - i)]);
      net.wire(derivs[i][0], derivs[i][1], g, "in");
      outItems.push({ ref: [g, "out"], sign: 1 });
    }
  }
  const y = sumTree(net, outItems, [X0 + DX * (n + 1) + 100, 100], "Saída y");
  const sc = net.add("scope", "sink.scope", "Entrada e saída", undefined, [X0 + DX * (n + 1) + 380, 100]);
  net.wire(y[0], y[1], sc, "in1");
  net.wire(u, "out", sc, "in2");
  return { ir: net.ir("Diagrama de blocos com integradores", horizon(m)), inputId: `${u}.out`, outputId: `${y[0]}.${y[1]}` };
}

// ------------------------------------------------------------------------------------------------ circuitos e sistemas mecânicos

function inputWithGain(net: Net, g: number, pos: [number, number]): Ref {
  const u = stepSource(net, pos, "Tensão de entrada (V)");
  if (Math.abs(g - 1) < 1e-12) return [u, "out"];
  const k = net.add("k", "math.gain", `Ganho ${fmt(g)}`, { K: g }, [pos[0] + 150, pos[1]]);
  net.wire(u, "out", k, "in");
  return [k, "out"];
}

interface Plan {
  info: RealizationInfo;
  make?: () => Synthesis;
}

function plans(m: EqModel, opt: SynthOptions): Plan[] {
  const { a, b, n } = coefs(m);
  const num = m.num.slice().reverse();
  const degN = Math.max(0, ...num.map((v, i) => (v !== 0 ? i : 0)));
  const constNum = degN === 0 && b[0] !== 0;
  const pureS = degN === 1 && b[0] === 0 && b[1] !== 0 && num.length <= 2;
  const hz = horizon(m);
  const out: Plan[] = [];
  const info = (id: RealizationId, title: string, group: RealizationInfo["group"], description: string): RealizationInfo => ({ id, title, group, description, available: true, values: [] });
  const no = (i: RealizationInfo, why: string): Plan => ({ info: { ...i, available: false, why } });

  out.push({ info: { ...info("tf", "Bloco de função de transferência", "blocos", "Um único bloco G(s) com o numerador e o denominador. É o equivalente a tf(num, den) do MATLAB."), values: [`num = [${m.num.map(fmt).join(" ")}]`, `den = [${m.den.map(fmt).join(" ")}]`] }, make: () => realizeTf(m) });

  const cs = canonicalSS(m);
  out.push({ info: { ...info("ss", "Bloco de espaço de estados", "blocos", m.ss ? "Um bloco com as matrizes A, B, C e D que você digitou." : "Um bloco com a forma canônica controlável de G(s). É o equivalente a ss(tf(num, den))."), values: [`A = [${matText(m.ss?.A ?? cs.A)}]`, `B = [${matText((m.ss?.B ?? cs.B).map((v) => [v]))}]`, `C = [${matText([m.ss?.C ?? cs.C])}]`, `D = ${fmt(m.ss?.D ?? cs.D)}`] }, make: () => realizeSS(m) });

  out.push({ info: { ...info("integrators", "Diagrama com integradores", "blocos", `Forma canônica controlável desenhada em blocos: ${n} integrador(es), ganhos e somadores. Cada conexão é uma derivada de x.`), values: a.slice(0, n).map((v, i) => `a${i} = ${fmt(v)}`).concat(b.map((v, i) => (v !== 0 ? `b${i} = ${fmt(v)}` : "")).filter(Boolean)) }, make: () => realizeIntegrators(m) });

  const Z = opt.scale && opt.scale > 0 ? opt.scale : n === 1 ? 1000 : 100;
  // ---- massa, mola e amortecedor: X/F = 1/(m s² + c s + k)
  {
    const i = info("mech2", "Massa, mola e amortecedor (posição)", "mecanico", "Força aplicada a uma massa presa a uma mola e a um amortecedor. A saída é a posição.");
    if (n !== 2) out.push(no(i, "Serve para sistemas de 2ª ordem."));
    else if (!constNum) out.push(no(i, "Precisa de numerador constante."));
    else if (!(b[0] > 0 && a[2] > 0 && a[0] > 0 && a[1] >= 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const M = a[2] / b[0], K = a[0] / b[0], C = a[1] / b[0];
      out.push({
        info: { ...i, values: [`m = ${fmt(M)} kg`, `k = ${fmt(K)} N/m`, C > 0 ? `c = ${fmt(C)} N·s/m` : "sem amortecedor"] },
        make: () => {
          const net = new Net();
          const u = net.add("u", "signal.step", "Força (N)", { t_step: 0, v0: 0, v1: 1 }, [-60, 260]);
          const f = net.add("f", "mech.force", "Força externa", undefined, [150, 250]);
          const w1 = net.add("w", "mech.ground", "Parede", undefined, [0, 110]);
          const k = net.add("k", "mech.spring", "Mola", { k: K }, [130, 110]);
          const mm = net.add("m", "mech.mass", "Massa", { m: M }, [310, 100]);
          net.wire(w1, "b", k, "a");
          net.wire(k, "b", mm, "a");
          if (C > 0) {
            const c = net.add("c", "mech.damper", "Amortecedor", { c: C }, [500, 110]);
            const w2 = net.add("w", "mech.ground", "Parede", undefined, [690, 110]);
            net.wire(mm, "b", c, "a");
            net.wire(c, "b", w2, "a");
          }
          const sc = net.add("scope", "sink.scope", "Força e posição", undefined, [560, -70]);
          net.wire(u, "out", f, "u");
          net.wire(f, "a", mm, "a");
          net.wire(mm, "x", sc, "in1");
          net.wire(u, "out", sc, "in2");
          return { ir: net.ir("Massa, mola e amortecedor (da equação)", hz), inputId: `${u}.out`, outputId: `${mm}.x` };
        },
      });
    }
  }

  // ---- massa e amortecedor: V/F = 1/(m s + c)
  {
    const i = info("mech1", "Massa e amortecedor (velocidade)", "mecanico", "Força aplicada a uma massa que desliza contra um amortecedor. A saída é a velocidade.");
    if (n !== 1) out.push(no(i, "Serve para sistemas de 1ª ordem."));
    else if (!constNum) out.push(no(i, "Precisa de numerador constante."));
    else if (!(b[0] > 0 && a[1] > 0 && a[0] > 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const M = a[1] / b[0], C = a[0] / b[0];
      out.push({
        info: { ...i, values: [`m = ${fmt(M)} kg`, `c = ${fmt(C)} N·s/m`] },
        make: () => {
          const net = new Net();
          const u = net.add("u", "signal.step", "Força (N)", { t_step: 0, v0: 0, v1: 1 }, [-60, 260]);
          const f = net.add("f", "mech.force", "Força externa", undefined, [150, 250]);
          const mm = net.add("m", "mech.mass", "Massa", { m: M }, [210, 100]);
          const c = net.add("c", "mech.damper", "Amortecedor", { c: C }, [400, 110]);
          const w = net.add("w", "mech.ground", "Parede", undefined, [590, 110]);
          const sc = net.add("scope", "sink.scope", "Força e velocidade", undefined, [460, -70]);
          net.wire(mm, "b", c, "a");
          net.wire(c, "b", w, "a");
          net.wire(u, "out", f, "u");
          net.wire(f, "a", mm, "a");
          net.wire(mm, "v", sc, "in1");
          net.wire(u, "out", sc, "in2");
          return { ir: net.ir("Massa e amortecedor (da equação)", hz), inputId: `${u}.out`, outputId: `${mm}.v` };
        },
      });
    }
  }

  // ---- RC passa-baixa: Vc/Vin = 1/(τ s + 1)
  {
    const i = info("rc-lp", "Filtro RC passa-baixa", "circuito", "Resistor em série e capacitor para o terra. A saída é a tensão no capacitor.");
    if (n !== 1) out.push(no(i, "Serve para sistemas de 1ª ordem."));
    else if (!constNum) out.push(no(i, "Precisa de numerador constante."));
    else if (!(a[0] > 0 && a[1] > 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const tau = a[1] / a[0], gain = b[0] / a[0], R = Z, C = tau / R;
      out.push({
        info: { ...i, values: [`R = ${fmt(R)} Ω`, `C = ${fmt(C)} F`, `τ = RC = ${fmt(tau)} s`, ...(Math.abs(gain - 1) > 1e-12 ? [`ganho de entrada = ${fmt(gain)}`] : [])] },
        make: () => {
          const net = new Net();
          const inp = inputWithGain(net, gain, [-340, 100]);
          const v = net.add("v", "elec.vsource", "Fonte", undefined, [0, 80]);
          const r = net.add("r", "elec.resistor", "R", { R }, [180, 0]);
          const c = net.add("c", "elec.capacitor", "C", { C }, [350, 0]);
          const gnd = net.add("g", "elec.ground", "Terra", undefined, [260, 240]);
          const sc = net.add("scope", "sink.scope", "Entrada e tensão no capacitor", undefined, [520, 160]);
          net.wire(inp[0], inp[1], v, "u");
          net.wire(v, "p", r, "a");
          net.wire(r, "b", c, "a");
          net.wire(c, "b", gnd, "a");
          net.wire(v, "n", gnd, "a");
          net.wire(c, "v", sc, "in1");
          net.wire(inp[0], inp[1], sc, "in2");
          return { ir: net.ir("Filtro RC passa-baixa (da equação)", hz), inputId: "u.out", outputId: `${c}.v` };
        },
      });
    }
  }

  // ---- RC passa-alta: Vr/Vin = τ s/(τ s + 1)
  {
    const i = info("rc-hp", "Filtro RC passa-alta", "circuito", "Capacitor em série e resistor para o terra. A saída é a tensão no resistor.");
    if (n !== 1) out.push(no(i, "Serve para sistemas de 1ª ordem."));
    else if (!pureS) out.push(no(i, "Precisa de numerador do tipo K·s."));
    else if (!(a[0] > 0 && a[1] > 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const tau = a[1] / a[0], gain = b[1] / a[1], R = Z, C = tau / R;
      out.push({
        info: { ...i, values: [`R = ${fmt(R)} Ω`, `C = ${fmt(C)} F`, `τ = RC = ${fmt(tau)} s`, ...(Math.abs(gain - 1) > 1e-12 ? [`ganho de entrada = ${fmt(gain)}`] : [])] },
        make: () => {
          const net = new Net();
          const inp = inputWithGain(net, gain, [-340, 100]);
          const v = net.add("v", "elec.vsource", "Fonte", undefined, [0, 80]);
          const c = net.add("c", "elec.capacitor", "C", { C }, [180, 0]);
          const r = net.add("r", "elec.resistor", "R", { R }, [350, 0]);
          const gnd = net.add("g", "elec.ground", "Terra", undefined, [260, 240]);
          const sc = net.add("scope", "sink.scope", "Entrada e tensão no resistor", undefined, [520, 160]);
          net.wire(inp[0], inp[1], v, "u");
          net.wire(v, "p", c, "a");
          net.wire(c, "b", r, "a");
          net.wire(r, "b", gnd, "a");
          net.wire(v, "n", gnd, "a");
          net.wire(r, "v", sc, "in1");
          net.wire(inp[0], inp[1], sc, "in2");
          return { ir: net.ir("Filtro RC passa-alta (da equação)", hz), inputId: "u.out", outputId: `${r}.v` };
        },
      });
    }
  }

  // ---- RLC série: saída no capacitor (passa-baixa) ou no resistor (passa-faixa)
  const rlcValues = () => {
    const w0 = Math.sqrt(a[0] / a[2]);
    const C = 1 / (Z * w0);
    const L = Z / w0;
    const R = a[1] / (a[0] * C);
    return { L, C, R, w0 };
  };
  {
    const i = info("rlc-c", "Circuito RLC série (saída no capacitor)", "circuito", "Fonte, resistor, indutor e capacitor em série. A saída é a tensão no capacitor.");
    if (n !== 2) out.push(no(i, "Serve para sistemas de 2ª ordem."));
    else if (!constNum) out.push(no(i, "Precisa de numerador constante."));
    else if (!(a[0] > 0 && a[2] > 0 && a[1] >= 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const { L, C, R } = rlcValues();
      const gain = b[0] / a[0];
      out.push({
        info: { ...i, values: [`R = ${fmt(R)} Ω`, `L = ${fmt(L)} H`, `C = ${fmt(C)} F`, ...(Math.abs(gain - 1) > 1e-12 ? [`ganho de entrada = ${fmt(gain)}`] : [])] },
        make: () => {
          const net = new Net();
          const inp = inputWithGain(net, gain, [-340, 100]);
          const v = net.add("v", "elec.vsource", "Fonte", undefined, [0, 80]);
          const r = net.add("r", "elec.resistor", "R", { R }, [180, 0]);
          const l = net.add("l", "elec.inductor", "L", { L }, [340, 0]);
          const c = net.add("c", "elec.capacitor", "C", { C }, [500, 0]);
          const gnd = net.add("g", "elec.ground", "Terra", undefined, [330, 240]);
          const sc = net.add("scope", "sink.scope", "Entrada e tensão no capacitor", undefined, [560, 180]);
          net.wire(inp[0], inp[1], v, "u");
          net.wire(v, "p", r, "a");
          net.wire(r, "b", l, "a");
          net.wire(l, "b", c, "a");
          net.wire(c, "b", gnd, "a");
          net.wire(v, "n", gnd, "a");
          net.wire(c, "v", sc, "in1");
          net.wire(inp[0], inp[1], sc, "in2");
          return { ir: net.ir("Circuito RLC série (da equação)", hz), inputId: "u.out", outputId: `${c}.v` };
        },
      });
    }
  }
  {
    const i = info("rlc-r", "Circuito RLC série (saída no resistor)", "circuito", "Fonte, indutor, capacitor e resistor em série. A saída é a tensão no resistor (passa-faixa).");
    if (n !== 2) out.push(no(i, "Serve para sistemas de 2ª ordem."));
    else if (!pureS) out.push(no(i, "Precisa de numerador do tipo K·s."));
    else if (!(a[0] > 0 && a[2] > 0 && a[1] > 0)) out.push(no(i, "Os coeficientes precisam ser positivos."));
    else {
      const { L, C, R } = rlcValues();
      const gain = b[1] / a[1];
      out.push({
        info: { ...i, values: [`R = ${fmt(R)} Ω`, `L = ${fmt(L)} H`, `C = ${fmt(C)} F`, ...(Math.abs(gain - 1) > 1e-12 ? [`ganho de entrada = ${fmt(gain)}`] : [])] },
        make: () => {
          const net = new Net();
          const inp = inputWithGain(net, gain, [-340, 100]);
          const v = net.add("v", "elec.vsource", "Fonte", undefined, [0, 80]);
          const l = net.add("l", "elec.inductor", "L", { L }, [180, 0]);
          const c = net.add("c", "elec.capacitor", "C", { C }, [340, 0]);
          const r = net.add("r", "elec.resistor", "R", { R }, [500, 0]);
          const gnd = net.add("g", "elec.ground", "Terra", undefined, [330, 240]);
          const sc = net.add("scope", "sink.scope", "Entrada e tensão no resistor", undefined, [560, 180]);
          net.wire(inp[0], inp[1], v, "u");
          net.wire(v, "p", l, "a");
          net.wire(l, "b", c, "a");
          net.wire(c, "b", r, "a");
          net.wire(r, "b", gnd, "a");
          net.wire(v, "n", gnd, "a");
          net.wire(r, "v", sc, "in1");
          net.wire(inp[0], inp[1], sc, "in2");
          return { ir: net.ir("Circuito RLC passa-faixa (da equação)", hz), inputId: "u.out", outputId: `${r}.v` };
        },
      });
    }
  }
  return out;
}

/** Todas as realizações possíveis, com as indisponíveis explicadas. */
export function realizations(m: EqModel, opt: SynthOptions = {}): RealizationInfo[] {
  return plans(m, opt).map((p) => p.info);
}

/** Monta o projeto da realização escolhida. */
export function synthesize(m: EqModel, id: RealizationId, opt: SynthOptions = {}): Synthesis {
  const p = plans(m, opt).find((q) => q.info.id === id);
  if (!p) throw new Error("Realização desconhecida.");
  if (!p.make) throw new Error(p.info.why ?? "Realização indisponível para este modelo.");
  return p.make();
}

// ------------------------------------------------------------------------------------------------ conferência

export interface Verification {
  ok: boolean;
  /** Maior erro relativo entre as duas respostas em frequência. */
  maxErr: number;
  message: string;
  /** G(s) do circuito montado, decrescente. */
  num?: number[];
  den?: number[];
}

/** Compara G(s) do projeto montado com a equação, pela resposta em frequência. */
export function verifySynthesis(m: EqModel, s: Synthesis): Verification {
  const ir: ProjectIR = JSON.parse(JSON.stringify(s.ir));
  ir.simulation.tf = Math.min(ir.simulation.tf, 1e-3 * Math.max(ir.simulation.tf, 1e-6));
  let rep;
  try {
    rep = analyzeMath(ir, { input: s.inputId, output: s.outputId });
  } catch (e) {
    return { ok: false, maxErr: Infinity, message: `A análise falhou: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!rep.ok) return { ok: false, maxErr: Infinity, message: rep.error ?? "A análise do circuito montado falhou." };
  if (!rep.tf) return { ok: false, maxErr: Infinity, message: "Não foi possível obter G(s) do circuito montado." };
  const poles = polyRoots(m.den).map(cabs).filter((v) => v > 1e-9);
  const w0 = poles.length ? Math.exp(poles.reduce((q, v) => q + Math.log(v), 0) / poles.length) : 1;
  let maxErr = 0;
  for (const f of [0.05, 0.2, 0.5, 1, 2, 5, 20]) {
    const sj: [number, number] = [0, w0 * f];
    const h1 = cdiv(polyEvalC(m.num, sj), polyEvalC(m.den, sj));
    const h2 = cdiv(polyEvalC(rep.tf.num, sj), polyEvalC(rep.tf.den, sj));
    const e = cabs([h1[0] - h2[0], h1[1] - h2[1]]) / (Math.max(cabs(h1), cabs(h2)) + 1e-30);
    if (Number.isFinite(e)) maxErr = Math.max(maxErr, e);
    else maxErr = Infinity;
  }
  const ok = maxErr < 1e-4;
  return {
    ok,
    maxErr,
    num: rep.tf.num,
    den: rep.tf.den,
    message: ok ? `G(s) do circuito montado coincide com a equação (erro relativo máximo ${maxErr.toExponential(1).replace(".", ",")}).` : `G(s) do circuito montado difere da equação (erro relativo ${maxErr.toExponential(1).replace(".", ",")}).`,
  };
}
