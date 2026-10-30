import type { ChangeEvent, Diagnostic, ProjectIR, SignalMeta } from "@ufci/engine";

export type WorkerIn =
  | { type: "load"; project: ProjectIR; play: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "reset"; play: boolean }
  | { type: "speed"; value: number }
  | { type: "setParam"; compId: string; key: string; value: number | boolean | string };

export type RunStatus = "idle" | "running" | "paused" | "finished" | "error";

export type WorkerOut =
  | {
      type: "state";
      status: RunStatus;
      t: number;
      diagnostics: Diagnostic[];
      signals: SignalMeta[];
      edgeSignal: Record<string, number | null>;
      /** Curvas devem ser apagadas. */
      cleared: boolean;
      t0: number;
      tf: number;
    }
  | {
      type: "frame";
      status: RunStatus;
      t: number;
      steps: number;
      n: number;
      ts: Float64Array;
      data: Float64Array;
      current: Float64Array;
      events: ChangeEvent[];
      diagnostics?: Diagnostic[];
    };
