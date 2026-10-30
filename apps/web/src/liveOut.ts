// Valores ao vivo das saídas de um componente, usados para animar o símbolo.

import { useShallow } from "zustand/react/shallow";
import type { SignalMeta } from "@ufci/engine";
import { useLive } from "./live";
import { useProject } from "./store";

/** Saídas que cada símbolo usa para se animar. */
export const LIVE_PORTS: Record<string, string[]> = {
  tank: ["h", "qout"],
  htank: ["T"],
  boiler: ["h", "T", "steam"],
  pump: ["out"],
  valve: ["out"],
  heater: ["out"],
  inertia: ["th", "w"],
  motor: ["th", "w"],
  mass: ["x"],
  led: ["i"],
  "ic-counter": ["v"],
  "ic-adc": ["v"],
  "ic-cmp": ["y"],
};

/** Entradas cujo valor ao vivo o símbolo usa (níveis lógicos, comando de chave). */
export const LIVE_INPUTS: Record<string, string[]> = {
  dled: ["a"],
  dsev: ["b0", "b1", "b2", "b3"],
  switch: ["u"],
};

const cache = new WeakMap<SignalMeta[], Map<string, number>>();
function indexOf(signals: SignalMeta[]): Map<string, number> {
  let m = cache.get(signals);
  if (!m) {
    m = new Map(signals.map((s, i) => [s.id, i]));
    cache.set(signals, m);
  }
  return m;
}

const NONE: number[] = [];

/** Valores atuais das saídas do componente. NaN quando a simulação não está ativa. */
export function useLiveOut(compId: string, symbol: string): Record<string, number> {
  const ports = LIVE_PORTS[symbol];
  const vals = useLive(
    useShallow((s) => {
      if (!ports) return NONE;
      const m = indexOf(s.signals);
      return ports.map((p) => {
        const i = m.get(`${compId}.${p}`);
        return i === undefined || s.status === "idle" ? NaN : (s.current[i] ?? NaN);
      });
    }),
  );
  const out: Record<string, number> = {};
  if (ports) ports.forEach((p, i) => (out[p] = vals[i]));
  return out;
}

/** Valor do sinal que chega a uma entrada: ao vivo durante a simulação, ou o valor do controle ligado quando parada. NaN sem fio. */
export function useLiveInput(compId: string, port: string): number {
  const conn = useProject((s) => s.project.connections.find((c) => c.to.component === compId && c.to.port === port));
  const connId = conn?.id;
  const staticValue = useProject((s) => {
    if (!conn) return NaN;
    const src = s.project.components.find((c) => c.id === conn.from.component);
    if (!src || (src.type !== "signal.manual" && src.type !== "signal.constant")) return NaN;
    const v = src.params.value?.value;
    return typeof v === "number" ? v : NaN;
  });
  const live = useLive((s) => {
    if (!connId || s.status === "idle") return NaN;
    const i = s.edgeSignal[connId];
    return i === null || i === undefined ? NaN : (s.current[i] ?? NaN);
  });
  return Number.isFinite(live) ? live : staticValue;
}

/** O valor de uma entrada está ligada por fio? */
export function useHasInputWire(compId: string, port: string): boolean {
  return useProject((s) => s.project.connections.some((c) => c.to.component === compId && c.to.port === port));
}

const NO_VALS: number[] = [];

/** Valores atuais das entradas listadas em LIVE_INPUTS, pelo valor do sinal que chega. NaN sem fio ou sem simulação. */
export function useLiveIns(compId: string, symbol: string): Record<string, number> {
  const ports = LIVE_INPUTS[symbol];
  const wires = useProject(
    useShallow((s) => (ports ? ports.map((p) => s.project.connections.find((c) => c.to.component === compId && c.to.port === p)?.id ?? "") : [])),
  );
  const statics = useProject(
    useShallow((s) =>
      ports
        ? ports.map((p) => {
            const conn = s.project.connections.find((c) => c.to.component === compId && c.to.port === p);
            if (!conn) return NaN;
            const src = s.project.components.find((c) => c.id === conn.from.component);
            if (!src) return NaN;
            if (src.type === "signal.manual" || src.type === "signal.constant") {
              const v = src.params.value?.value;
              return typeof v === "number" ? v : NaN;
            }
            if (src.type === "dig.switch") return src.params.on?.value === true ? 1 : 0;
            return NaN;
          })
        : NO_VALS,
    ),
  );
  const lives = useLive(
    useShallow((s) => (ports ? wires.map((id) => (!id || s.status === "idle" ? NaN : (s.current[s.edgeSignal[id] ?? -1] ?? NaN))) : NO_VALS)),
  );
  const out: Record<string, number> = {};
  if (ports) ports.forEach((p, i) => (out[p] = Number.isFinite(lives[i]) ? lives[i] : statics[i]));
  return out;
}
