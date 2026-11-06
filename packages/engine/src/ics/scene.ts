// Construtores de desenhos para os diagramas internos dos CIs.

import type { Item, Pin, Scene } from "./datasheet";
import { overbar } from "./datasheet";

type GateKind = "and" | "or" | "nand" | "nor" | "xor" | "xnor" | "not" | "buf";
export const GW = 40; // largura do símbolo da porta
const BUB = 6;

/** Alturas das entradas de uma porta com n entradas, relativas ao centro. */
export const inOffsets = (n: number): number[] => (n === 1 ? [0] : n === 2 ? [-8, 8] : n === 3 ? [-12, 0, 12] : n === 4 ? [-15, -5, 5, 15] : Array.from({ length: n }, (_, i) => -18 + (36 * i) / (n - 1)));
export const gateOutX = (x: number, g: GateKind) => x + GW + (g === "nand" || g === "nor" || g === "xnor" || g === "not" ? BUB : 0);

/** Uma porta com fios curtos de entrada e saída já ligados aos rótulos. */
export function gate(x: number, y: number, g: GateKind, n = 2): Item {
  return { k: "gate", g, x, y, n };
}

export const wire = (...p: [number, number][]): Item => ({ k: "wire", p });
export const txt = (x: number, y: number, t: string, a: "start" | "middle" | "end" = "middle", size = 10, bold = false, color?: string): Item => ({ k: "text", x, y, t, a, size, bold, color });
export const box = (x: number, y: number, w: number, h: number, t: string, s?: string, clk?: number[], dash = false): Item => ({ k: "box", x, y, w, h, t, s, clk, dash });
export const dot = (x: number, y: number): Item => ({ k: "dot", x, y });
export const pinLabel = (x: number, y: number, side: "l" | "r" | "t" | "b", num: number | string, name: string): Item => ({ k: "pin", x, y, side, num, name });

const pn = (pins: Pin[], name: string) => pins.find((p) => p.name === name);

/** Portas iguais do CI desenhadas em duas colunas, cada uma ligada aos seus pinos. */
export function gatesScene(op: GateKind, groups: { ins: string[]; out: string }[], pins: Pin[]): Scene {
  const items: Item[] = [];
  const cols = groups.length > 3 ? 2 : 1;
  const per = Math.ceil(groups.length / cols);
  const rowH = op === "nand" || op === "nor" ? 74 : 62;
  groups.forEach((gr, i) => {
    const col = Math.floor(i / per),
      row = i % per;
    const gx = 86 + col * 290,
      gy = 40 + row * rowH;
    const n = gr.ins.length;
    items.push(gate(gx, gy, op, n));
    inOffsets(n).forEach((off, k) => {
      const p = pn(pins, gr.ins[k]);
      items.push(wire([gx - 40, gy + off], [gx, gy + off]));
      items.push(pinLabel(gx - 40, gy + off, "l", p?.n ?? "?", p?.name ?? gr.ins[k]));
    });
    const po = pn(pins, gr.out);
    const ox = gateOutX(gx, op);
    items.push(wire([ox, gy], [ox + 40, gy]));
    items.push(pinLabel(ox + 40, gy, "r", po?.n ?? "?", po?.name ?? gr.out));
  });
  return { w: cols === 2 ? 640 : 350, h: 20 + per * rowH + 20, items };
}

/** Corrente de flip-flops (contadores e registradores): n caixas ligadas em fila. */
export function chainScene(opts: { n: number; ff: string; names: string[]; clockMode: "ripple" | "sync" | "shift"; inLabel?: string; extra?: string; outs?: string[] }): Scene {
  const { n, ff, names } = opts;
  const bw = 62,
    gap = 34,
    x0 = 120,
    y0 = 70;
  const items: Item[] = [];
  const W = Math.max(520, x0 + n * (bw + gap) + 30);
  const H = 220;
  // Entrada
  if (opts.clockMode === "shift") {
    items.push(txt(14, y0 + 20, opts.inLabel ?? "Entrada serial", "start", 10, true));
    items.push(wire([14, y0 + 30], [x0, y0 + 30]));
  } else if (opts.clockMode === "ripple") {
    items.push(txt(14, y0 + 36, "CLK", "start", 10, true));
    items.push(wire([14, y0 + 46], [x0, y0 + 46]));
  }
  // Barra de clock comum (síncrono e deslocamento)
  if (opts.clockMode !== "ripple") {
    const cy = y0 + 118;
    items.push(txt(14, cy - 8, "CLK", "start", 10, true));
    items.push(wire([14, cy], [x0 + n * (bw + gap) - gap + 10, cy]));
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (bw + gap);
      items.push(wire([x + bw / 2, cy], [x + bw / 2, y0 + 62]), dot(x + bw / 2, cy));
    }
  }
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (bw + gap);
    items.push(box(x, y0, bw, 62, ff, names[i] ?? `Q${i}`, [y0 + 46]));
    // saída
    items.push(wire([x + bw, y0 + 20], [x + bw + gap - 6, y0 + 20]));
    items.push(wire([x + bw / 2, y0], [x + bw / 2, y0 - 22]));
    items.push(txt(x + bw / 2, y0 - 30, names[i] ?? `Q${i}`, "middle", 11, true));
    if (i < n - 1) {
      if (opts.clockMode === "ripple") {
        items.push(wire([x + bw, y0 + 20], [x + bw + gap / 2, y0 + 20], [x + bw + gap / 2, y0 + 46], [x + bw + gap, y0 + 46]));
      } else if (opts.clockMode === "shift") {
        items.push(wire([x + bw, y0 + 20], [x + bw + gap, y0 + 20], [x + bw + gap, y0 + 30], [x + bw + gap, y0 + 30]));
        items.push(wire([x + bw + gap - 1, y0 + 30], [x + bw + gap, y0 + 30]));
      } else {
        items.push(wire([x + bw, y0 + 20], [x + bw + gap, y0 + 20]));
      }
    }
  }
  let h = H;
  if (opts.extra) {
    const per = Math.max(30, Math.floor((W - 28) / 5.3));
    const lines: string[] = [];
    let cur = "";
    for (const wd of opts.extra.split(" ")) {
      if ((cur + " " + wd).trim().length > per) (lines.push(cur), (cur = wd));
      else cur = (cur + " " + wd).trim();
    }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => items.push(txt(14, H - 6 + i * 13, l, "start", 10)));
    h = H + lines.length * 13 - 6;
  }
  return { w: W, h, items };
}

