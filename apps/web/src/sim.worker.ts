/// <reference lib="webworker" />
import { Simulation, type ProjectIR } from "@ufci/engine";
import type { RunStatus, WorkerIn, WorkerOut } from "./protocol";

let sim: Simulation | null = null;
let playing = false;
let speed = 1;
let lastTick = 0;
let rowsT: number[] = [];
let rowsD: number[] = [];
let sentEvents = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

function status(): RunStatus {
  if (!sim) return "idle";
  if (sim.status === "error") return "error";
  if (sim.status === "finished") return "finished";
  if (playing) return "running";
  return sim.t > sim.project.simulation.t0 ? "paused" : "idle";
}

function create(project: ProjectIR) {
  rowsT = [];
  rowsD = [];
  sentEvents = 0;
  sim = new Simulation(project, {
    keepSeries: false,
    onRow: (t, sig) => {
      rowsT.push(t);
      for (let i = 0; i < sig.length; i++) rowsD.push(sig[i]);
    },
  });
}

function sendState(cleared: boolean) {
  if (!sim) return;
  const sc = sim.project.simulation;
  const st = status();
  post({
    type: "state",
    status: st,
    t: sim.t,
    diagnostics: sim.diagnostics,
    signals: sim.signals,
    edgeSignal: sim.edgeSignal,
    cleared,
    t0: sc.t0,
    tf: sc.tf,
  });
  flush();
}

function flush(withDiagnostics = false) {
  if (!sim) return;
  const n = rowsT.length;
  const ts = Float64Array.from(rowsT);
  const data = Float64Array.from(rowsD);
  rowsT = [];
  rowsD = [];
  const events = sim.events.slice(sentEvents);
  sentEvents = sim.events.length;
  const current = sim.currentSignals();
  post(
    {
      type: "frame",
      status: status(),
      t: sim.t,
      steps: sim.steps,
      n,
      ts,
      data,
      current,
      events,
      diagnostics: withDiagnostics ? sim.diagnostics : undefined,
    },
    [ts.buffer, data.buffer],
  );
}

function tick() {
  if (!sim || !playing) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  const sc = sim.project.simulation;
  const base = (sc.tf - sc.t0) / 10;
  if (speed >= 1000) {
    const deadline = now + 24;
    do {
      sim.advanceTo(sim.t + (sc.tf - sc.t0) / 200);
    } while (sim.status === "running" && performance.now() < deadline);
  } else {
    sim.advanceTo(sim.t + base * speed * dt);
  }
  if (sim.status === "finished" || sim.status === "error") playing = false;
  flush(sim.status === "error");
  if (!playing) stopTimer();
}

function startTimer() {
  if (timer) return;
  lastTick = performance.now();
  timer = setInterval(tick, 30);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  switch (m.type) {
    case "load": {
      stopTimer();
      create(m.project);
      playing = m.play && !!sim && sim.compiled;
      sendState(true);
      if (playing) startTimer();
      break;
    }
    case "reset": {
      if (!sim) break;
      stopTimer();
      rowsT = [];
      rowsD = [];
      sim.reset();
      sentEvents = 0;
      playing = m.play && sim.compiled;
      sendState(true);
      if (playing) startTimer();
      break;
    }
    case "play":
      if (!sim || !sim.compiled || sim.status === "finished" || sim.status === "error") break;
      playing = true;
      sendState(false);
      startTimer();
      break;
    case "pause":
      playing = false;
      stopTimer();
      sendState(false);
      break;
    case "speed":
      speed = m.value;
      break;
    case "setParam": {
      if (!sim) break;
      const r = sim.setParam(m.compId, m.key, m.value);
      if (r.reset) {
        playing = false;
        stopTimer();
        rowsT = [];
        rowsD = [];
        sentEvents = 0;
        sendState(true);
      } else {
        flush(false);
      }
      break;
    }
  }
};
