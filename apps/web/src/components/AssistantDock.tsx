// Botão flutuante do assistente: fica no canto inferior direito de qualquer aba e se ajusta à tela.

import { lazy, Suspense, type CSSProperties } from "react";
import { useAssist, useAssistAlert } from "../assistant";
import { useCompact, useUi } from "../ui";
import { Icon } from "./Icon";

const AssistantPanel = lazy(() => import("./AssistantPanel"));

export function AssistantDock() {
  const open = useAssist((s) => s.open);
  const setOpen = useAssist((s) => s.setOpen);
  const alert = useAssistAlert();
  const compact = useCompact();
  const page = useUi((s) => s.page);
  const rightOpen = useUi((s) => s.rightOpen);
  // na montagem, no computador, o botão se afasta da barra lateral ou do painel da direita
  const right = !compact && page === "montagem" ? (rightOpen ? 330 : 44) + 18 : compact ? 14 : 18;
  const style = { "--dock-right": `${right}px` } as CSSProperties;
  return (
    <div className="dock" style={style}>
      {open && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}
      {!(open && compact) && (
        <button className={`dock-fab${open ? " open" : ""}`} aria-label={open ? "Fechar o assistente" : "Abrir o assistente"} aria-expanded={open} title="Assistente" onClick={() => setOpen(!open)}>
          <Icon name={open ? "close" : "sparkle"} size={open ? 18 : 24} />
          {alert && !open && <i className="alert-dot" aria-label="Há avisos na montagem" />}
        </button>
      )}
    </div>
  );
}
