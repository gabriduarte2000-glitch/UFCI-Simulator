// Componentes de processo industrial, empresariais, matemáticos extras e anotações.
// Todos são blocos de sinal (causais): as vazões, temperaturas e estoques são números
// que passam pelos fios. Os valores padrão são ilustrativos.

import type { ParamDef, PortDef } from "../types";
import { tfToCanonical } from "./blocks";
import { type BlockImpl, type ParamReader, registerComponent } from "./registry";

const inP = (name: string, label: string, short: string, unit = "", optional = false): PortDef => ({ name, label, short, unit, domain: "signal", dir: "in", optional });
const outP = (name: string, label: string, short: string, unit = ""): PortDef => ({ name, label, short, unit, domain: "signal", dir: "out" });
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Constantes físicas (água).
const RHO = 1000; // kg/m³
const CP = 4186; // J/(kg·K)
const RHOCP = RHO * CP; // J/(m³·K)
const HFG = 2.257e6; // J/kg, calor latente de vaporização a 100 °C
const T_SAT = 100; // °C, pressão atmosférica
const LMIN = 1 / 60000; // converte L/min em m³/s

const timeNote = "O tempo da simulação é interpretado em segundos neste componente.";

// ---------------------------------------------------------------- Matemática extra

registerComponent({
  type: "math.product",
  label: "Produto e divisão",
  category: "math",
  labelPrefix: "Produto",
  symbol: "product",
  description: "Multiplica ou divide de 2 a 3 sinais. O texto define a operação de cada entrada: * multiplica, / divide.",
  model: "y = u1 · u2 / u3 (conforme o texto de operações)",
  hypotheses: ["Sem dinâmica. Dividir por zero gera erro de valor inválido no solver."],
  ports: (p) => {
    const n = Math.min(3, Math.max(2, p.str("ops").replace(/\s/g, "").length));
    return [...Array.from({ length: n }, (_, i) => inP(`in${i + 1}`, `Entrada ${i + 1}`, String(i + 1))), outP("out", "Saída", "")];
  },
  params: [{ key: "ops", label: "Operações das entradas", kind: "text", default: "**", group: "basic", structural: true, hint: "* multiplica e / divide. Ex.: ** ou */ ou **/" }],
  block: (p) => {
    const raw = p.str("ops").replace(/\s/g, "");
    if (raw.length < 2 || raw.length > 3 || /[^*/]/.test(raw)) throw new Error('As operações do produto devem ter 2 ou 3 caracteres, só "*" e "/".');
    const mul = [...raw].map((c) => c === "*");
    return {
      nStates: 0,
      x0: () => [],
      der: () => {},
      feedthrough: true,
      out: (_t, _x, _o, u, y) => {
        let acc = 1;
        for (let i = 0; i < mul.length; i++) acc = mul[i] ? acc * u[i] : acc / u[i];
        y[0] = acc;
      },
    };
  },
});

registerComponent({
  type: "math.sqrt",
  label: "Raiz quadrada",
  category: "math",
  labelPrefix: "Raiz",
  symbol: "sqrt",
  description: "Raiz quadrada do sinal. Valores negativos são tratados como zero.",
  model: "y = √max(0, u)",
  hypotheses: ["Sem dinâmica. A derivada da raiz é infinita em zero: perto de zero o solver usa passos menores."],
  ports: [inP("in", "Entrada", ""), outP("out", "Saída", "")],
  params: [],
  block: () => ({ nStates: 0, x0: () => [], der: () => {}, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = Math.sqrt(Math.max(0, u[0]))) }),
});

registerComponent({
  type: "math.abs",
  label: "Valor absoluto",
  category: "math",
  labelPrefix: "Absoluto",
  symbol: "abs",
  description: "Valor absoluto do sinal.",
  model: "y = |u|",
  hypotheses: ["Sem dinâmica."],
  ports: [inP("in", "Entrada", ""), outP("out", "Saída", "")],
  params: [],
  block: () => ({ nStates: 0, x0: () => [], der: () => {}, feedthrough: true, out: (_t, _x, _o, u, y) => void (y[0] = Math.abs(u[0])) }),
});

