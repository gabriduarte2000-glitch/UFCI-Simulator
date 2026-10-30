// Blocos de controle e de sinal (domínio causal).
// Cada bloco é construído com os valores atuais dos parâmetros. Mudar um parâmetro
// reconstrói o bloco e mantém o vetor de estados, como definido no Documento Mestre.

import type { PortDef } from "../types";
import { type BlockImpl, type ParamReader, parseMatrix, parseNumberList, registerComponent } from "./registry";

const inPort = (name: string, label: string, optional = false): PortDef => ({ name, label, domain: "signal", dir: "in", optional });
const outPort = (name: string, label: string): PortDef => ({ name, label, domain: "signal", dir: "out" });

const noStates = { nStates: 0, x0: () => [] as number[], der: () => {} };

// ---------------------------------------------------------------- Fontes

registerComponent({
  type: "signal.constant",
  label: "Constante",
  category: "sources",
  labelPrefix: "Constante",
  symbol: "constant",
  description: "Sinal de valor fixo.",
  model: "y = c",
  hypotheses: ["Valor constante em todo o intervalo simulado."],
  ports: [outPort("out", "Saída")],
  params: [{ key: "value", label: "Valor", kind: "number", default: 1, group: "basic" }],
  block: (p) => {
    const c = p.num("value");
    return { ...noStates, feedthrough: false, out: (_t, _x, _o, _u, y) => void (y[0] = c) };
  },
});

registerComponent({
  type: "signal.manual",
  label: "Entrada manual",
  category: "sources",
  labelPrefix: "Entrada manual",
  symbol: "manual",
  description: "Valor fixo com controle deslizante. Pode ser alterado com a simulação em andamento.",
  model: "y = c (alterado pelo usuário)",
  hypotheses: ["A mudança vale a partir do instante em que o usuário mexe no controle. O instante fica marcado no gráfico."],
  ports: [outPort("out", "Saída")],
  params: [
    { key: "value", label: "Valor", kind: "number", default: 0, group: "basic" },
    { key: "min", label: "Mínimo do controle", kind: "number", default: -1, group: "advanced" },
    { key: "max", label: "Máximo do controle", kind: "number", default: 1, group: "advanced" },
  ],
  block: (p) => {
    const c = p.num("value");
    return { ...noStates, feedthrough: false, out: (_t, _x, _o, _u, y) => void (y[0] = c) };
  },
});

registerComponent({
  type: "signal.step",
  label: "Degrau",
  category: "sources",
  labelPrefix: "Degrau",
  symbol: "step",
  description: "Sinal que vale um valor inicial e muda para um valor final em um instante.",
  model: "y = v0 para t < t_degrau, y = v1 para t ≥ t_degrau",
  hypotheses: ["Mudança instantânea. O motor pousa o passo exatamente no instante do degrau."],
  ports: [outPort("out", "Saída")],
  params: [
    { key: "t_step", label: "Instante do degrau", unit: "s", kind: "number", default: 1, min: 0, group: "basic" },
    { key: "v0", label: "Valor inicial", kind: "number", default: 0, group: "basic" },
    { key: "v1", label: "Valor final", kind: "number", default: 1, group: "basic" },
  ],
  block: (p) => {
    const ts = p.num("t_step"),
      v0 = p.num("v0"),
      v1 = p.num("v1");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => void (y[0] = t >= ts ? v1 : v0),
      breakpoints: (t0, tf) => (ts > t0 && ts < tf ? [ts] : []),
    };
  },
});

registerComponent({
  type: "signal.ramp",
  label: "Rampa",
  category: "sources",
  labelPrefix: "Rampa",
  symbol: "ramp",
  description: "Sinal que cresce linearmente a partir de um instante.",
  model: "y = v0 para t < t_início, y = v0 + a·(t − t_início) depois",
  hypotheses: ["A inclinação é constante. Sem limite superior."],
  ports: [outPort("out", "Saída")],
  params: [
    { key: "slope", label: "Inclinação", unit: "1/s", kind: "number", default: 1, group: "basic" },
    { key: "t_start", label: "Instante inicial", unit: "s", kind: "number", default: 0, min: 0, group: "basic" },
    { key: "v0", label: "Valor inicial", kind: "number", default: 0, group: "basic" },
  ],
  block: (p) => {
    const a = p.num("slope"),
      ts = p.num("t_start"),
      v0 = p.num("v0");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => void (y[0] = t >= ts ? v0 + a * (t - ts) : v0),
      breakpoints: (t0, tf) => (ts > t0 && ts < tf ? [ts] : []),
    };
  },
});

