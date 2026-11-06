// Fábrica de componentes para CIs digitais. A pinagem vem do datasheet: o simulador cria uma porta para
// cada pino de entrada e de saída (pinos de alimentação ficam de fora).

import type { ParamDef, PortDef } from "../types";
import { type BlockImpl, type CategoryId, type ParamReader, registerComponent } from "../components/registry";
import { type Datasheet, overbar, type Pin, pinId, registerDatasheet } from "./datasheet";

export interface Ctx {
  t: number;
  init: boolean;
  /** Nível anterior e atual (0/1) de cada entrada, pelo identificador do pino. */
  p: Record<string, number>;
  n: Record<string, number>;
  /** Parâmetros do componente. */
  par: ParamReader;
  rise(id: string): boolean;
  fall(id: string): boolean;
  /** Saída atual (0/1). */
  get(id: string): number;
  set(id: string, v: number): void;
  /** Estado interno de índice i. */
  s(i: number): number;
  ss(i: number, v: number): void;
}

export interface ICSpec {
  part: string;
  label: string;
  category: CategoryId;
  prefix?: string;
  keywords?: string;
  ds: Omit<Datasheet, "part" | "pins" | "pkg"> & { pkg?: string };
  pins: Pin[];
  /** Quantidade de estados internos além das saídas. */
  nInt?: number;
  init?: number[];
  params?: ParamDef[];
  /** Atualiza as saídas e o estado interno. Chamado a cada mudança de uma entrada. */
  update(c: Ctx): void;
  /** Guarda de tempo extra (monoestáveis): g >= 0 nível alto. */
  timers?: { n: number; guard(t: number, x: Float64Array, o: number, g: number[], base: number): void };
  /** Escreve as saídas calculadas só da entrada (opcional). */
}

/** Variantes de número para a busca: 74LS112 → "74112 74ls112 74hc112 ls112 112". */
function partKeywords(part: string): string {
  const m = /^74(\d+)$/.exec(part);
  if (m) return `${part} 74ls${m[1]} 74hc${m[1]} 74hct${m[1]} sn74ls${m[1]} sn74${m[1]} ls${m[1]} hc${m[1]} ${m[1]}`;
  const c = /^4(\d+)$/.exec(part);
  if (c) return `${part} cd${part} cd${part}b mc14${c[1]} mc14${c[1]}b hef${part}b ${c[1]} cmos`;
  return part;
}

export function defineIC(spec: ICSpec): void {
  const pins = spec.pins;
  const ins = pins.filter((p) => p.dir === "in");
  const outs = pins.filter((p) => p.dir === "out").sort((a, b) => pinId(a.name).localeCompare(pinId(b.name), "en", { numeric: true }));
  const nIn = ins.length,
    nOut = outs.length,
    nInt = spec.nInt ?? 0;
  const inIds = ins.map((p) => pinId(p.name));
  const outIds = outs.map((p) => pinId(p.name));
  const outIx = new Map(outIds.map((id, i) => [id, i]));
  const nTimers = spec.timers?.n ?? 0;

  const mkPort = (p: Pin, dir: "in" | "out"): PortDef => ({
    name: pinId(p.name),
    label: `Pino ${p.n} (${overbar(p.name)}): ${p.fn}`,
    domain: "signal",
    dir,
    optional: dir === "in",
    idle: dir === "in" && p.name.startsWith("!") ? 1 : 0,
    short: overbar(p.name),
    unit: "",
  });
  const ports = [...ins.map((p) => mkPort(p, "in")), ...outs.map((p) => mkPort(p, "out"))];

  const kw = `${partKeywords(spec.part)} ${spec.keywords ?? ""} ${spec.ds.alt} circuito integrado ci chip datasheet ${spec.ds.family === "TTL" ? "ttl 74" : "cmos 4000"}`;

  const diagram = spec.ds.diagram && {
    ...spec.ds.diagram,
    items: spec.ds.diagram.items.map((it) => (it.k === "pin" && it.num === "?" ? { ...it, num: pins.find((q) => q.name === it.name)?.n ?? "" } : it)),
  };
  registerDatasheet({ ...spec.ds, diagram: diagram ?? spec.ds.diagram, part: spec.part, pins, pkg: spec.ds.pkg ?? `DIP-${pins.length}` });

  registerComponent({
    type: `ic.${spec.part}`,
    label: spec.label,
    category: spec.category,
    labelPrefix: spec.prefix ?? "U",
    symbol: `ic:${spec.part}`,
    description: spec.ds.description,
    model: spec.ds.model.join(" "),
    hypotheses: spec.ds.model,
    ports,
    params: spec.params ?? [],
    keywords: kw,
    datasheet: spec.part,
    block: (par): BlockImpl => {
      const total = nOut + nInt + nTimers;
      const zeros = () => {
        const a = new Array<number>(total).fill(0);
        (spec.init ?? []).forEach((v, i) => (a[nOut + i] = v));
        return a;
      };
      return {
        nStates: total,
        x0: zeros,
        der: () => {},
        feedthrough: false,
        out: (_t, x, o, _u, y) => {
          for (let i = 0; i < nOut; i++) y[i] = x[o + i];
        },
        discrete: {
          nGuards: nIn + nTimers,
          guards: (t, x, o, u, g) => {
            for (let i = 0; i < nIn; i++) g[i] = u[i] - 0.5;
            if (spec.timers) spec.timers.guard(t, x, o + nOut + nInt, g, nIn);
          },
          fire: (t, x, o, _u, prev, next, init) => {
            const p: Record<string, number> = {},
              n: Record<string, number> = {};
            for (let i = 0; i < nIn; i++) {
              p[inIds[i]] = prev[i];
              n[inIds[i]] = next[i];
            }
            const c: Ctx = {
              t,
              init,
              p,
              n,
              par,
              rise: (id) => p[id] === 0 && n[id] === 1,
              fall: (id) => p[id] === 1 && n[id] === 0,
              get: (id) => x[o + (outIx.get(id) ?? 0)],
              set: (id, v) => {
                const i = outIx.get(id);
                if (i === undefined) throw new Error(`${spec.part}: saída ${id} inexistente`);
                x[o + i] = v;
              },
              s: (i) => x[o + nOut + i],
              ss: (i, v) => void (x[o + nOut + i] = v),
            };
            // Os timers aparecem como entradas extras em next/prev (índices nIn...).
            for (let k = 0; k < nTimers; k++) {
              p[`__timer${k}`] = prev[nIn + k];
              n[`__timer${k}`] = next[nIn + k];
            }
            spec.update(c);
          },
        },
      };
    },
  });
}