// ---------------------------------------------------------------- Atrasos e integrador limitado

registerComponent({
  type: "control.lag",
  label: "Atraso de 1ª ordem",
  category: "control",
  labelPrefix: "Atraso",
  symbol: "lag",
  description: "Filtro de primeira ordem. Serve de sensor com resposta lenta, de atuador ou de atraso de produção.",
  model: "τ·dy/dt + y = K·u",
  hypotheses: ["Linear. A saída começa no valor inicial informado."],
  ports: [inP("in", "Entrada", ""), outP("out", "Saída", "")],
  params: [
    { key: "K", label: "Ganho K", kind: "number", default: 1, group: "basic" },
    { key: "tau", label: "Constante de tempo τ", unit: "s", kind: "number", default: 5, min: 1e-6, group: "basic" },
    { key: "y0", label: "Saída inicial", kind: "number", default: 0, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const K = p.num("K"),
      tau = p.num("tau"),
      y0 = p.num("y0");
    return {
      nStates: 1,
      x0: () => [y0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      der: (_t, x, o, u, dx) => void (dx[o] = (K * u[0] - x[o]) / tau),
      minTimescale: () => tau / 5,
    };
  },
});

function padeCoeffs(n: number, T: number): { num: string; den: string } {
  const f = (k: number): number => (k <= 1 ? 1 : k * f(k - 1));
  const c = (k: number) => (f(2 * n - k) * f(n)) / (f(2 * n) * f(k) * f(n - k));
  const den: number[] = [],
    num: number[] = [];
  for (let k = n; k >= 0; k--) {
    den.push(c(k) * T ** k);
    num.push((k % 2 === 0 ? 1 : -1) * c(k) * T ** k);
  }
  return { num: num.join(" "), den: den.join(" ") };
}

registerComponent({
  type: "control.deadtime",
  label: "Tempo morto (Padé)",
  category: "control",
  labelPrefix: "Tempo morto",
  symbol: "deadtime",
  description: "Atraso puro de transporte, aproximado por uma função de Padé. Representa o tempo que o fluido leva para percorrer um tubo até o sensor. Use com sinais que variam devagar, como temperatura.",
  model: "y(t) = u(t − T), aproximado por Padé de ordem n",
  hypotheses: [
    "A aproximação de Padé é boa para sinais lentos em relação a T. Um degrau na entrada produz uma resposta inversa inicial (a saída parte de −1 ou +1 do tamanho do degrau, conforme a ordem), que é um defeito da aproximação.",
    "Ordem maior aproxima melhor e custa mais estados.",
  ],
  ports: [inP("in", "Entrada", ""), outP("out", "Saída", "")],
  params: [
    { key: "T", label: "Tempo morto T", unit: "s", kind: "number", default: 5, min: 1e-6, group: "basic" },
    { key: "n", label: "Ordem de Padé", kind: "int", default: 3, min: 1, max: 6, group: "advanced", structural: true },
    { key: "y0", label: "Valor antes da chegada", kind: "number", default: 0, group: "initial", hint: "Valor que a saída mostra até o atraso passar. Deve ser igual ao valor inicial da entrada." },
  ],
  block: (p) => {
    const T = p.num("T"),
      n = p.num("n"),
      y0 = p.num("y0");
    const { num, den } = padeCoeffs(n, T);
    const { a, c, d } = tfToCanonical(num, den);
    const m = a.length;
    return {
      nStates: m,
      x0: () => new Array<number>(m).fill(0),
      feedthrough: d !== 0,
      out: (_t, x, o, u, y) => {
        let s = d * (u[0] - y0);
        for (let i = 0; i < m; i++) s += c[i] * x[o + i];
        y[0] = y0 + s;
      },
      der: (_t, x, o, u, dx) => {
        let s = u[0] - y0;
        for (let i = 0; i < m; i++) s -= a[i] * x[o + i];
        dx[o] = s;
        for (let i = 1; i < m; i++) dx[o + i] = x[o + i - 1];
      },
      minTimescale: () => T / 4,
    };
  },
});

/** Integrador cuja saída fica entre um mínimo e um máximo, sem acumular além deles. */
function limitedIntegrator(lo: number, hi: number, x0: number): BlockImpl {
  return {
    nStates: 1,
    x0: () => [x0],
    feedthrough: false,
    out: (_t, x, o, _u, y) => void (y[0] = clamp(x[o], lo, hi)),
    der: (_t, x, o, u, dx) => {
      const xc = clamp(x[o], lo, hi);
      const v = u[0];
      dx[o] = (xc <= lo && v < 0) || (xc >= hi && v > 0) ? 0 : v;
    },
  };
}

registerComponent({
  type: "nonlinear.integrator_lim",
  label: "Integrador limitado",
  category: "nonlinear",
  labelPrefix: "Integrador limitado",
  symbol: "intlim",
  description: "Integrador cuja saída não passa de um mínimo nem de um máximo.",
  model: "dx/dt = u, com x mantido entre mín e máx",
  hypotheses: ["Quando o limite é atingido a entrada naquele sentido é ignorada (sem acúmulo)."],
  ports: [inP("in", "Entrada", ""), outP("out", "Saída", "")],
  params: [
    { key: "lo", label: "Mínimo", kind: "number", default: 0, group: "basic" },
    { key: "hi", label: "Máximo", kind: "number", default: 100, group: "basic" },
    { key: "x0", label: "Condição inicial", kind: "number", default: 0, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const lo = p.num("lo"),
      hi = p.num("hi");
    if (lo >= hi) throw new Error("O mínimo precisa ser menor que o máximo.");
    return limitedIntegrator(lo, hi, p.num("x0"));
  },
});

// ---------------------------------------------------------------- Processos industriais

registerComponent({
  type: "process.tank",
  label: "Tanque",
  category: "process",
  labelPrefix: "Tanque",
  symbol: "tank",
  description: "Tanque de seção constante com saída por gravidade. O nível sobe com a vazão de entrada e desce com a saída.",
  model: "A·dh/dt = q_in − k·√h − q_ext   (vazões em L/min convertidas para m³/s)",
  hypotheses: [
    "Líquido incompressível, seção constante.",
    "Saída por gravidade: vazão proporcional à raiz do nível (orifício, queda de pressão da coluna).",
    "O nível não passa de zero nem do máximo: acima do máximo o excesso transborda.",
    "Vazões negativas são tratadas como zero (sem retorno).",
    timeNote,
    "Valores padrão ilustrativos.",
  ],
  ports: [
    inP("qin", "Vazão de entrada", "q", "L/min"),
    inP("qext", "Saída externa (consumo)", "ext", "L/min", true),
    outP("h", "Nível", "h", "m"),
    outP("pct", "Nível em porcentagem", "%", "%"),
    outP("qout", "Vazão de saída por gravidade", "qs", "L/min"),
  ],
  params: [
    { key: "A", label: "Área da seção", unit: "m²", kind: "number", default: 1.2, min: 1e-4, group: "basic" },
    { key: "hmax", label: "Altura total", unit: "m", kind: "number", default: 2, min: 1e-3, group: "basic" },
    { key: "kout", label: "Coeficiente da saída k", unit: "L/min/√m", kind: "number", default: 60, min: 0, group: "basic", hint: "A saída vale k·√nível. Zero fecha a saída por gravidade." },
    { key: "h0", label: "Nível inicial", unit: "m", kind: "number", default: 1, min: 0, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const A = p.num("A"),
      hmax = p.num("hmax"),
      k = p.num("kout"),
      h0 = p.num("h0");
    if (h0 > hmax) throw new Error("O nível inicial não pode passar da altura total.");
    return {
      nStates: 1,
      x0: () => [h0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        const h = clamp(x[o], 0, hmax);
        y[0] = h;
        y[1] = (100 * h) / hmax;
        y[2] = k * Math.sqrt(h);
      },
      der: (_t, x, o, u, dx) => {
        const h = clamp(x[o], 0, hmax);
        const d = (Math.max(u[0], 0) - k * Math.sqrt(h) - Math.max(u[1], 0)) * LMIN / A;
        dx[o] = (h <= 0 && d < 0) || (h >= hmax && d > 0) ? 0 : d;
      },
    };
  },
});

const CHAR_PARAM: ParamDef = {
  key: "char",
  label: "Característica da válvula",
  kind: "select",
  default: "linear",
  group: "advanced",
  options: [
    { value: "linear", label: "Linear" },
    { value: "eqpct", label: "Igual porcentagem (R = 50)" },
  ],
};

function actuator(opts: { type: string; label: string; prefix: string; symbol: string; description: string; model: string; outLabel: string; outShort: string; outUnit: string; maxLabel: string; maxUnit: string; maxDefault: number; withChar: boolean }) {
  registerComponent({
    type: opts.type,
    label: opts.label,
    category: "process",
    labelPrefix: opts.prefix,
    symbol: opts.symbol,
    description: opts.description,
    model: opts.model,
    hypotheses: [
      "O atuador responde com atraso de primeira ordem ao comando (curso da válvula, rotação da bomba, aquecimento da resistência).",
      "O comando é limitado entre 0 e 100%.",
      ...(opts.withChar ? ["Queda de pressão constante na válvula, então a vazão depende só da abertura."] : ["Curva da bomba simplificada: a vazão é proporcional à rotação, sem depender da pressão."]),
      timeNote,
      "Valores padrão ilustrativos.",
    ],
    ports: [inP("cmd", "Comando", "cmd", "%"), outP("out", opts.outLabel, opts.outShort, opts.outUnit)],
    params: [
      { key: "max", label: opts.maxLabel, unit: opts.maxUnit, kind: "number", default: opts.maxDefault, min: 0, group: "basic" },
      { key: "tau", label: "Constante de tempo do atuador", unit: "s", kind: "number", default: 2, min: 1e-3, group: "basic" },
      ...(opts.withChar ? [CHAR_PARAM] : []),
      { key: "p0", label: "Posição inicial", unit: "%", kind: "number", default: 0, min: 0, max: 100, group: "initial", initialOnly: true },
    ],
    block: (p: ParamReader) => {
      const max = p.num("max"),
        tau = p.num("tau"),
        p0 = p.num("p0");
      const eq = opts.withChar && p.str("char") === "eqpct";
      const R = 50;
      const f = (x: number) => (eq ? (R ** x - 1) / (R - 1) : x);
      return {
        nStates: 1,
        x0: () => [p0],
        feedthrough: false,
        out: (_t, x, o, _u, y) => void (y[0] = max * f(clamp(x[o], 0, 100) / 100)),
        der: (_t, x, o, u, dx) => void (dx[o] = (clamp(u[0], 0, 100) - x[o]) / tau),
        minTimescale: () => tau / 5,
      };
    },
  });
}

actuator({ type: "process.valve", label: "Válvula de controle", prefix: "Válvula", symbol: "valve", description: "Válvula que converte o comando de abertura (0 a 100%) em vazão.", model: "τ·dp/dt + p = cmd;  q = Q_máx · f(p/100)", outLabel: "Vazão", outShort: "q", outUnit: "L/min", maxLabel: "Vazão máxima", maxUnit: "L/min", maxDefault: 120, withChar: true });
actuator({ type: "process.pump", label: "Bomba", prefix: "Bomba", symbol: "pump", description: "Bomba com rotação comandada de 0 a 100%.", model: "τ·dn/dt + n = cmd;  q = Q_máx · n/100", outLabel: "Vazão", outShort: "q", outUnit: "L/min", maxLabel: "Vazão máxima", maxUnit: "L/min", maxDefault: 150, withChar: false });
actuator({ type: "process.heater", label: "Resistência elétrica", prefix: "Resistência", symbol: "heater", description: "Aquecedor elétrico comandado de 0 a 100% da potência.", model: "τ·dn/dt + n = cmd;  P = P_máx · n/100", outLabel: "Potência de aquecimento", outShort: "P", outUnit: "kW", maxLabel: "Potência máxima", maxUnit: "kW", maxDefault: 10, withChar: false });

registerComponent({
  type: "process.heated_tank",
  label: "Tanque aquecido",
  category: "process",
  labelPrefix: "Tanque aquecido",
  symbol: "htank",
  description: "Tanque de volume constante, bem misturado, com entrada e saída de água e aquecimento.",
  model: "ρ·cp·V·dT/dt = ρ·cp·F·(T_in − T) + P − UA·(T − T_amb)",
  hypotheses: [
    "Mistura perfeita: a temperatura da saída é a do tanque.",
    "Volume constante: a vazão que entra é a que sai.",
    "Água: ρ = 1000 kg/m³ e cp = 4186 J/(kg·K).",
    "Perda de calor proporcional à diferença para o ambiente.",
    timeNote,
    "Valores padrão ilustrativos.",
  ],
  ports: [
    inP("F", "Vazão de água", "F", "L/min"),
    inP("Tin", "Temperatura de entrada", "Te", "°C"),
    inP("P", "Potência de aquecimento", "P", "kW"),
    outP("T", "Temperatura", "T", "°C"),
  ],
  params: [
    { key: "V", label: "Volume", unit: "m³", kind: "number", default: 0.05, min: 1e-6, group: "basic" },
    { key: "UA", label: "Perda de calor UA", unit: "W/K", kind: "number", default: 20, min: 0, group: "basic" },
    { key: "Tamb", label: "Temperatura ambiente", unit: "°C", kind: "number", default: 20, group: "basic" },
    { key: "T0", label: "Temperatura inicial", unit: "°C", kind: "number", default: 25, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const V = p.num("V"),
      UA = p.num("UA"),
      Tamb = p.num("Tamb"),
      T0 = p.num("T0");
    return {
      nStates: 1,
      x0: () => [T0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      der: (_t, x, o, u, dx) => {
        const T = x[o];
        dx[o] = (Math.max(u[0], 0) * LMIN * (u[1] - T)) / V + (u[2] * 1000 - UA * (T - Tamb)) / (RHOCP * V);
      },
      minTimescale: () => (Math.max(UA, 1e-9) > 0 ? (RHOCP * V) / (UA + 1) / 5 : Infinity),
    };
  },
});

registerComponent({
  type: "process.boiler",
  label: "Caldeira",
  category: "process",
  labelPrefix: "Caldeira",
  symbol: "boiler",
  description: "Caldeira aberta: a água esquenta até 100 °C e, com a potência que sobra, vira vapor e o nível desce.",
  model: "m·cp·dT/dt = P + ṁ·cp·(T_f − T) − UA·(T − T_amb);  ṁ_vapor = (energia excedente)/h_fg quando T = 100 °C;  dm/dt = ṁ_água − ṁ_vapor",
  hypotheses: [
    "Pressão atmosférica: a água ferve a 100 °C. Não há pressão de vapor nem tambor fechado.",
    "Mistura perfeita. Calor latente h_fg = 2257 kJ/kg.",
    "A produção de vapor responde na hora às entradas. Em uma malha, coloque um atuador com atraso (válvula, resistência) entre o controlador e a caldeira.",
    "A transição para a fervura é suavizada em uma faixa de 0,5 °C para o solver não travar.",
    "O nível não passa de zero (fica no piso de 2% da altura) nem do máximo.",
    timeNote,
    "Valores padrão ilustrativos.",
  ],
  ports: [
    inP("feed", "Vazão de água de alimentação", "q", "L/min"),
    inP("P", "Potência de aquecimento", "P", "kW"),
    outP("h", "Nível", "h", "m"),
    outP("T", "Temperatura da água", "T", "°C"),
    outP("steam", "Produção de vapor", "vap", "kg/min"),
  ],
  params: [
    { key: "A", label: "Área da seção", unit: "m²", kind: "number", default: 0.5, min: 1e-3, group: "basic" },
    { key: "hmax", label: "Altura total", unit: "m", kind: "number", default: 1, min: 1e-3, group: "basic" },
    { key: "Tf", label: "Temperatura da água de alimentação", unit: "°C", kind: "number", default: 20, group: "basic" },
    { key: "UA", label: "Perda de calor UA", unit: "W/K", kind: "number", default: 30, min: 0, group: "basic" },
    { key: "Tamb", label: "Temperatura ambiente", unit: "°C", kind: "number", default: 20, group: "advanced" },
    { key: "h0", label: "Nível inicial", unit: "m", kind: "number", default: 0.4, min: 0, group: "initial", initialOnly: true },
    { key: "T0", label: "Temperatura inicial", unit: "°C", kind: "number", default: 25, max: 100, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const A = p.num("A"),
      hmax = p.num("hmax"),
      Tf = p.num("Tf"),
      UA = p.num("UA"),
      Tamb = p.num("Tamb"),
      h0 = p.num("h0"),
      T0 = p.num("T0");
    if (h0 > hmax) throw new Error("O nível inicial não pode passar da altura total.");
    const mMin = RHO * A * 0.02 * hmax;
    const mMax = RHO * A * hmax;
    const rate = (T: number, m: number, qin: number, P: number) => {
      const mf = Math.max(qin, 0) * LMIN * RHO;
      const Qnet = P * 1000 + mf * CP * (Tf - T) - UA * (T - Tamb);
      const b0 = clamp((T - (T_SAT - 0.5)) / 0.5, 0, 1);
      const beta = b0 * b0 * (3 - 2 * b0);
      const ms = (beta * Math.max(Qnet, 0)) / HFG;
      const dT = ((1 - beta) * Qnet + beta * Math.min(Qnet, 0)) / (m * CP);
      let dm = mf - ms;
      if ((m >= mMax && dm > 0) || (m <= mMin && dm < 0)) dm = 0;
      return { dT, dm, ms };
    };
    return {
      nStates: 2,
      x0: () => [T0, Math.max(mMin, RHO * A * h0)],
      feedthrough: true,
      out: (_t, x, o, u, y) => {
        const m = clamp(x[o + 1], mMin, mMax);
        y[0] = m / (RHO * A);
        y[1] = x[o];
        y[2] = rate(x[o], m, u[0], u[1]).ms * 60;
      },
      der: (_t, x, o, u, dx) => {
        const m = clamp(x[o + 1], mMin, mMax);
        const r = rate(x[o], m, u[0], u[1]);
        dx[o] = r.dT;
        dx[o + 1] = r.dm;
      },
    };
  },
});

// ---------------------------------------------------------------- Empresarial

function balance(opts: { type: string; label: string; prefix: string; symbol: string; description: string; model: string; hypotheses: string[]; inLabel: string; inShort: string; outLabel: string; outShort: string; levelLabel: string; levelUnit: string; clampLow: boolean; clampHigh: boolean; initLabel: string; maxLabel: string; maxDefault: number; x0: number }) {
  registerComponent({
    type: opts.type,
    label: opts.label,
    category: "business",
    labelPrefix: opts.prefix,
    symbol: opts.symbol,
    description: opts.description,
    model: opts.model,
    hypotheses: [...opts.hypotheses, "O tempo e as taxas usam a mesma unidade de tempo da simulação (escolha em Simulação).", "Valores padrão ilustrativos."],
    ports: [inP("in", opts.inLabel, opts.inShort), inP("out", opts.outLabel, opts.outShort, "", true), outP("level", opts.levelLabel, "", opts.levelUnit)],
    params: [
      ...(opts.clampHigh ? [{ key: "max", label: opts.maxLabel, kind: "number" as const, default: opts.maxDefault, min: 0, group: "basic" as const }] : []),
      { key: "x0", label: opts.initLabel, kind: "number", default: opts.x0, group: "initial", initialOnly: true },
    ],
    block: (p: ParamReader) => {
      const hi = opts.clampHigh ? p.num("max") : Infinity;
      const lo = opts.clampLow ? 0 : -Infinity;
      return {
        nStates: 1,
        x0: () => [p.num("x0")],
        feedthrough: false,
        out: (_t, x, o, _u, y) => void (y[0] = clamp(x[o], lo, hi)),
        der: (_t, x, o, u, dx) => {
          const xc = clamp(x[o], lo, hi);
          const d = u[0] - u[1];
          dx[o] = (xc <= lo && d < 0) || (xc >= hi && d > 0) ? 0 : d;
        },
      };
    },
  });
}

balance({ type: "business.stock", label: "Estoque", prefix: "Estoque", symbol: "stock", description: "Estoque que sobe com a produção ou reposição e desce com as vendas.", model: "dS/dt = entrada − saída, com 0 ≤ S ≤ capacidade", hypotheses: ["O estoque não fica negativo: venda sem estoque não acontece (demanda perdida).", "Acima da capacidade a entrada não é guardada."], inLabel: "Entrada (reposição)", inShort: "ent", outLabel: "Saída (vendas)", outShort: "sai", levelLabel: "Nível de estoque", levelUnit: "un", clampLow: true, clampHigh: true, initLabel: "Estoque inicial", maxLabel: "Capacidade", maxDefault: 1000, x0: 200 });
balance({ type: "business.queue", label: "Fila de atendimento", prefix: "Fila", symbol: "queue", description: "Fila que cresce com as chegadas e diminui com o atendimento.", model: "dQ/dt = chegadas − atendimento, com Q ≥ 0", hypotheses: ["Modelo de fluido: a fila é contínua, sem pessoas individuais.", "Sem atendimento quando a fila está vazia."], inLabel: "Chegadas", inShort: "ch", outLabel: "Atendimento", outShort: "at", levelLabel: "Tamanho da fila", levelUnit: "pessoas", clampLow: true, clampHigh: false, initLabel: "Fila inicial", maxLabel: "", maxDefault: 0, x0: 10 });
balance({ type: "business.cash", label: "Caixa", prefix: "Caixa", symbol: "cash", description: "Saldo de caixa: soma das receitas menos as despesas ao longo do tempo.", model: "dC/dt = receitas − despesas", hypotheses: ["O saldo pode ficar negativo (caixa descoberto)."], inLabel: "Receitas", inShort: "rec", outLabel: "Despesas", outShort: "desp", levelLabel: "Saldo", levelUnit: "R$", clampLow: false, clampHigh: false, initLabel: "Saldo inicial", maxLabel: "", maxDefault: 0, x0: 10000 });

// ---------------------------------------------------------------- Anotações

registerComponent({
  type: "note.text",
  label: "Anotação",
  category: "notes",
  labelPrefix: "Anotação",
  symbol: "note",
  description: "Nota de texto na área de trabalho. Não participa da simulação.",
  model: "sem equação",
  hypotheses: ["Só documenta o diagrama."],
  ports: [],
  params: [{ key: "text", label: "Texto", kind: "text", default: "Escreva aqui", group: "basic" }],
});
