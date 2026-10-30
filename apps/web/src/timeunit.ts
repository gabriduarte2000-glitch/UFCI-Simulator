import { useProject } from "./store";

export const TIME_UNITS = [
  { id: "s", label: "segundos (s)" },
  { id: "min", label: "minutos (min)" },
  { id: "h", label: "horas (h)" },
  { id: "dia", label: "dias" },
] as const;

/** Rótulo curto da unidade de tempo do projeto. */
export function useTimeUnit(): string {
  return useProject((s) => s.project.simulation.timeUnit ?? "s");
}
