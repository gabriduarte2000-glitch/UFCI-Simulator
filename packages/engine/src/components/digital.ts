// Componentes digitais: portas lógicas, flip-flops, latches, contador, registrador de deslocamento,
// multiplexador, decodificador, somador, comparador com histerese, conversores A/D e D/A.
//
// Modelo: todo componente digital guarda a saída (ou o estado) no vetor de estados, com derivada zero.
// O valor só muda em eventos: quando uma entrada cruza o limiar 0,5 (nível alto: sinal ≥ 0,5).
// O motor acha o instante do cruzamento (bisseção), aplica a função lógica e repete em tempo zero
// até estabilizar. Assim um contador assíncrono propaga a "onda" de bits no mesmo instante, e um latch SR
// feito com duas portas NOR funciona (cada porta é um componente com estado, sem laço algébrico).

import type { ParamDef, PortDef } from "../types";
import { type BlockImpl, type ParamReader, registerComponent } from "./registry";

const inP = (name: string, label: string, optional = false, short = ""): PortDef => ({ name, label, domain: "signal", dir: "in", optional, short, unit: "" });
const outP = (name: string, label: string, short = "", unit = ""): PortDef => ({ name, label, domain: "signal", dir: "out", short, unit });

const lvl = (v: number) => (v >= 0.5 ? 1 : 0);
const LOGIC = "Nível alto quando o sinal é maior ou igual a 0,5. As saídas valem 0 ou 1.";
const ZERO_DELAY = "Sem atraso de propagação: a saída muda no mesmo instante da entrada.";

/** Estado discreto guardado no vetor x, com derivada zero. */
const frozen = (n: number, init: (p: ParamReader) => number[] = () => new Array<number>(n).fill(0)) => (p: ParamReader) => ({
  nStates: n,
  x0: () => init(p),
  der: () => {},
});

// ------------------------------------------------------------------------------------------------ portas

const gateFns: Record<string, (bits: number[]) => number> = {
  and: (b) => (b.every((v) => v === 1) ? 1 : 0),
  or: (b) => (b.some((v) => v === 1) ? 1 : 0),
  nand: (b) => (b.every((v) => v === 1) ? 0 : 1),
  nor: (b) => (b.some((v) => v === 1) ? 0 : 1),
  xor: (b) => b.reduce((a, v) => a ^ v, 0),
  xnor: (b) => 1 - b.reduce((a, v) => a ^ v, 0),
};

const GATE_TEXT: Record<string, [string, string, string]> = {
  and: ["E (AND)", "y = 1 só se todas as entradas valem 1", "y = a · b"],
  or: ["OU (OR)", "y = 1 se alguma entrada vale 1", "y = a + b"],
  nand: ["NÃO-E (NAND)", "y = 0 só se todas as entradas valem 1", "y = ¬(a · b)"],
  nor: ["NÃO-OU (NOR)", "y = 1 só se todas as entradas valem 0", "y = ¬(a + b)"],
  xor: ["OU exclusivo (XOR)", "y = 1 se um número ímpar de entradas vale 1", "y = a ⊕ b"],
  xnor: ["NÃO-OU exclusivo (XNOR)", "y = 1 se um número par de entradas vale 1", "y = ¬(a ⊕ b)"],
};

const letters = "abcdefgh";

for (const [kind, [label, description, model]] of Object.entries(GATE_TEXT)) {
  const fn = gateFns[kind];
  registerComponent({
    type: `dig.${kind}`,
    label,
    category: "dgate",
    labelPrefix: kind.toUpperCase(),
    symbol: `g-${kind}`,
    description: `Porta lógica. ${description}.`,
    model,
    hypotheses: [LOGIC, ZERO_DELAY],
    ports: (p) => [...Array.from({ length: p.num("n") }, (_, i) => inP(letters[i], `Entrada ${letters[i].toUpperCase()}`)), outP("y", "Saída", "", "")],
    params: [{ key: "n", label: "Número de entradas", kind: "int", default: 2, min: 2, max: 8, structural: true, group: "basic" }],
    block: (p) => {
      const n = p.num("n");
      return {
        ...frozen(1)(p),
        feedthrough: false,
        out: (_t, x, o, _u, y) => void (y[0] = x[o]),
        discrete: {
          nGuards: n,
          guards: (_t, _x, _o, u, g) => {
            for (let i = 0; i < n; i++) g[i] = u[i] - 0.5;
          },
          fire: (_t, x, o, _u, _prev, next) => void (x[o] = fn(next)),
        },
      };
    },
  });
}

