// Equipamentos de petroquímica e refino: reator CSTR, trocador de calor, coluna de destilação,
// forno de processo e vaso de pressão com válvula de alívio. Modelos simplificados, com valores
// de exemplo de livros-texto (Seborg, Luyben, Smith & Corripio). Os valores padrão são ilustrativos.

import type { ParamDef, PortDef } from "../types";
import { registerComponent } from "./registry";

const inP = (name: string, label: string, short: string, unit = "", optional = false): PortDef => ({ name, label, short, unit, domain: "signal", dir: "in", optional });
const outP = (name: string, label: string, short: string, unit = ""): PortDef => ({ name, label, short, unit, domain: "signal", dir: "out" });
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const timeNote = "O tempo da simulação é interpretado em segundos neste componente.";
const KELVIN = 273.15;

// ---------------------------------------------------------------- Reator CSTR

registerComponent({
  type: "petro.cstr",
  label: "Reator CSTR exotérmico",
  category: "petro",
  labelPrefix: "Reator",
  symbol: "cstr",
  description: "Reator de tanque agitado contínuo com camisa de resfriamento. A reação A → B é de primeira ordem e libera calor. Pode ter mais de um ponto de equilíbrio e disparar a temperatura (fuga térmica).",
  model: "V·dCA/dt = F·(CAf − CA) − V·k·CA;  ρcp·V·dT/dt = ρcp·F·(Tf − T) + (−ΔH)·V·k·CA − UA·(T − Tc);  k = k0·exp(−E/R/T)",
  hypotheses: [
    "Mistura perfeita e volume constante: a vazão que entra é a que sai.",
    "Reação irreversível A → B de primeira ordem, com taxa de Arrhenius.",
    "Densidade e calor específico constantes. Camisa com temperatura Tc imposta pela entrada.",
    "Valores padrão do exemplo clássico de Seborg: o ponto de equilíbrio é CA = 0,5 mol/L e T = 350 K (76,9 °C). Esse ponto é instável em malha aberta: sem controle, qualquer perturbação leva a temperatura para outro equilíbrio.",
    timeNote,
  ],
  ports: [
    inP("F", "Vazão de alimentação", "F", "L/min"),
    inP("CAf", "Concentração de A na alimentação", "CAf", "mol/L"),
    inP("Tf", "Temperatura da alimentação", "Tf", "°C"),
    inP("Tc", "Temperatura da camisa de resfriamento", "Tc", "°C"),
    outP("CA", "Concentração de A no reator", "CA", "mol/L"),
    outP("T", "Temperatura do reator", "T", "°C"),
    outP("X", "Conversão de A", "X", "%"),
    outP("Qr", "Calor liberado pela reação", "Qr", "kW"),
  ],
  params: [
    { key: "V", label: "Volume do reator", unit: "L", kind: "number", default: 100, min: 1e-3, group: "basic" },
    { key: "k0", label: "Fator pré-exponencial k0", unit: "1/min", kind: "number", default: 7.2e10, min: 0, group: "basic" },
    { key: "ER", label: "Energia de ativação E/R", unit: "K", kind: "number", default: 8750, min: 0, group: "basic" },
    { key: "dH", label: "Calor de reação (−ΔH)", unit: "J/mol", kind: "number", default: 50000, group: "basic" },
    { key: "rcp", label: "Densidade × calor específico", unit: "J/(L·K)", kind: "number", default: 239, min: 1, group: "advanced" },
    { key: "UA", label: "Troca térmica da camisa UA", unit: "W/K", kind: "number", default: 833.3, min: 0, group: "basic" },
    { key: "CAfn", label: "Concentração de A na alimentação (referência da conversão)", unit: "mol/L", kind: "number", default: 1, min: 1e-6, group: "advanced", hint: "Só serve para calcular a conversão X = 1 − CA/CAfn." },
    { key: "CA0", label: "Concentração inicial", unit: "mol/L", kind: "number", default: 0.5, min: 0, group: "initial", initialOnly: true },
    { key: "T0", label: "Temperatura inicial", unit: "°C", kind: "number", default: 76.85, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const CAfn = p.num("CAfn");
    const V = p.num("V"), k0 = p.num("k0"), ER = p.num("ER"), dH = p.num("dH"), rcp = p.num("rcp"), UA = p.num("UA") * 60, CA0 = p.num("CA0"), T0 = p.num("T0");
    const rate = (T: number) => k0 * Math.exp(-ER / Math.max(T + KELVIN, 200));
    return {
      nStates: 2,
      x0: () => [CA0, T0],
      feedthrough: false,
      out: (_t, x, o, u, y) => {
        const CA = Math.max(x[o], 0);
        y[0] = CA;
        y[1] = x[o + 1];
        y[2] = clamp((1 - CA / CAfn) * 100, 0, 100);
        y[3] = (dH * rate(x[o + 1]) * CA * V) / 60 / 1000;
      },
      der: (_t, x, o, u, dx) => {
        const CA = Math.max(x[o], 0), T = x[o + 1];
        const F = Math.max(u[0], 0), k = rate(T);
        dx[o] = ((F / V) * (u[1] - CA) - k * CA) / 60;
        dx[o + 1] = ((F / V) * (u[2] - T) + (dH * k * CA) / rcp - (UA * (T - u[3])) / (rcp * V)) / 60;
      },
      minTimescale: () => 5,
    };
  },
});

// ---------------------------------------------------------------- Trocador de calor

registerComponent({
  type: "petro.hx",
  label: "Trocador de calor casco e tubo",
  category: "petro",
  labelPrefix: "Trocador",
  symbol: "hx",
  description: "Trocador de calor em contracorrente (método ε-NTU) entre um fluido quente, por exemplo óleo, e um frio, por exemplo água de processo. As saídas seguem o valor de regime com um atraso.",
  model: "ε = (1 − e^(−NTU(1−Cr))) / (1 − Cr·e^(−NTU(1−Cr)));  Q = ε·Cmin·(Th,e − Tc,e);  τ·dTs/dt = Ts,regime − Ts",
  hypotheses: [
    "Contracorrente, UA constante, sem perda para o ambiente e sem mudança de fase.",
    "Calores específicos e densidades constantes. O fluido quente padrão é um óleo (cp = 2,1 kJ/(kg·K), 850 kg/m³) e o frio é água.",
    "A dinâmica é um atraso de primeira ordem em cada saída, que representa o volume de fluido no trocador.",
    timeNote,
  ],
  ports: [
    inP("Fh", "Vazão do fluido quente", "Fh", "L/min"),
    inP("Thi", "Temperatura de entrada do quente", "Thi", "°C"),
    inP("Fc", "Vazão do fluido frio", "Fc", "L/min"),
    inP("Tci", "Temperatura de entrada do frio", "Tci", "°C"),
    outP("Tho", "Temperatura de saída do quente", "Tho", "°C"),
    outP("Tco", "Temperatura de saída do frio", "Tco", "°C"),
    outP("Q", "Calor trocado", "Q", "kW"),
  ],
  params: [
    { key: "UA", label: "Coeficiente global × área UA", unit: "kW/K", kind: "number", default: 3, min: 0, group: "basic" },
    { key: "cph", label: "Calor específico do quente", unit: "kJ/(kg·K)", kind: "number", default: 2.1, min: 0.1, group: "basic" },
    { key: "rhoh", label: "Densidade do quente", unit: "kg/m³", kind: "number", default: 850, min: 1, group: "advanced" },
    { key: "cpc", label: "Calor específico do frio", unit: "kJ/(kg·K)", kind: "number", default: 4.18, min: 0.1, group: "basic" },
    { key: "rhoc", label: "Densidade do frio", unit: "kg/m³", kind: "number", default: 1000, min: 1, group: "advanced" },
    { key: "tau", label: "Constante de tempo", unit: "s", kind: "number", default: 20, min: 1e-3, group: "basic" },
    { key: "Fh0", label: "Vazão inicial do quente", unit: "L/min", kind: "number", default: 60, min: 0, group: "initial", initialOnly: true, hint: "Só para calcular o calor inicial trocado." },
    { key: "Thi0", label: "Entrada inicial do quente", unit: "°C", kind: "number", default: 150, group: "initial", initialOnly: true },
    { key: "Fc0", label: "Vazão inicial do frio", unit: "L/min", kind: "number", default: 40, min: 0, group: "initial", initialOnly: true },
    { key: "Tci0", label: "Entrada inicial do frio", unit: "°C", kind: "number", default: 25, group: "initial", initialOnly: true },
    { key: "Tho0", label: "Saída do quente inicial", unit: "°C", kind: "number", default: 62.6, group: "initial", initialOnly: true },
    { key: "Tco0", label: "Saída do frio inicial", unit: "°C", kind: "number", default: 81, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const UA = p.num("UA"), cph = p.num("cph"), rhoh = p.num("rhoh"), cpc = p.num("cpc"), rhoc = p.num("rhoc"), tau = p.num("tau");
    const Tho0 = p.num("Tho0"), Tco0 = p.num("Tco0");
    const steady = (Fh: number, Thi: number, Fc: number, Tci: number) => {
      const Ch = (Math.max(Fh, 0) * rhoh * cph) / 60000, Cc = (Math.max(Fc, 0) * rhoc * cpc) / 60000; // kW/K
      const Cmin = Math.min(Ch, Cc), Cmax = Math.max(Ch, Cc);
      if (Cmin < 1e-9) return { Tho: Thi, Tco: Tci, Q: 0 };
      const Cr = Cmin / Cmax, NTU = UA / Cmin;
      const eps = Math.abs(1 - Cr) < 1e-6 ? NTU / (1 + NTU) : (1 - Math.exp(-NTU * (1 - Cr))) / (1 - Cr * Math.exp(-NTU * (1 - Cr)));
      const Q = eps * Cmin * (Thi - Tci);
      return { Tho: Thi - Q / Ch, Tco: Tci + Q / Cc, Q };
    };
    return {
      nStates: 3,
      x0: () => {
        const s0 = steady(p.num("Fh0"), p.num("Thi0"), p.num("Fc0"), p.num("Tci0"));
        return [Tho0, Tco0, s0.Q];
      },
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        y[0] = x[o];
        y[1] = x[o + 1];
        y[2] = x[o + 2];
      },
      der: (_t, x, o, u, dx) => {
        const s = steady(u[0], u[1], u[2], u[3]);
        dx[o] = (s.Tho - x[o]) / tau;
        dx[o + 1] = (s.Tco - x[o + 1]) / tau;
        dx[o + 2] = (s.Q - x[o + 2]) / tau;
      },
      minTimescale: () => tau / 5,
    };
  },
});

// ---------------------------------------------------------------- Coluna de destilação

const MAX_TRAYS = 12;
const colPorts = (n: number): PortDef[] => [
  inP("F", "Vazão de alimentação", "F", "kmol/min"),
  inP("zF", "Fração molar do leve na alimentação", "zF", ""),
  inP("L", "Vazão de refluxo", "L", "kmol/min"),
  inP("V", "Vazão de vapor do refervedor", "V", "kmol/min"),
  outP("xD", "Pureza do destilado (fração do leve)", "xD", ""),
  outP("xB", "Fração do leve no fundo", "xB", ""),
  outP("D", "Vazão de destilado", "D", "kmol/min"),
  outP("B", "Vazão de fundo", "B", "kmol/min"),
  outP("Tt", "Temperatura do topo", "Tt", "°C"),
  outP("Tb", "Temperatura do fundo", "Tb", "°C"),
  ...Array.from({ length: n }, (_, i) => outP(`x${i + 1}`, `Fração do leve na bandeja ${i + 1}`, `x${i + 1}`, "")),
];

registerComponent({
  type: "petro.column",
  label: "Coluna de destilação binária",
  category: "petro",
  labelPrefix: "Coluna",
  symbol: "column",
  description: "Coluna com condensador total, bandejas e refervedor, para uma mistura de dois componentes (padrão: benzeno e tolueno). Cada bandeja tem a sua composição, que muda com o refluxo e o vapor do refervedor.",
  model: "M·dxi/dt = L(i−1)·x(i−1) − L(i)·xi + V·(y(i+1) − yi);  yi = α·xi / (1 + (α − 1)·xi);  D = V − L;  B = L + F − V",
  hypotheses: [
    "Vazão molar constante (hipótese de McCabe-Thiele): o calor latente é igual nos dois componentes.",
    "Volatilidade relativa α constante. Bandejas ideais, com equilíbrio líquido-vapor em cada uma.",
    "Condensador total, alimentação como líquido saturado e acúmulo de líquido constante em cada bandeja.",
    "Hidráulica ignorada: a vazão de líquido muda na hora ao longo da coluna.",
    "As temperaturas são uma interpolação entre os pontos de ebulição dos puros, só para mostrar o perfil.",
    "As vazões D e B seguem V − L e L + F − V com um atraso de 3 s.",
    timeNote,
  ],
  ports: (p) => colPorts(Math.round(p.num("N"))),
  params: [
    { key: "N", label: "Número de bandejas", kind: "int", default: 10, min: 4, max: MAX_TRAYS, group: "basic", structural: true },
    { key: "NF", label: "Bandeja da alimentação (a partir do topo)", kind: "int", default: 5, min: 2, group: "basic" },
    { key: "alpha", label: "Volatilidade relativa α", kind: "number", default: 2.5, min: 1.01, group: "basic", hint: "Benzeno e tolueno: cerca de 2,4. Propeno e propano: cerca de 1,1 (separação difícil)." },
    { key: "Mt", label: "Acúmulo em cada bandeja", unit: "kmol", kind: "number", default: 0.5, min: 0.01, group: "advanced" },
    { key: "Md", label: "Acúmulo no tambor de refluxo", unit: "kmol", kind: "number", default: 2, min: 0.01, group: "advanced" },
    { key: "Mb", label: "Acúmulo no refervedor", unit: "kmol", kind: "number", default: 3, min: 0.01, group: "advanced" },
    { key: "Tlow", label: "Ponto de ebulição do leve", unit: "°C", kind: "number", default: 80.1, group: "advanced" },
    { key: "Thigh", label: "Ponto de ebulição do pesado", unit: "°C", kind: "number", default: 110.6, group: "advanced" },
    { key: "xtop0", label: "Pureza inicial do topo", kind: "number", default: 0.95, min: 0, max: 1, group: "initial", initialOnly: true },
    { key: "xbot0", label: "Fração inicial do leve no fundo", kind: "number", default: 0.05, min: 0, max: 1, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const N = Math.round(p.num("N")), NF = Math.min(N, Math.max(2, Math.round(p.num("NF"))));
    const a = p.num("alpha"), Mt = p.num("Mt"), Md = p.num("Md"), Mb = p.num("Mb");
    const Tlow = p.num("Tlow"), Thigh = p.num("Thigh"), xt = p.num("xtop0"), xb = p.num("xbot0");
    const eq = (x: number) => (a * x) / (1 + (a - 1) * clamp(x, 0, 1));
    const Tof = (x: number) => Thigh + (Tlow - Thigh) * clamp(x, 0, 1);
    return {
      nStates: N + 4,
      x0: () => [xt, ...Array.from({ length: N }, (_, i) => xt + ((xb - xt) * (i + 1)) / (N + 1)), xb, 0.5, 0.5],
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        y[0] = x[o];
        y[1] = x[o + N + 1];
        y[2] = x[o + N + 2];
        y[3] = x[o + N + 3];
        y[4] = Tof(x[o]);
        y[5] = Tof(x[o + N + 1]);
        for (let i = 0; i < N; i++) y[6 + i] = x[o + 1 + i];
      },
      der: (_t, x, o, u, dx) => {
        const F = Math.max(u[0], 0), zF = clamp(u[1], 0, 1), L = Math.max(u[2], 0), V = Math.max(u[3], 0);
        const Ls = L + F;
        const B = Ls - V;
        const xs = (i: number) => clamp(x[o + i], 0, 1); // 0 = tambor, 1..N = bandejas, N+1 = fundo
        const liq = (i: number) => (i < NF ? L : Ls); // líquido que sai da bandeja i
        dx[o] = (V * (eq(xs(1)) - xs(0))) / Md / 60;
        for (let i = 1; i <= N; i++) {
          const up = i === 1 ? L : liq(i - 1);
          const yBelow = eq(xs(i + 1));
          dx[o + i] = (up * xs(i - 1) - liq(i) * xs(i) + V * (yBelow - eq(xs(i))) + (i === NF ? F * zF : 0)) / Mt / 60;
        }
        dx[o + N + 1] = (Ls * xs(N) - V * eq(xs(N + 1)) - B * xs(N + 1)) / Mb / 60;
        dx[o + N + 2] = (Math.max(V - L, 0) - x[o + N + 2]) / 3;
        dx[o + N + 3] = (Math.max(B, 0) - x[o + N + 3]) / 3;
      },
      minTimescale: () => 5,
    };
  },
});

// ---------------------------------------------------------------- Forno de processo

registerComponent({
  type: "petro.furnace",
  label: "Forno de processo",
  category: "petro",
  labelPrefix: "Forno",
  symbol: "furnace",
  description: "Forno a gás que aquece um fluido de processo (por exemplo, a carga de uma unidade de destilação) numa serpentina. A queima aquece a parede dos tubos e a parede aquece o fluido.",
  model: "Cw·dTw/dt = η·Q_fogo − UA·(Tw − Ts);  ρcp·Vc·dTs/dt = ṁ·cp·(Te − Ts) + UA·(Tw − Ts);  τb·dq/dt = cmd − q",
  hypotheses: [
    "Fluido bem misturado na serpentina: a temperatura de saída é a do volume do fluido.",
    "A parede dos tubos tem uma capacidade térmica única. Uma parte η do calor da chama chega aos tubos (o resto sai pela chaminé).",
    "O queimador responde com atraso de primeira ordem ao comando de 0 a 100 %.",
    "Fluido padrão: óleo (cp = 2,2 kJ/(kg·K), 800 kg/m³).",
    timeNote,
  ],
  ports: [
    inP("F", "Vazão do fluido de processo", "F", "L/min"),
    inP("Te", "Temperatura de entrada do fluido", "Te", "°C"),
    inP("fuel", "Comando do gás combustível", "gás", "%"),
    outP("Ts", "Temperatura de saída do fluido", "Ts", "°C"),
    outP("Tw", "Temperatura da parede dos tubos", "Tw", "°C"),
    outP("Q", "Calor absorvido pelo fluido", "Q", "kW"),
    outP("fire", "Potência da chama", "chama", "kW"),
  ],
  params: [
    { key: "Qmax", label: "Potência máxima do queimador", unit: "kW", kind: "number", default: 3000, min: 1, group: "basic" },
    { key: "eta", label: "Fração do calor que chega aos tubos η", kind: "number", default: 0.88, min: 0.1, max: 1, group: "basic" },
    { key: "UA", label: "Troca parede-fluido UA", unit: "kW/K", kind: "number", default: 20, min: 0.1, group: "basic" },
    { key: "Cw", label: "Capacidade térmica da parede", unit: "kJ/K", kind: "number", default: 2000, min: 1, group: "advanced" },
    { key: "Vc", label: "Volume de fluido na serpentina", unit: "L", kind: "number", default: 400, min: 1, group: "advanced" },
    { key: "rho", label: "Densidade do fluido", unit: "kg/L", kind: "number", default: 0.8, min: 0.1, group: "advanced" },
    { key: "cp", label: "Calor específico do fluido", unit: "kJ/(kg·K)", kind: "number", default: 2.2, min: 0.1, group: "advanced" },
    { key: "taub", label: "Constante de tempo do queimador", unit: "s", kind: "number", default: 5, min: 1e-3, group: "advanced" },
    { key: "Ts0", label: "Temperatura inicial de saída", unit: "°C", kind: "number", default: 350, group: "initial", initialOnly: true },
    { key: "Tw0", label: "Temperatura inicial da parede", unit: "°C", kind: "number", default: 416, group: "initial", initialOnly: true },
    { key: "q0", label: "Comando inicial do queimador", unit: "%", kind: "number", default: 50, min: 0, max: 100, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const Qmax = p.num("Qmax"), eta = p.num("eta"), UA = p.num("UA"), Cw = p.num("Cw"), Vc = p.num("Vc"), rho = p.num("rho"), cp = p.num("cp"), taub = p.num("taub");
    const Ts0 = p.num("Ts0"), Tw0 = p.num("Tw0"), q0 = p.num("q0");
    return {
      nStates: 3,
      x0: () => [Ts0, Tw0, q0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        y[0] = x[o];
        y[1] = x[o + 1];
        y[2] = UA * (x[o + 1] - x[o]);
        y[3] = (Qmax * clamp(x[o + 2], 0, 100)) / 100;
      },
      der: (_t, x, o, u, dx) => {
        const m = (Math.max(u[0], 0) * rho) / 60; // kg/s
        const fire = (Qmax * clamp(x[o + 2], 0, 100)) / 100;
        const Qabs = UA * (x[o + 1] - x[o]);
        dx[o] = (m * cp * (u[1] - x[o]) + Qabs) / (rho * cp * Vc);
        dx[o + 1] = (eta * fire - Qabs) / Cw;
        dx[o + 2] = (clamp(u[2], 0, 100) - x[o + 2]) / taub;
      },
      minTimescale: () => 5,
    };
  },
});

// ---------------------------------------------------------------- Vaso de pressão com PSV

registerComponent({
  type: "petro.sphere",
  label: "Vaso de pressão com válvula de alívio",
  category: "petro",
  labelPrefix: "Vaso",
  symbol: "sphere",
  description: "Esfera ou vaso de gás (por exemplo, GLP) com entrada, saída e uma válvula de alívio de pressão (PSV) que abre quando a pressão passa do ajuste e manda o excesso para o flare.",
  model: "dP/dt = (R·T/V)·(q_ent − q_sai − q_psv)/M;  q_psv = q_psv,máx · clamp((P − P_aj)/(0,1·P_aj), 0, 1)",
  hypotheses: [
    "Fase gasosa ideal e isotérmica. Não há líquido nem evaporação.",
    "A PSV abre de forma proporcional, do ajuste até 10 % de sobrepressão, quando chega à capacidade total.",
    "Pressão em bar manométrico na saída. O cálculo usa pressão absoluta (1,013 bar de atmosfera).",
    "As vazões são em kg/min. Com a pressão em zero manométrico, a saída não puxa gás de volta.",
    timeNote,
  ],
  ports: [
    inP("qin", "Vazão de gás de entrada", "qe", "kg/min"),
    inP("qout", "Vazão de gás de saída", "qs", "kg/min"),
    outP("P", "Pressão (manométrica)", "P", "bar"),
    outP("psv", "Vazão aliviada pela PSV", "PSV", "kg/min"),
    outP("open", "Abertura da PSV", "ab", "%"),
  ],
  params: [
    { key: "V", label: "Volume do vaso", unit: "m³", kind: "number", default: 500, min: 1e-3, group: "basic" },
    { key: "M", label: "Massa molar do gás", unit: "kg/kmol", kind: "number", default: 44, min: 1, group: "basic", hint: "Propano: 44. Butano: 58. Metano: 16." },
    { key: "T", label: "Temperatura do gás", unit: "°C", kind: "number", default: 27, group: "basic" },
    { key: "Pset", label: "Ajuste da PSV", unit: "bar", kind: "number", default: 10, min: 0.1, group: "basic" },
    { key: "qpsv", label: "Capacidade da PSV", unit: "kg/min", kind: "number", default: 800, min: 0, group: "basic" },
    { key: "P0", label: "Pressão inicial", unit: "bar", kind: "number", default: 8, min: 0, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const V = p.num("V"), M = p.num("M"), T = p.num("T"), Pset = p.num("Pset"), qpsv = p.num("qpsv"), P0 = p.num("P0");
    const RT = 0.083145 * (T + KELVIN);
    const psv = (Pg: number) => qpsv * clamp((Pg - Pset) / (0.1 * Pset), 0, 1);
    return {
      nStates: 1,
      x0: () => [P0],
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        y[0] = x[o];
        y[1] = psv(x[o]);
        y[2] = (100 * psv(x[o])) / Math.max(qpsv, 1e-9);
      },
      der: (_t, x, o, u, dx) => {
        const Pg = x[o];
        const qo = Pg <= 0 ? 0 : Math.max(u[1], 0);
        const d = ((RT / V) * (Math.max(u[0], 0) - qo - psv(Pg))) / M / 60;
        dx[o] = Pg <= 0 && d < 0 ? 0 : d;
      },
      minTimescale: () => 5,
    };
  },
});

void ({} as ParamDef);
