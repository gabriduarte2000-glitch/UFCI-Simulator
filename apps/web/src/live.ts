// Estado ao vivo da simulação e ponte com o Web Worker.

import { create } from "zustand";
import { Series, type ChangeEvent, type Diagnostic, type SignalMeta } from "@ufci/engine";
import { onProjectEvent, useProject } from "./store";
import type { RunStatus, WorkerIn, WorkerOut } from "./protocol";

interface Live {
  status: RunStatus;
  t: number;
  t0: number;
  tf: number;
  steps: number;
  signals: SignalMeta[];
  edgeSignal: Record<string, number | null>;
  current: Float64Array;
  series: Series;
  events: ChangeEvent[];
  runtimeDiagnostics: Diagnostic[];
  /** Cresce a cada atualização de dados. Os gráficos observam este contador. */
  version: number;
  speed: number;
  sessionProjectName: string;
}

const emptySeries = () => new Series(0);

export const useLive = create<Live>(() => ({
  status: "idle",
  t: 0,
  t0: 0,
  tf: 10,
  steps: 0,
  signals: [],
  edgeSignal: {},
  current: new Float64Array(0),
  series: emptySeries(),
  events: [],
  runtimeDiagnostics: [],
  version: 0,
  speed: 1,
  sessionProjectName: "",
}));

let worker: Worker | null = null;
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => handle(ev.data);
  return worker;
}
const send = (m: WorkerIn) => getWorker().postMessage(m);

let pending: { frames: Extract<WorkerOut, { type: "frame" }>[] } = { frames: [] };
let raf = 0;

function handle(m: WorkerOut) {
  if (m.type === "state") {
    pending = { frames: [] };
    useLive.setState((s) => ({
      status: m.status,
      t: m.t,
      t0: m.t0,
      tf: m.tf,
      signals: m.signals,
      edgeSignal: m.edgeSignal,
      runtimeDiagnostics: m.diagnostics.filter((d) => d.severity !== "info"),
      series: m.cleared ? new Series(m.signals.length, 300_000) : s.series,
      events: m.cleared ? [] : s.events,
      current: m.cleared ? new Float64Array(m.signals.length) : s.current,
      steps: m.cleared ? 0 : s.steps,
      version: s.version + 1,
    }));
    return;
  }
  pending.frames.push(m);
  if (!raf) raf = requestAnimationFrame(applyFrames);
}

function applyFrames() {
  raf = 0;
  const frames = pending.frames;
  pending = { frames: [] };
  if (!frames.length) return;
  const s = useLive.getState();
  const ns = s.signals.length;
  let last = frames[0];
  const newEvents: ChangeEvent[] = [];
  let diags: Diagnostic[] | undefined;
  for (const f of frames) {
    for (let i = 0; i < f.n; i++) s.series.push(f.ts[i], f.data.subarray(i * ns, (i + 1) * ns));
    newEvents.push(...f.events);
    if (f.diagnostics) diags = f.diagnostics;
    last = f;
  }
  useLive.setState({
    status: last.status,
    t: last.t,
    steps: last.steps,
    current: last.current,
    events: newEvents.length ? [...s.events, ...newEvents] : s.events,
    runtimeDiagnostics: diags ? diags.filter((d) => d.severity !== "info") : s.runtimeDiagnostics,
    version: s.version + 1,
  });
}

export const hasSession = () => {
  const { status } = useLive.getState();
  return status === "running" || status === "paused" || status === "finished";
};

function clearLocal() {
  useLive.setState((s) => ({
    status: "idle",
    t: s.t0,
    signals: [],
    edgeSignal: {},
    current: new Float64Array(0),
    series: emptySeries(),
    events: [],
    runtimeDiagnostics: [],
    steps: 0,
    version: s.version + 1,
  }));
}

export const sim = {
  play() {
    const { status } = useLive.getState();
    if (status === "paused") return send({ type: "play" });
    send({ type: "load", project: useProject.getState().project, play: true });
  },
  pause() {
    send({ type: "pause" });
  },
  /** Volta ao instante inicial e para. */
  stop() {
    if (useLive.getState().status === "idle") return;
    clearLocal();
    send({ type: "load", project: useProject.getState().project, play: false });
  },
  /** Reinicia e continua rodando. */
  restart() {
    send({ type: "load", project: useProject.getState().project, play: true });
  },
  setSpeed(v: number) {
    useLive.setState({ speed: v });
    send({ type: "speed", value: v });
  },
};

// Ligação com as edições do projeto.
onProjectEvent((e) => {
  if (!hasSession()) {
    if (useLive.getState().status === "error" || useLive.getState().runtimeDiagnostics.length) clearLocal();
    return;
  }
  if (e.kind === "param") {
    send({ type: "setParam", compId: e.compId, key: e.key, value: e.value });
    return;
  }
  // Estrutura, configuração ou projeto novo: reinicia e fica parado.
  send({ type: "load", project: useProject.getState().project, play: false });
});