for (const [kind, inv] of [
  ["not", true],
  ["buf", false],
] as const) {
  registerComponent({
    type: `dig.${kind}`,
    label: inv ? "Inversor (NOT)" : "Buffer",
    category: "dgate",
    labelPrefix: inv ? "NOT" : "BUF",
    symbol: `g-${kind}`,
    description: inv ? "Inverte o nível lógico." : "Repete o nível lógico (regenera 0 e 1 a partir de um sinal qualquer).",
    model: inv ? "y = ¬a" : "y = a",
    hypotheses: [LOGIC, ZERO_DELAY],
    ports: [inP("a", "Entrada"), outP("y", "Saída")],
    params: [],
    block: (p) => ({
      ...frozen(1)(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      discrete: {
        nGuards: 1,
        guards: (_t, _x, _o, u, g) => void (g[0] = u[0] - 0.5),
        fire: (_t, x, o, _u, _prev, next) => void (x[o] = inv ? 1 - next[0] : next[0]),
      },
    }),
  });
}

// ------------------------------------------------------------------------------------------------ fontes e indicadores

registerComponent({
  type: "dig.clock",
  label: "Clock",
  category: "dseq",
  labelPrefix: "Clock",
  symbol: "dclock",
  description: "Gerador de clock: onda quadrada de 0 e 1.",
  model: "y = 1 durante duty · T de cada período T = 1/f",
  hypotheses: ["Bordas instantâneas. O motor pousa o passo exatamente em cada borda."],
  ports: [outP("y", "Clock")],
  params: [
    { key: "f", label: "Frequência", unit: "Hz", kind: "number", default: 1, min: 1e-6, group: "basic" },
    { key: "duty", label: "Ciclo de trabalho", unit: "%", kind: "number", default: 50, min: 0, max: 100, group: "basic" },
    { key: "delay", label: "Atraso", unit: "s", kind: "number", default: 0, min: 0, group: "advanced" },
  ],
  block: (p) => {
    const T = 1 / p.num("f"),
      d = p.num("duty") / 100,
      td = p.num("delay");
    return {
      nStates: 0,
      x0: () => [],
      der: () => {},
      feedthrough: false,
      out: (t, _x, _o, _u, y) => {
        if (t < td) {
          y[0] = 0;
          return;
        }
        const k = Math.floor((t - td) / T + 1e-12);
        const ph = t - td - k * T;
        y[0] = ph < d * T - 1e-12 * T ? 1 : 0;
      },
      breakpoints: (t0, tf) => {
        const out: number[] = [];
        for (let k = 0; out.length < 200000; k++) {
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

registerComponent({
  type: "dig.switch",
  label: "Chave lógica",
  category: "dseq",
  labelPrefix: "Chave",
  symbol: "dswitch",
  description: "Entrada manual de nível lógico (0 ou 1). Pode ser alterada com a simulação em andamento.",
  model: "y = 0 ou 1, escolhido pelo usuário",
  hypotheses: ["A mudança vale a partir do instante em que você mexe na chave."],
  ports: [outP("y", "Nível")],
  params: [{ key: "on", label: "Ligada (nível 1)", kind: "bool", default: false, group: "basic" }],
  block: (p) => {
    const v = p.bool("on") ? 1 : 0;
    return { nStates: 0, x0: () => [], der: () => {}, feedthrough: false, out: (_t, _x, _o, _u, y) => void (y[0] = v) };
  },
});

registerComponent({
  type: "dig.led",
  label: "LED indicador",
  category: "dseq",
  labelPrefix: "LED",
  symbol: "dled",
  description: "Acende quando o nível da entrada é 1. Só observa; não altera o circuito.",
  model: "aceso se a ≥ 0,5",
  hypotheses: [LOGIC, "Para um LED de verdade, com corrente e queda de tensão, use o LED do grupo de semicondutores."],
  ports: [inP("a", "Entrada", true)],
  params: [{ key: "color", label: "Cor", kind: "select", default: "red", options: [{ value: "red", label: "Vermelho" }, { value: "green", label: "Verde" }, { value: "yellow", label: "Amarelo" }, { value: "blue", label: "Azul" }], group: "basic" }],
  block: () => ({ nStates: 0, x0: () => [], der: () => {}, feedthrough: false, out: () => {} }),
});

registerComponent({
  type: "dig.display7",
  label: "Display 7 segmentos",
  category: "dseq",
  labelPrefix: "Display",
  symbol: "dsev",
  description: "Mostra em hexadecimal (0 a F) o número formado pelas quatro entradas binárias. Só observa.",
  model: "dígito = b3·8 + b2·4 + b1·2 + b0",
  hypotheses: [LOGIC, "O decodificador BCD para 7 segmentos já está embutido."],
  ports: [inP("b0", "Bit 0 (menos significativo)", true, "b0"), inP("b1", "Bit 1", true, "b1"), inP("b2", "Bit 2", true, "b2"), inP("b3", "Bit 3 (mais significativo)", true, "b3")],
  params: [],
  block: () => ({ nStates: 0, x0: () => [], der: () => {}, feedthrough: false, out: () => {} }),
});

// ------------------------------------------------------------------------------------------------ sequenciais

const rst = (key = "rst", label = "Zera (nível 1)") => inP(key, label, true, "R");

/** Flip-flop e latch com uma saída q (estado) e qn. */
const qOut = (_t: number, x: Float64Array, o: number, _u: number[], y: number[]) => {
  y[0] = x[o];
  y[1] = 1 - x[o];
};

registerComponent({
  type: "dig.dff",
  label: "Flip-flop D",
  category: "dseq",
  labelPrefix: "FF D",
  symbol: "ic-dff",
  description: "Guarda o valor de D a cada borda de subida do clock. Tem entradas assíncronas de set e reset.",
  model: "q⁺ = D na borda de subida de CLK;  R = 1 força q = 0;  S = 1 força q = 1",
  hypotheses: [LOGIC, "O reset domina o set. Sem atraso de propagação."],
  ports: [inP("d", "Dados D", false, "D"), inP("clk", "Clock", false, ""), inP("set", "Set (nível 1)", true, "S"), rst(), outP("q", "Saída Q", "Q"), outP("qn", "Saída Q negada", "Q̄")],
  params: [{ key: "q0", label: "Valor inicial de Q", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true }],
  block: (p) => ({
    ...frozen(1, () => [p.num("q0")])(p),
    feedthrough: false,
    out: qOut,
    discrete: {
      nGuards: 3,
      guards: (_t, _x, _o, u, g) => {
        g[0] = u[1] - 0.5;
        g[1] = u[2] - 0.5;
        g[2] = u[3] - 0.5;
      },
      fire: (_t, x, o, u, prev, next, init) => {
        if (next[2]) x[o] = 0;
        else if (next[1]) x[o] = 1;
        else if (!init && prev[0] === 0 && next[0] === 1) x[o] = lvl(u[0]);
      },
    },
  }),
});

registerComponent({
  type: "dig.jkff",
  label: "Flip-flop JK",
  category: "dseq",
  labelPrefix: "FF JK",
  symbol: "ic-jkff",
  description: "Na borda de subida do clock: J=1,K=0 liga; J=0,K=1 desliga; J=K=1 inverte; J=K=0 mantém.",
  model: "q⁺ = J·q̄ + K̄·q  (na borda de subida)",
  hypotheses: [LOGIC, "Sem atraso de propagação."],
  ports: [inP("j", "Entrada J", false, "J"), inP("clk", "Clock", false, ""), inP("k", "Entrada K", false, "K"), rst(), outP("q", "Saída Q", "Q"), outP("qn", "Saída Q negada", "Q̄")],
  params: [{ key: "q0", label: "Valor inicial de Q", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true }],
  block: (p) => ({
    ...frozen(1, () => [p.num("q0")])(p),
    feedthrough: false,
    out: qOut,
    discrete: {
      nGuards: 2,
      guards: (_t, _x, _o, u, g) => {
        g[0] = u[1] - 0.5;
        g[1] = u[3] - 0.5;
      },
      fire: (_t, x, o, u, prev, next, init) => {
        if (next[1]) x[o] = 0;
        else if (!init && prev[0] === 0 && next[0] === 1) {
          const j = lvl(u[0]),
            k = lvl(u[2]);
          if (j && k) x[o] = 1 - x[o];
          else if (j) x[o] = 1;
          else if (k) x[o] = 0;
        }
      },
    },
  }),
});

registerComponent({
  type: "dig.tff",
  label: "Flip-flop T",
  category: "dseq",
  labelPrefix: "FF T",
  symbol: "ic-tff",
  description: "Inverte Q a cada borda de subida do clock quando T = 1. Com T = 1 divide a frequência por dois.",
  model: "q⁺ = q ⊕ T  (na borda de subida)",
  hypotheses: [LOGIC, "Sem atraso de propagação."],
  ports: [inP("t", "Entrada T", false, "T"), inP("clk", "Clock", false, ""), rst(), outP("q", "Saída Q", "Q"), outP("qn", "Saída Q negada", "Q̄")],
  params: [{ key: "q0", label: "Valor inicial de Q", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true }],
  block: (p) => ({
    ...frozen(1, () => [p.num("q0")])(p),
    feedthrough: false,
    out: qOut,
    discrete: {
      nGuards: 2,
      guards: (_t, _x, _o, u, g) => {
        g[0] = u[1] - 0.5;
        g[1] = u[2] - 0.5;
      },
      fire: (_t, x, o, u, prev, next, init) => {
        if (next[1]) x[o] = 0;
        else if (!init && prev[0] === 0 && next[0] === 1 && lvl(u[0])) x[o] = 1 - x[o];
      },
    },
  }),
});

registerComponent({
  type: "dig.srlatch",
  label: "Latch SR",
  category: "dseq",
  labelPrefix: "Latch SR",
  symbol: "ic-sr",
  description: "Memória de 1 bit. S = 1 liga, R = 1 desliga, os dois em 0 mantêm. Com S = R = 1, o reset domina.",
  model: "q = 1 se S;  q = 0 se R;  senão mantém",
  hypotheses: [LOGIC, "Sem atraso de propagação."],
  ports: [inP("s", "Set (nível 1)", false, "S"), inP("r", "Reset (nível 1)", false, "R"), outP("q", "Saída Q", "Q"), outP("qn", "Saída Q negada", "Q̄")],
  params: [{ key: "q0", label: "Valor inicial de Q", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true }],
  block: (p) => ({
    ...frozen(1, () => [p.num("q0")])(p),
    feedthrough: false,
    out: qOut,
    discrete: {
      nGuards: 2,
      guards: (_t, _x, _o, u, g) => {
        g[0] = u[0] - 0.5;
        g[1] = u[1] - 0.5;
      },
      fire: (_t, x, o, _u, _prev, next) => {
        if (next[1]) x[o] = 0;
        else if (next[0]) x[o] = 1;
      },
    },
  }),
});

registerComponent({
  type: "dig.dlatch",
  label: "Latch D",
  category: "dseq",
  labelPrefix: "Latch D",
  symbol: "ic-dlatch",
  description: "Transparente enquanto EN = 1 (Q segue D). Com EN = 0, guarda o último valor.",
  model: "q = D se EN = 1;  senão mantém",
  hypotheses: [LOGIC, "Sem atraso de propagação."],
  ports: [inP("d", "Dados D", false, "D"), inP("en", "Habilita EN", false, "EN"), outP("q", "Saída Q", "Q"), outP("qn", "Saída Q negada", "Q̄")],
  params: [{ key: "q0", label: "Valor inicial de Q", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true }],
  block: (p) => ({
    ...frozen(1, () => [p.num("q0")])(p),
    feedthrough: false,
    out: qOut,
    discrete: {
      nGuards: 2,
      guards: (_t, _x, _o, u, g) => {
        g[0] = u[1] - 0.5;
        g[1] = u[0] - 0.5;
      },
      fire: (_t, x, o, _u, _prev, next) => {
        if (next[0]) x[o] = next[1];
      },
    },
  }),
});

const bitsOut = (prefix: string, n: number): PortDef[] => Array.from({ length: n }, (_, i) => outP(`${prefix}${i}`, `Bit ${i}${i === 0 ? " (menos significativo)" : ""}`, `${prefix.toUpperCase()}${i}`));

registerComponent({
  type: "dig.counter",
  label: "Contador binário",
  category: "dseq",
  labelPrefix: "Contador",
  symbol: "ic-counter",
  description: "Conta as bordas de subida do clock, para cima ou para baixo, com módulo ajustável (módulo 10 = contador de década).",
  model: "N⁺ = (N ± 1) mod M  (borda de subida de CLK);  R = 1 zera",
  hypotheses: [LOGIC, "Contagem síncrona. O valor decimal sai também na porta V, útil para gráficos."],
  ports: (p) => [inP("clk", "Clock", false, ""), rst(), ...bitsOut("q", p.num("bits")), outP("v", "Valor decimal", "N")],
  params: [
    { key: "bits", label: "Número de bits", kind: "int", default: 4, min: 2, max: 8, structural: true, group: "basic" },
    { key: "mod", label: "Módulo (conta de 0 a M−1)", kind: "int", default: 16, min: 2, max: 256, group: "basic", hint: "Se for maior que 2^bits, vale 2^bits." },
    { key: "dir", label: "Sentido", kind: "select", default: "up", options: [{ value: "up", label: "Para cima" }, { value: "down", label: "Para baixo" }], group: "basic" },
    { key: "n0", label: "Valor inicial", kind: "int", default: 0, min: 0, max: 255, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const nb = p.num("bits");
    const M = Math.min(p.num("mod"), 2 ** nb);
    const up = p.str("dir") === "up";
    return {
      ...frozen(1, () => [p.num("n0") % M])(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        const c = Math.round(x[o]);
        for (let i = 0; i < nb; i++) y[i] = (c >> i) & 1;
        y[nb] = c;
      },
      discrete: {
        nGuards: 2,
        guards: (_t, _x, _o, u, g) => {
          g[0] = u[0] - 0.5;
          g[1] = u[1] - 0.5;
        },
        fire: (_t, x, o, _u, prev, next, init) => {
          if (next[1]) x[o] = 0;
          else if (!init && prev[0] === 0 && next[0] === 1) x[o] = up ? (Math.round(x[o]) + 1) % M : (Math.round(x[o]) - 1 + M) % M;
        },
      },
    };
  },
});

registerComponent({
  type: "dig.shiftreg",
  label: "Registrador de deslocamento",
  category: "dseq",
  labelPrefix: "Registrador",
  symbol: "ic-shift",
  description: "A cada borda de subida do clock, cada bit passa para o próximo e o bit D entra em Q0.",
  model: "Q0⁺ = D;  Qi⁺ = Q(i−1)  (borda de subida de CLK)",
  hypotheses: [LOGIC, "Entrada serial, saída paralela."],
  ports: (p) => [inP("d", "Dados D", false, "D"), inP("clk", "Clock", false, ""), rst(), ...bitsOut("q", p.num("bits"))],
  params: [{ key: "bits", label: "Número de bits", kind: "int", default: 4, min: 2, max: 8, structural: true, group: "basic" }],
  block: (p) => {
    const nb = p.num("bits");
    return {
      ...frozen(nb)(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        for (let i = 0; i < nb; i++) y[i] = x[o + i];
      },
      discrete: {
        nGuards: 2,
        guards: (_t, _x, _o, u, g) => {
          g[0] = u[1] - 0.5;
          g[1] = u[2] - 0.5;
        },
        fire: (_t, x, o, u, prev, next, init) => {
          if (next[1]) for (let i = 0; i < nb; i++) x[o + i] = 0;
          else if (!init && prev[0] === 0 && next[0] === 1) {
            for (let i = nb - 1; i > 0; i--) x[o + i] = x[o + i - 1];
            x[o] = lvl(u[0]);
          }
        },
      },
    };
  },
});

// ------------------------------------------------------------------------------------------------ combinacionais com vários bits

/** Bloco combinacional: saídas são função dos níveis das entradas. */
function combo(nIn: number, nOut: number, fn: (bits: number[]) => number[]): (p: ParamReader) => BlockImpl {
  return (p) => ({
    ...frozen(nOut)(p),
    feedthrough: false,
    out: (_t, x, o, _u, y) => {
      for (let i = 0; i < nOut; i++) y[i] = x[o + i];
    },
    discrete: {
      nGuards: nIn,
      guards: (_t, _x, _o, u, g) => {
        for (let i = 0; i < nIn; i++) g[i] = u[i] - 0.5;
      },
      fire: (_t, x, o, _u, _prev, next) => {
        const r = fn(next);
        for (let i = 0; i < nOut; i++) x[o + i] = r[i];
      },
    },
  });
}

registerComponent({
  type: "dig.mux2",
  label: "Multiplexador 2:1",
  category: "dseq",
  labelPrefix: "MUX",
  symbol: "ic-mux",
  description: "Escolhe a entrada A (SEL = 0) ou B (SEL = 1) e a repassa para a saída.",
  model: "y = A se SEL = 0;  y = B se SEL = 1",
  hypotheses: [LOGIC, ZERO_DELAY],
  ports: [inP("a", "Entrada A", false, "A"), inP("b", "Entrada B", false, "B"), inP("sel", "Seleção", false, "SEL"), outP("y", "Saída", "Y")],
  params: [],
  block: combo(3, 1, (b) => [b[2] ? b[1] : b[0]]),
});

registerComponent({
  type: "dig.decoder",
  label: "Decodificador 2:4",
  category: "dseq",
  labelPrefix: "Decodificador",
  symbol: "ic-dec",
  description: "Ativa uma só das quatro saídas, a que corresponde ao número binário A1A0.",
  model: "Yk = 1 quando A1·2 + A0 = k",
  hypotheses: [LOGIC, "Saídas ativas em nível alto."],
  ports: [inP("a0", "Entrada A0", false, "A0"), inP("a1", "Entrada A1", false, "A1"), outP("y0", "Saída 0", "Y0"), outP("y1", "Saída 1", "Y1"), outP("y2", "Saída 2", "Y2"), outP("y3", "Saída 3", "Y3")],
  params: [],
  block: combo(2, 4, (b) => {
    const k = b[0] + 2 * b[1];
    return [0, 1, 2, 3].map((i) => (i === k ? 1 : 0));
  }),
});

registerComponent({
  type: "dig.adder",
  label: "Somador completo",
  category: "dseq",
  labelPrefix: "Somador",
  symbol: "ic-adder",
  description: "Soma três bits (A, B e o vai-um de entrada). Gera a soma S e o vai-um de saída. Ligue vários em cadeia para somar números maiores.",
  model: "S = A ⊕ B ⊕ Cin;  Cout = A·B + Cin·(A ⊕ B)",
  hypotheses: [LOGIC, ZERO_DELAY],
  ports: [inP("a", "Bit A", false, "A"), inP("b", "Bit B", false, "B"), inP("cin", "Vai-um de entrada", false, "Cin"), outP("s", "Soma", "S"), outP("cout", "Vai-um de saída", "Cout")],
  params: [],
  block: combo(3, 2, (b) => {
    const s = b[0] + b[1] + b[2];
    return [s & 1, s >> 1];
  }),
});

// ------------------------------------------------------------------------------------------------ interface analógico/digital

registerComponent({
  type: "dig.comparator",
  label: "Comparador com histerese",
  category: "dseq",
  labelPrefix: "Comparador",
  symbol: "ic-cmp",
  description: "Transforma um sinal analógico em nível lógico. Liga quando a entrada passa do limiar superior e desliga abaixo do inferior (disparador Schmitt). Serve também como controle liga-desliga com histerese.",
  model: "y = 1 se u ≥ th + h/2;  y = 0 se u ≤ th − h/2;  entre os dois, mantém",
  hypotheses: ["Sem atraso. O instante da troca é calculado com precisão, não só no fim do passo.", "Histerese zero vira um comparador comum."],
  ports: [inP("in", "Sinal analógico", false, "u"), outP("y", "Nível lógico", "y")],
  params: [
    { key: "th", label: "Limiar central", kind: "number", default: 0, group: "basic", hint: "Na unidade do sinal de entrada." },
    { key: "hyst", label: "Histerese total", kind: "number", default: 0, min: 0, group: "basic" },
    { key: "invert", label: "Inverter a saída", kind: "bool", default: false, group: "advanced" },
    { key: "y0", label: "Saída inicial (dentro da histerese)", kind: "int", default: 0, min: 0, max: 1, group: "initial", initialOnly: true },
  ],
  block: (p) => {
    const th = p.num("th"),
      h = p.num("hyst");
    const inv = p.bool("invert");
    return {
      ...frozen(1, () => [p.num("y0")])(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = inv ? 1 - x[o] : x[o]),
      discrete: {
        nGuards: 2,
        guards: (_t, _x, _o, u, g) => {
          g[0] = u[0] - (th + h / 2);
          g[1] = u[0] - (th - h / 2);
        },
        fire: (_t, x, o, _u, _prev, next) => {
          if (next[0]) x[o] = 1;
          else if (!next[1]) x[o] = 0;
        },
      },
    };
  },
});

registerComponent({
  type: "dig.adc",
  label: "Conversor A/D",
  category: "dseq",
  labelPrefix: "ADC",
  symbol: "ic-adc",
  description: "Amostra a entrada analógica a cada borda de subida do clock e a converte em um número binário.",
  model: "N = ⌊ u / Vref · 2^n ⌋, limitado a 0 … 2^n − 1",
  hypotheses: ["Conversão instantânea. A resolução é Vref / 2^n.", "Entrada de 0 a Vref."],
  ports: (p) => [inP("in", "Entrada analógica", false, "u"), inP("clk", "Clock (amostragem)", false, ""), ...bitsOut("q", p.num("bits")), outP("v", "Código decimal", "N")],
  params: [
    { key: "bits", label: "Número de bits", kind: "int", default: 4, min: 2, max: 12, structural: true, group: "basic" },
    { key: "vref", label: "Tensão de referência", unit: "V", kind: "number", default: 5, min: 1e-6, group: "basic" },
  ],
  block: (p) => {
    const nb = p.num("bits"),
      vref = p.num("vref");
    const top = 2 ** nb - 1;
    return {
      ...frozen(1)(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => {
        const c = Math.round(x[o]);
        for (let i = 0; i < nb; i++) y[i] = (c >> i) & 1;
        y[nb] = c;
      },
      discrete: {
        nGuards: 1,
        guards: (_t, _x, _o, u, g) => void (g[0] = u[1] - 0.5),
        fire: (_t, x, o, u, prev, next, init) => {
          if (!init && prev[0] === 0 && next[0] === 1) x[o] = Math.max(0, Math.min(top, Math.floor((u[0] / vref) * 2 ** nb)));
        },
      },
    };
  },
});

registerComponent({
  type: "dig.dac",
  label: "Conversor D/A",
  category: "dseq",
  labelPrefix: "DAC",
  symbol: "ic-dac",
  description: "Converte um número binário (bits de entrada) em uma tensão em degraus.",
  model: "y = Vref · N / 2^n,  N = Σ bi · 2^i",
  hypotheses: ["Conversão instantânea. O degrau mínimo (1 LSB) é Vref / 2^n."],
  ports: (p) => [...Array.from({ length: p.num("bits") }, (_, i) => inP(`d${i}`, `Bit ${i}${i === 0 ? " (menos significativo)" : ""}`, true, `D${i}`)), outP("y", "Saída analógica", "y", "V")],
  params: [
    { key: "bits", label: "Número de bits", kind: "int", default: 4, min: 2, max: 12, structural: true, group: "basic" },
    { key: "vref", label: "Tensão de referência", unit: "V", kind: "number", default: 5, min: 1e-6, group: "basic" },
  ],
  block: (p) => {
    const nb = p.num("bits"),
      vref = p.num("vref");
    return {
      ...frozen(1)(p),
      feedthrough: false,
      out: (_t, x, o, _u, y) => void (y[0] = x[o]),
      discrete: {
        nGuards: nb,
        guards: (_t, _x, _o, u, g) => {
          for (let i = 0; i < nb; i++) g[i] = u[i] - 0.5;
        },
        fire: (_t, x, o, _u, _prev, next) => {
          let code = 0;
          for (let i = 0; i < nb; i++) code += next[i] << i;
          x[o] = (vref * code) / 2 ** nb;
        },
      },
    };
  },
});

export type { ParamDef };
