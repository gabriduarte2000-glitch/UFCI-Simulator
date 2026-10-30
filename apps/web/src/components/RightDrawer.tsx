import { useProject } from "../store";
import { useCompact, useUi } from "../ui";
import { Icon } from "./Icon";
import { PropertiesPanel } from "./PropertiesPanel";
import { SimControls } from "./SimControls";

/** Gaveta da direita: recolhida vira uma faixa estreita e libera o espaço para o quadro. */
export function RightDrawer() {
  const open = useUi((s) => s.rightOpen);
  const tab = useUi((s) => s.rightTab);
  const setOpen = useUi((s) => s.setRightOpen);
  const openRight = useUi((s) => s.openRight);
  const compact = useCompact();
  const hasSel = useProject((s) => s.selectedNodes.length + s.selectedEdges.length > 0);

  if (!open && compact) return null;
  if (!open)
    return (
      <div className="rail right-rail" role="toolbar" aria-label="Painéis laterais">
        <button className="rail-btn" onClick={() => openRight("props")} title="Abrir Propriedades (ou clique duas vezes num componente)" aria-label="Abrir Propriedades">
          <Icon name="sliders" size={18} />
          {hasSel && <i className="dot-badge" />}
        </button>
        <button className="rail-btn" onClick={() => openRight("sim")} title="Abrir controles da simulação" aria-label="Abrir controles da simulação">
          <Icon name="play" size={18} />
        </button>
        <span className="rail-label">Painéis</span>
      </div>
    );
  return (
    <div className="right">
      <div className="tabs right-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "props"} className={tab === "props" ? "on" : ""} onClick={() => openRight("props")}>
          Propriedades
        </button>
        <button role="tab" aria-selected={tab === "sim"} className={tab === "sim" ? "on" : ""} onClick={() => openRight("sim")}>
          Simulação
        </button>
        <button className="collapse-btn" onClick={() => setOpen(false)} title="Recolher o painel" aria-label="Recolher o painel">
          <Icon name="panelRight" />
        </button>
      </div>
      <div className="right-body">{tab === "props" ? <PropertiesPanel /> : <SimControls />}</div>
    </div>
  );
}
