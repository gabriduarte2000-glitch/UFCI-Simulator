import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useLive } from "../live";
import { PALETTE } from "../util";
import { useTimeUnit } from "../timeunit";

interface Props {
  sigs: number[];
  /** Altura em pixels, ou "fill" para ocupar o espaço do contêiner. */
  height: number | "fill";
  legend?: boolean;
  /** Índice da cor da primeira curva (para gráficos separados manterem a cor do sinal). */
  colorOffset?: number;
}

const AXIS = "#8fa3c2";
const GRID = "rgba(143,163,194,0.14)";

export function Chart({ sigs, height, legend = false, colorOffset = 0 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const t0 = useLive((s) => s.t0);
  const tf = useLive((s) => s.tf);
  const labels = useLive((s) => s.signals);
  const unit = useTimeUnit();
  const key = sigs.join(",") + "|" + t0 + "|" + tf + "|" + labels.length + "|" + unit;
  const fill = height === "fill";

  useEffect(() => {
    const el = host.current;
    if (!el || sigs.length === 0) return;
    const names = sigs.map((i) => {
      const g = useLive.getState().signals[i];
      return g ? g.label + (g.unit ? ` (${g.unit})` : "") : `sinal ${i}`;
    });
    const h0 = () => (fill ? Math.max(120, el.clientHeight - (legend ? 46 : 0)) : (height as number));
    const opts: uPlot.Options = {
      width: Math.max(200, el.clientWidth),
      height: h0(),
      legend: { show: legend, live: legend },
      cursor: { drag: { x: false, y: false }, points: { size: 6 } },
      padding: [8, 12, 0, 0],
      scales: { x: { time: false, range: () => [t0, tf] } },
      axes: [
        { stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, font: "11px system-ui", label: `Tempo (${unit})`, labelFont: "11px system-ui", labelSize: 16, size: 36 },
        { stroke: AXIS, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, font: "11px system-ui", size: 52 },
      ],
      series: [{ label: "t (s)" }, ...sigs.map((_, k) => ({ label: names[k], stroke: PALETTE[(k + colorOffset) % PALETTE.length], width: 1.8, points: { show: false } }))],
      hooks: {
        draw: [
          (u) => {
            const evs = useLive.getState().events;
            if (!evs.length) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = "rgba(250,204,21,0.8)";
            ctx.lineWidth = 1;
            for (const ev of evs) {
              const x = Math.round(u.valToPos(ev.t, "x", true));
              if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
            }
            ctx.restore();
          },
        ],
      },
    };
    const u = new uPlot(opts, [[], ...sigs.map(() => [])] as uPlot.AlignedData, el);
    const push = () => {
      const { series } = useLive.getState();
      if (series.nSignals === 0) return u.setData([[], ...sigs.map(() => [])] as uPlot.AlignedData);
      const data = [series.timeView(), ...sigs.map((i) => series.colView(i))] as unknown as uPlot.AlignedData;
      u.setData(data);
    };
    push();
    let raf = 0;
    const unsub = useLive.subscribe((s, p) => {
      if (s.version === p.version) return;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          push();
        });
    });
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(200, el.clientWidth), height: h0() }));
    ro.observe(el);
    return () => {
      unsub();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      u.destroy();
    };
  }, [key, height, legend, colorOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sigs.length === 0) return <div className="chart-empty" style={fill ? { flex: 1 } : { height }}>Sem sinais ligados</div>;
  return <div ref={host} className={`chart-host ${fill ? "fill" : ""}`} style={fill ? undefined : { minHeight: height }} />;
}
