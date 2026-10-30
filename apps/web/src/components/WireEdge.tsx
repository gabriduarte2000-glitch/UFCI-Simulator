import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps, type Edge } from "@xyflow/react";
import { useLive } from "../live";
import { useUi } from "../ui";
import { fmtNum } from "../util";
import { DOMAIN_COLOR } from "./Symbols";

export interface WireData extends Record<string, unknown> {
  flag?: "error";
  /** Domínio do fio: sinal (padrão) ou grandeza física. */
  domain?: "signal" | "mech" | "rot" | "elec";
}
export type WireEdgeT = Edge<WireData, "wire">;

function WireEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<WireEdgeT>) {
  const phys = !!data?.domain && data.domain !== "signal";
  const back = !phys && sourcePosition === "right" && targetPosition === "left" && sourceX > targetX - 30;
  const yb = Math.max(sourceY, targetY) + 70;
  const [smooth, sx, sy] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 4, offset: 24 });
  // Realimentação: o fio volta por baixo dos blocos, como nos diagramas dos livros.
  const path = back ? `M${sourceX},${sourceY} H${sourceX + 24} V${yb} H${targetX - 24} V${targetY} H${targetX}` : smooth;
  const lx = back ? (sourceX + targetX) / 2 : sx;
  const ly = back ? yb : sy;
  const idx = useLive((s) => s.edgeSignal[id]);
  const value = useLive((s) => (idx !== null && idx !== undefined ? s.current[idx] : undefined));
  const unit = useLive((s) => (idx !== null && idx !== undefined ? s.signals[idx]?.unit : undefined));
  const status = useLive((s) => s.status);
  const active = status !== "idle";
  const show = useUi((s) => s.showWireValues);
  const color = data?.flag === "error" ? "#d93a3a" : selected ? "#2a6bd6" : phys ? DOMAIN_COLOR[data!.domain!] : "#1b2a41";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={phys ? undefined : `url(#arrow-${data?.flag === "error" ? "err" : selected ? "sel" : "n"})`} style={{ stroke: color, strokeWidth: selected ? 2.6 : phys ? 2.2 : 1.8 }} interactionWidth={18} />
      {active && !phys && unit === "L/min" && value !== undefined && Math.abs(value) > 1e-4 && (
        <path d={path} className="wire-flow" style={{ stroke: "#3b8fe8", strokeWidth: 3.2, ["--dur" as string]: `${(16 / Math.min(220, 14 + 14 * Math.abs(value))).toFixed(3)}s`, animationPlayState: status === "running" ? "running" : "paused", animationDirection: value < 0 ? "reverse" : "normal" }} />
      )}
      {show && active && value !== undefined && Number.isFinite(value) && (
        <EdgeLabelRenderer>
          <div className="wire-value" style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}>
            {fmtNum(value)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
export const WireEdge = memo(WireEdgeImpl);
