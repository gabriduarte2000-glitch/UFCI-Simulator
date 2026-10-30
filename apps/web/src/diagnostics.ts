import { create } from "zustand";
import { compile, type Diagnostic } from "@ufci/engine";
import { useProject } from "./store";

export const useDiag = create<{ list: Diagnostic[] }>(() => ({ list: [] }));

let timer: ReturnType<typeof setTimeout> | null = null;
function run() {
  const r = compile(useProject.getState().project);
  useDiag.setState({ list: r.diagnostics.filter((d) => d.code !== "empty") });
}
useProject.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 150);
});
run();

/** Erros de montagem que o usuário resolve ligando fios: aparecem em âmbar, não em vermelho. */
export const INCOMPLETE_CODES = new Set(["no-input", "scope-empty"]);