/** Decodificador: barramentos verticais das entradas (e complementos) e uma porta por saída. */
export function decoderScene(opts: { inNames: string[]; inPins: Pin[]; outs: { name: string; code: number }[]; enables: string[]; enPins: Pin[]; outPins: Pin[]; gate: GateKind }): Scene {
  const items: Item[] = [];
  const nIn = opts.inNames.length;
  const busX0 = 130,
    step = 22;
  const top = 38;
  const rowH = 38;
  const outsN = opts.outs.length;
  const H = top + outsN * rowH + 20;
  // entradas à esquerda, cada uma gera um barramento direto e um invertido
  const busX: { x: number; label: string }[] = [];
  opts.inNames.forEach((nm, i) => {
    const y = 26 + i * 16;
    const x1 = busX0 + i * 2 * step;
    const x2 = x1 + step;
    const p = opts.inPins.find((q) => q.name === nm);
    items.push(wire([50, y], [x1, y]));
    items.push(pinLabel(50, y, "l", p?.n ?? "?", nm));
    items.push(wire([x1, y], [x1, H - 12]), dot(x1, y));
    // inversor
    items.push(wire([x1 + 4, y], [x1 + 10, y]));
    items.push(gate(x1 + 4, y, "not", 1));
    items.push(wire([gateOutX(x1 + 4, "not"), y], [x2, y]));
    items.push(wire([x2, y], [x2, H - 12]));
    busX.push({ x: x1, label: nm }, { x: x2, label: `${nm}̅` });
  });
  // enables
  const enX0 = busX0 + nIn * 2 * step;
  opts.enables.forEach((en, i) => {
    const y = 26 + (nIn + i) * 16;
    const x = enX0 + i * step;
    const p = opts.enPins.find((q) => q.name === en);
    items.push(wire([50, y], [x, y]), pinLabel(50, y, "l", p?.n ?? "?", en));
    items.push(wire([x, y], [x, H - 12]), dot(x, y));
    busX.push({ x, label: en });
  });
  const gx = enX0 + opts.enables.length * step + 24;
  const nGateIn = nIn + opts.enables.length;
  opts.outs.forEach((o, r) => {
    const y = top + 40 + r * rowH - 14;
    const gy = y + 6;
    items.push(gate(gx, gy, opts.gate, Math.min(nGateIn, 4)));
    // quais barramentos entram
    const sel: number[] = [];
    for (let b = 0; b < nIn; b++) sel.push(busIndex(b, (o.code >> b) & 1));
    opts.enables.forEach((_, e) => sel.push(nIn * 2 + e));
    const offs = inOffsets(Math.min(nGateIn, 4));
    sel.slice(0, 4).forEach((bi, k) => {
      const bx = busX[bi].x;
      const iy = gy + offs[k];
      items.push(wire([bx, iy], [gx, iy]), dot(bx, iy));
    });
    const ox = gateOutX(gx, opts.gate);
    items.push(wire([ox, gy], [ox + 36, gy]));
    const po = opts.outPins.find((q) => q.name === o.name);
    items.push(pinLabel(ox + 36, gy, "r", po?.n ?? "?", o.name));
  });
  const W = gx + GW + BUB + 36 + 60;
  return { w: W, h: H + 10, items };

  function busIndex(bit: number, val: number): number {
    return bit * 2 + (val ? 0 : 1);
  }
}

/** Diagrama de blocos simples: colunas de caixas ligadas por setas. */
export function blocksScene(w: number, h: number, items: Item[]): Scene {
  return { w, h, items };
}

export { overbar };
