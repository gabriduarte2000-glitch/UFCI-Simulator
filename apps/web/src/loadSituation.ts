import type { Situation } from "@ufci/engine";
import { useProject } from "./store";
import { useUi } from "./ui";

/** Abre uma situação pronta, avisando antes de trocar um projeto que já tem conteúdo. */
export function loadSituation(s: Situation) {
  const st = useProject.getState();
  if (st.project.components.length > 0 && !window.confirm(`Abrir "${s.title}" no lugar do projeto atual? Salve o atual em arquivo antes se quiser guardá-lo.`)) return;
  st.replaceProject(s.make());
  st.setNotice(`Situação aberta: ${s.title}. ${s.explore}`);
  useUi.getState().setPage("montagem");
}