registerComponent({
  type: "signal.sine",
  label: "Senoide",
  category: "sources",
  labelPrefix: "Senoide",
  symbol: "sine",
  description: "Sinal senoidal com amplitude, frequência, fase e nível contínuo.",
  model: "y = A·sen(2π·f·t + φ) + c",
  hypotheses: ["O passo máximo é limitado a 1/20 do período para a senoide ficar bem amostrada."],
  ports: [outPort("out", "Saída")],
  params: [
    { key: "amp", label: "Amplitude", kind: "number", default: 1, group: "basic" },
    { key: "freq", label: "Frequência", unit: "Hz", kind: "number", default: 1, min: 0, group: "basic" },
    { key: "phase", label: "Fase", unit: "rad", kind: "number", default: 0, group: "basic" },
    { key: "offset", label: "Nível contínuo", kind: "number", default: 0, group: "basic" },
  ],
  block: (p) => {
    const A = p.num("amp"),
      f = p.num("freq"),
      ph = p.num("phase"),
      c = p.num("offset");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => void (y[0] = A * Math.sin(2 * Math.PI * f * t + ph) + c),
      minTimescale: () => (f > 0 ? 1 / (20 * f) : Infinity),
    };
  },
});

registerComponent({
  type: "signal.pulse",
  label: "Onda quadrada",
  category: "sources",
  labelPrefix: "Onda quadrada",
  symbol: "pulse",
  description: "Pulso periódico entre dois valores.",
  model: "alto por duty·T de cada período T, a partir do atraso",
  hypotheses: ["Bordas instantâneas. O motor pousa o passo em cada borda."],
  ports: [outPort("out", "Saída")],
  params: [
    { key: "hi", label: "Valor alto", kind: "number", default: 1, group: "basic" },
    { key: "lo", label: "Valor baixo", kind: "number", default: 0, group: "basic" },
    { key: "period", label: "Período", unit: "s", kind: "number", default: 2, min: 1e-6, group: "basic" },
    { key: "duty", label: "Ciclo de trabalho", unit: "%", kind: "number", default: 50, min: 0, max: 100, group: "basic" },
    { key: "delay", label: "Atraso", unit: "s", kind: "number", default: 0, min: 0, group: "advanced" },
  ],
  block: (p) => {
    const hi = p.num("hi"),
      lo = p.num("lo"),
      T = p.num("period"),
      d = p.num("duty") / 100,
      td = p.num("delay");
    return {
      ...noStates,
      feedthrough: false,
      out: (t, _x, _o, _u, y) => {
        if (t < td) {
          y[0] = lo;
          return;
        }
        const k = Math.floor((t - td) / T + 1e-12);
        const ph = t - td - k * T;
        y[0] = ph < d * T - 1e-12 * T ? hi : lo;
      },
      breakpoints: (t0, tf) => {
        const out: number[] = [];
        const maxN = 200000;
        for (let k = 0; out.length < maxN; k++) {
          const rise = td + k * T;
          if (rise >= tf) break;
          if (rise > t0) out.push(rise);
          const fall = rise + d * T;
          if (d > 0 && d < 1 && fall > t0 && fall < tf) out.push(fall);
        }
        return out;
      },
    };
  },
});

// ---------------------------------------------------------------- Operadores

const signsOf = (p: ParamReader): string => p.str("signs").replace(/\s/g, "");

registerComponent({
  type: "math.sum",
  label: "Somador",
  category: "math",
  labelPrefix: "Somador",
  symbol: "sum",
  description: "Soma ou subtrai de 2 a 4 sinais. O texto de sinais define a operação de cada entrada.",
  model: "y = Σ sinal_i · u_i",
  hypotheses: ["Sem dinâmica: a saída responde no mesmo instante às entradas."],
  ports: (p) => {
    const n = Math.min(4, Math.max(2, signsOf(p).length));
    return [
      ...Array.from({ length: n }, (_, i) => inPort(`in${i + 1}`, `Entrada ${i + 1}`)),
      outPort("out", "Saída"),
    ];
  },
  params: [
    {
      key: "signs",
      label: "Sinais das entradas",
      kind: "text",
      default: "+-",
      group: "basic",
      structural: true,
      hint: "Use + e −, por exemplo +- para referência menos medição. De 2 a 4 entradas.",
    },
  ],
  block: (p) => {
    const raw = signsOf(p);
    if (raw.length < 2 || raw.length > 4 || /[^+-]/.test(raw))
      throw new Error('Os sinais do somador devem ser de 2 a 4 caracteres, só "+" e "-".');
    const s = [...raw].map((c) => (c === "+" ? 1 : -1));
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => {
        let acc = 0;
        for (let i = 0; i < s.length; i++) acc += s[i] * u[i];
        y[0] = acc;
      },
    };
  },
});

