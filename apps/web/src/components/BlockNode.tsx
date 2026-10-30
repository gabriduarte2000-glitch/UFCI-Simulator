import { memo, useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from "@xyflow/react";
import { getDef, portsOf, type ParamValue } from "@ufci/engine";
import { useHasInputWire, useLiveInput, useLiveOut } from "../liveOut";
import { nodeSize, SymbolArt } from "./Symbols";

export interface BlockData extends Record<string, unknown> {
  type: string;
  label: string;
  params: Record<string, ParamValue>;
  flag?: "error" | "incomplete" | "warning";
}
type Side = "left" | "right" | "top" | "bottom";
const POS: Record<Side, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };
export type BlockNodeT = Node<BlockData, "block">;

/** Valores ao vivo entregues ao símbolo, ou nada quando não há simulação nem cor ligada. */
function liveFor(symbol: string, out: Record<string, number>, twWire: boolean, tw: number) {
  const hasOut = Object.values(out).some((v) => Number.isFinite(v));
  const withTw = symbol === "tank" && twWire && Number.isFinite(tw) ? { ...out, Tw: tw } : out;
  return hasOut || (symbol === "tank" && "Tw" in withTw) ? withTw : undefined;
}

function BlockNodeImpl({ id, data, selected }: NodeProps<BlockNodeT>) {
  const def = getDef(data.type);
  const update = useUpdateNodeInternals();
  const ports = useMemo(() => (def ? portsOf(def, data.params) : []), [def, data.params]);
  const sig = ports.map((p) => p.name).join(",");
  const liveOut = useLiveOut(id, def?.symbol ?? "");
  const twWire = useHasInputWire(id, "Tw");
  const twVal = useLiveInput(id, "Tw");
  const size = def ? nodeSize(def.symbol, data.params) : { w: 0, h: 0 };
  useEffect(() => update(id), [sig, id, update, size.w, size.h]);
  if (!def) return <div className="node-unknown">Tipo desconhecido: {data.type}</div>;
  const { w, h } = nodeSize(def.symbol, data.params);
  const signs = def.symbol === "sum" ? String(data.params.signs?.value ?? "+-") : "";
  const portTip = (p: { label: string; unit?: string }) => p.label + (p.unit ? ` (${p.unit})` : "");
  // Lado de cada porta: o padrão é entrada à esquerda e saída à direita.
  const sideOf = (p: (typeof ports)[number]): Side => p.side ?? (p.dir === "in" ? "left" : "right");
  const bySide: Record<Side, typeof ports> = { left: [], right: [], top: [], bottom: [] };
  for (const p of ports) bySide[sideOf(p)].push(p);
  const place = (p: (typeof ports)[number], side: Side) => {
    const list = bySide[side];
    const i = list.indexOf(p),
      n = list.length;
    const ext = side === "left" || side === "right" ? h : w;
    if (n === 1) return ext / 2;
    if (!p.side && def.symbol === "sum") return 8 + (i * (ext - 16)) / (n - 1);
    const m = side === "left" || side === "right" ? 14 : 16;
    return m + (i * (ext - 2 * m)) / (n - 1);
  };
  const hasShort = ports.some((p) => p.short);
  const ins = bySide.left.filter((p) => p.dir === "in");
  const hasBottom = bySide.bottom.length > 0;
  const isNote = def.symbol === "note";
  const cls = ["block-node", isNote ? "is-note" : "", selected ? "selected" : "", data.flag ? `flag-${data.flag}` : ""].join(" ");
  return (
    <div className={cls} style={{ width: w, height: h }} title={def.description}>
      <svg width={w} height={h} className="block-art" style={{ overflow: "visible" }}>
        <SymbolArt symbol={def.symbol} params={data.params} w={w} h={h} live={liveFor(def.symbol, liveOut, twWire, twVal)} />
      </svg>
      {ports.map((p) => {
        const side = sideOf(p);
        const pos = place(p, side);
        const phys = p.dir === "phys";
        const horiz = side === "left" || side === "right";
        const style = horiz ? { top: pos } : { left: pos };
        const cls2 = `port ${phys ? "port-phys dom-" + p.domain : "port-signal"}`;
        return (
          <Handle key={p.name} id={p.name} type={p.dir === "in" ? "target" : "source"} position={POS[side]} style={style} className={cls2} title={portTip(p)} />
        );
      })}
      {hasShort &&
        ports
          .filter((p) => p.short)
          .map((p) => {
            const side = sideOf(p);
            const pos = place(p, side);
            const horiz = side === "left" || side === "right";
            return (
              <span key={p.name} className={`port-short side-${side}`} style={horiz ? { top: pos - 7 } : { left: pos }} title={portTip(p)}>
                {p.short}
              </span>
            );
          })}
      {!hasShort && ins.length > 1 &&
        ins.map((p, i) => (
          <span key={p.name} className="port-label" style={{ top: place(p, "left") - 7, left: def.symbol === "sum" ? -22 : 5 }}>
            {def.symbol === "sum" ? (signs[i] === "-" ? "−" : "+") : i + 1}
          </span>
        ))}
      {!isNote && (
        <div className="node-title" style={{ top: h + (hasBottom ? 11 : 5) }}>
          {data.label}
        </div>
      )}
    </div>
  );
}
export const BlockNode = memo(BlockNodeImpl);
