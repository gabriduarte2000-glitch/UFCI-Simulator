import { memo, useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from "@xyflow/react";
import { getDef, portsOf, type ParamValue } from "@ufci/engine";
import { nodeSize, SymbolArt } from "./Symbols";

export interface BlockData extends Record<string, unknown> {
  type: string;
  label: string;
  params: Record<string, ParamValue>;
  flag?: "error" | "incomplete" | "warning";
}
export type BlockNodeT = Node<BlockData, "block">;

function BlockNodeImpl({ id, data, selected }: NodeProps<BlockNodeT>) {
  const def = getDef(data.type);
  const update = useUpdateNodeInternals();
  const ports = useMemo(() => (def ? portsOf(def, data.params) : []), [def, data.params]);
  const sig = ports.map((p) => p.name).join(",");
  useEffect(() => update(id), [sig, id, update]);
  if (!def) return <div className="node-unknown">Tipo desconhecido: {data.type}</div>;
  const { w, h } = nodeSize(def.symbol, data.params);
  const ins = ports.filter((p) => p.dir === "in");
  const outs = ports.filter((p) => p.dir === "out");
  const signs = def.symbol === "sum" ? String(data.params.signs?.value ?? "+-") : "";
  const place = (i: number, n: number) => (n === 1 ? h / 2 : def.symbol === "sum" ? 8 + (i * (h - 16)) / (n - 1) : 12 + (i * (h - 24)) / (n - 1));
  const cls = ["block-node", selected ? "selected" : "", data.flag ? `flag-${data.flag}` : ""].join(" ");
  return (
    <div className={cls} style={{ width: w, height: h }} title={def.description}>
      <svg width={w} height={h} className="block-art">
        <SymbolArt symbol={def.symbol} params={data.params} w={w} h={h} />
      </svg>
      {ins.map((p, i) => (
        <Handle key={p.name} id={p.name} type="target" position={Position.Left} style={{ top: place(i, ins.length) }} className="port port-signal" />
      ))}
      {outs.map((p, i) => (
        <Handle key={p.name} id={p.name} type="source" position={Position.Right} style={{ top: place(i, outs.length) }} className="port port-signal" />
      ))}
      {ins.length > 1 &&
        ins.map((p, i) => (
          <span key={p.name} className="port-label" style={{ top: place(i, ins.length) - 7, left: def.symbol === "sum" ? -22 : 5 }}>
            {def.symbol === "sum" ? (signs[i] === "-" ? "−" : "+") : i + 1}
          </span>
        ))}
      <div className="node-title" style={{ top: h + 5 }}>
        {data.label}
      </div>
    </div>
  );
}
export const BlockNode = memo(BlockNodeImpl);