registerComponent({
  type: "math.gain",
  label: "Ganho",
  category: "math",
  labelPrefix: "Ganho",
  symbol: "gain",
  description: "Multiplica o sinal por uma constante.",
  model: "y = K·u",
  hypotheses: ["Sem dinâmica."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [{ key: "K", label: "Ganho K", kind: "number", default: 1, group: "basic" }],
  block: (p) => {
    const K = p.num("K");
    return { ...noStates, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = K * u[0]) };
  },
});

registerComponent({
  type: "math.integrator",
  label: "Integrador",
  category: "math",
  labelPrefix: "Integrador",
  symbol: "integrator",
  description: "Integra o sinal no tempo.",
  model: "dy/dt = u, y(t0) = y0",
  hypotheses: ["Sem limites de saturação."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [{ key: "x0", label: "Condição inicial", kind: "number", default: 0, group: "initial", initialOnly: true }],
  block: (p) => {
    const x0 = p.num("x0");
    return {
      nStates: 1,
      x0: () => [x0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      der: (_t, _x, o, u, dx) => void (dx[o] = u[0]),
    };
  },
});

registerComponent({
  type: "math.derivative",
  label: "Derivador filtrado",
  category: "math",
  labelPrefix: "Derivador",
  symbol: "derivative",
  description: "Deriva o sinal com um filtro de primeira ordem, para não amplificar o ruído sem limite.",
  model: "Y(s)/U(s) = N·s/(s + N)",
  hypotheses: ["A derivada ideal não é realizável. N é a frequência do filtro e deve ser bem maior que a dinâmica de interesse."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [{ key: "N", label: "Frequência do filtro N", unit: "rad/s", kind: "number", default: 100, min: 1e-6, group: "basic" }],
  block: (p) => {
    const N = p.num("N");
    return {
      nStates: 1,
      x0: () => [0],
      feedthrough: true,
      out: (_t, x, o, u, y) => void (y[0] = N * (u[0] - x[o])),
      der: (_t, x, o, u, dx) => void (dx[o] = N * (u[0] - x[o])),
    };
  },
});

// ---------------------------------------------------------------- Controle

/** Forma canônica controlável de uma função de transferência própria. */
export function tfToCanonical(numText: string, denText: string): { a: number[]; c: number[]; d: number } {
  const num = parseNumberList(numText, "Numerador");
  const den = parseNumberList(denText, "Denominador");
  while (num.length > 1 && num[0] === 0) num.shift();
  while (den.length > 1 && den[0] === 0) den.shift();
  if (den[0] === 0) throw new Error("O denominador não pode ser zero.");
  if (num.length > den.length)
    throw new Error("A função de transferência não é própria (grau do numerador maior que o do denominador).");
  const d0 = den[0];
  const n = den.length - 1;
  const a = den.slice(1).map((v) => v / d0);
  const b = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < num.length; i++) b[n + 1 - num.length + i] = num[i] / d0;
  const D = b[0];
  const c = new Array<number>(n);
  for (let i = 1; i <= n; i++) c[i - 1] = b[i] - a[i - 1] * D;
  return { a, c, d: D };
}

registerComponent({
  type: "control.tf",
  label: "Função de transferência",
  category: "control",
  labelPrefix: "G(s)",
  symbol: "tf",
  description: "Função de transferência G(s) = N(s)/D(s). Coeficientes da maior potência para a menor.",
  model: "G(s) = (b0·s^n + … + bn) / (s^n + a1·s^(n−1) + … + an), em forma canônica controlável",
  hypotheses: [
    "Sistema linear e invariante no tempo, com estados iniciais nulos.",
    "Só funções próprias (grau do numerador menor ou igual ao do denominador).",
    "Mudar os coeficientes sem mudar a ordem mantém os estados internos, não a saída.",
  ],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [
    { key: "num", label: "Numerador", kind: "text", default: "1", group: "basic", hint: "Ex.: 1  ou  2 1  para 2s + 1" },
    { key: "den", label: "Denominador", kind: "text", default: "1 1", group: "basic", hint: "Ex.: 1 2 1  para s² + 2s + 1" },
  ],
  block: (p) => {
    const { a, c, d } = tfToCanonical(p.str("num"), p.str("den"));
    const n = a.length;
    return {
      nStates: n,
      x0: () => new Array<number>(n).fill(0),
      feedthrough: d !== 0,
      out: (_t, x, o, u, y) => {
        let s = d * u[0];
        for (let i = 0; i < n; i++) s += c[i] * x[o + i];
        y[0] = s;
      },
      der: (_t, x, o, u, dx) => {
        let s = u[0];
        for (let i = 0; i < n; i++) s -= a[i] * x[o + i];
        dx[o] = s;
        for (let i = 1; i < n; i++) dx[o + i] = x[o + i - 1];
      },
    };
  },
});

registerComponent({
  type: "control.ss",
  label: "Espaço de estados",
  category: "control",
  labelPrefix: "Estados",
  symbol: "ss",
  description: "Sistema linear de uma entrada e uma saída em espaço de estados.",
  model: "dx/dt = A·x + B·u,  y = C·x + D·u",
  hypotheses: ["Uma entrada e uma saída. Linhas separadas por ponto e vírgula."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [
    { key: "A", label: "Matriz A", kind: "text", default: "0 1; -2 -3", group: "basic" },
    { key: "B", label: "Matriz B", kind: "text", default: "0; 1", group: "basic" },
    { key: "C", label: "Matriz C", kind: "text", default: "1 0", group: "basic" },
    { key: "D", label: "Matriz D", kind: "text", default: "0", group: "basic" },
    { key: "x0", label: "Estado inicial", kind: "text", default: "", group: "initial", initialOnly: true, hint: "Vazio significa zeros. Ex.: 1 0" },
  ],
  block: (p) => {
    const A = parseMatrix(p.str("A"), "Matriz A");
    const B = parseMatrix(p.str("B"), "Matriz B");
    const C = parseMatrix(p.str("C"), "Matriz C");
    const D = parseMatrix(p.str("D"), "Matriz D");
    const n = A.length;
    if (A.some((r) => r.length !== n)) throw new Error("A matriz A precisa ser quadrada.");
    if (B.length !== n || B[0].length !== 1) throw new Error(`A matriz B precisa ter ${n} linha(s) e 1 coluna.`);
    if (C.length !== 1 || C[0].length !== n) throw new Error(`A matriz C precisa ter 1 linha e ${n} coluna(s).`);
    if (D.length !== 1 || D[0].length !== 1) throw new Error("A matriz D precisa ser 1 por 1.");
    const x0txt = p.str("x0").trim();
    const x0 = x0txt === "" ? new Array<number>(n).fill(0) : parseNumberList(x0txt, "Estado inicial");
    if (x0.length !== n) throw new Error(`O estado inicial precisa ter ${n} valor(es).`);
    const d = D[0][0];
    return {
      nStates: n,
      x0: () => [...x0],
      feedthrough: d !== 0,
      out: (_t, x, o, u, y) => {
        let s = d * u[0];
        for (let i = 0; i < n; i++) s += C[0][i] * x[o + i];
        y[0] = s;
      },
      der: (_t, x, o, u, dx) => {
        for (let i = 0; i < n; i++) {
          let s = B[i][0] * u[0];
          for (let j = 0; j < n; j++) s += A[i][j] * x[o + j];
          dx[o + i] = s;
        }
      },
    };
  },
});

registerComponent({
  type: "control.pid",
  label: "PID",
  category: "control",
  labelPrefix: "PID",
  symbol: "pid",
  description: "Controlador PID com filtro derivativo, limite de saída e anti-windup por rastreamento.",
  model: "C(s) = Kp + Ki/s + Kd·N·s/(s + N). Com limite: y = sat(v) e dI/dt = Ki·e + Kaw·(y − v)",
  hypotheses: [
    "O termo integral I guarda o valor do termo, então mudar Ki com a simulação rodando não gera salto na saída.",
    "O anti-windup por rastreamento só atua quando o limite de saída está ligado.",
    "Valores padrão ilustrativos.",
  ],
  ports: [inPort("in", "Erro"), outPort("out", "Controle")],
  params: [
    { key: "Kp", label: "Ganho proporcional Kp", kind: "number", default: 1, group: "basic" },
    { key: "Ki", label: "Ganho integral Ki", unit: "1/s", kind: "number", default: 0, group: "basic" },
    { key: "Kd", label: "Ganho derivativo Kd", unit: "s", kind: "number", default: 0, min: 0, group: "basic" },
    { key: "N", label: "Filtro derivativo N", unit: "rad/s", kind: "number", default: 100, min: 1e-6, group: "advanced" },
    { key: "limit", label: "Limitar a saída", kind: "bool", default: false, group: "advanced" },
    { key: "umin", label: "Saída mínima", kind: "number", default: -10, group: "advanced" },
    { key: "umax", label: "Saída máxima", kind: "number", default: 10, group: "advanced" },
    { key: "Kaw", label: "Ganho anti-windup", unit: "1/s", kind: "number", default: 10, min: 0, group: "advanced" },
    { key: "I0", label: "Termo integral inicial", kind: "number", default: 0, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const Kp = p.num("Kp"),
      Ki = p.num("Ki"),
      Kd = p.num("Kd"),
      N = p.num("N"),
      lim = p.bool("limit"),
      lo = p.num("umin"),
      hi = p.num("umax"),
      Kaw = p.num("Kaw"),
      I0 = p.num("I0");
    if (lim && lo >= hi) throw new Error("A saída mínima precisa ser menor que a máxima.");
    return {
      nStates: 2,
      x0: () => [I0, 0],
      feedthrough: Kp !== 0 || Kd !== 0,
      out: (_t, x, o, u, y) => {
        const e = u[0];
        const v = Kp * e + x[o] + Kd * N * (e - x[o + 1]);
        y[0] = lim ? Math.min(hi, Math.max(lo, v)) : v;
      },
      der: (_t, x, o, u, dx) => {
        const e = u[0];
        const v = Kp * e + x[o] + Kd * N * (e - x[o + 1]);
        const yv = lim ? Math.min(hi, Math.max(lo, v)) : v;
        dx[o] = Ki * e + (lim ? Kaw * (yv - v) : 0);
        dx[o + 1] = N * (e - x[o + 1]);
      },
    };
  },
});

// ---------------------------------------------------------------- Não linearidades

registerComponent({
  type: "nonlinear.saturation",
  label: "Saturação",
  category: "nonlinear",
  labelPrefix: "Saturação",
  symbol: "saturation",
  description: "Limita o sinal entre um mínimo e um máximo.",
  model: "y = min(máx, max(mín, u))",
  hypotheses: ["Não linear, sem dinâmica. As quinas não têm detecção de evento: o passo adaptativo cuida do erro."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [
    { key: "lo", label: "Mínimo", kind: "number", default: -1, group: "basic" },
    { key: "hi", label: "Máximo", kind: "number", default: 1, group: "basic" },
  ],
  block: (p) => {
    const lo = p.num("lo"),
      hi = p.num("hi");
    if (lo >= hi) throw new Error("O mínimo precisa ser menor que o máximo.");
    return { ...noStates, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = Math.min(hi, Math.max(lo, u[0]))) };
  },
});

registerComponent({
  type: "nonlinear.deadzone",
  label: "Zona morta",
  category: "nonlinear",
  labelPrefix: "Zona morta",
  symbol: "deadzone",
  description: "Saída nula enquanto a entrada está dentro de uma faixa.",
  model: "y = u − hi se u > hi;  y = u − lo se u < lo;  y = 0 dentro da faixa",
  hypotheses: ["Não linear, sem dinâmica."],
  ports: [inPort("in", "Entrada"), outPort("out", "Saída")],
  params: [
    { key: "lo", label: "Início da zona", kind: "number", default: -0.5, group: "basic" },
    { key: "hi", label: "Fim da zona", kind: "number", default: 0.5, group: "basic" },
  ],
  block: (p) => {
    const lo = p.num("lo"),
      hi = p.num("hi");
    if (lo >= hi) throw new Error("O início da zona precisa ser menor que o fim.");
    return {
      ...noStates,
      feedthrough: true,
      out: (_t, _x, _o, u, y) => void (y[0] = u[0] > hi ? u[0] - hi : u[0] < lo ? u[0] - lo : 0),
    };
  },
});

// ---------------------------------------------------------------- Saídas

registerComponent({
  type: "sink.scope",
  label: "Scope",
  category: "sinks",
  labelPrefix: "Scope",
  symbol: "scope",
  description: "Registra até 4 sinais e os mostra no mesmo gráfico.",
  model: "registra u1..u4 no tempo",
  hypotheses: ["Só observa. Não altera o sistema."],
  ports: [inPort("in1", "Sinal 1", true), inPort("in2", "Sinal 2", true), inPort("in3", "Sinal 3", true), inPort("in4", "Sinal 4", true)],
  params: [],
  block: () => ({ ...noStates, feedthrough: false, out: () => {} }),
});
