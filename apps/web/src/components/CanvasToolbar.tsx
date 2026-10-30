import { useReactFlow, useViewport } from "@xyflow/react";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Icon } from "./Icon";

export function CanvasToolbar() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  const snap = useUi((s) => s.snap);
  const setSnap = useUi((s) => s.setSnap);
  const showVals = useUi((s) => s.showWireValues);
  const setShowVals = useUi((s) => s.setShowWireValues);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const hasSel = useProject((s) => s.selectedNodes.length + s.selectedEdges.length > 0);
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Ferramentas da área de trabalho">
      <button className={`tb ${tool === "select" ? "on" : ""}`} title="Selecionar (arraste para selecionar vários)" onClick={() => setTool("select")}>
        <Icon name="cursor" />
      </button>
      <button className={`tb ${tool === "pan" ? "on" : ""}`} title="Mover a vista (ou use o botão do meio do mouse)" onClick={() => setTool("pan")}>
        <Icon name="hand" />
      </button>
      <span className="sep" />
      <button className="tb" title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={() => useProject.getState().undo()}>
        <Icon name="undo" />
      </button>
      <button className="tb" title="Refazer (Ctrl+Y)" disabled={!canRedo} onClick={() => useProject.getState().redo()}>
        <Icon name="redo" />
      </button>
      <button className="tb" title="Excluir selecionado (Delete)" disabled={!hasSel} onClick={() => useProject.getState().deleteSelection()}>
        <Icon name="trash" />
      </button>
      <span className="sep" />
      <button className="tb" title="Diminuir" onClick={() => rf.zoomOut({ duration: 120 })}>
        <Icon name="minus" />
      </button>
      <span className="zoom">{Math.round(zoom * 100)}%</span>
      <button className="tb" title="Aumentar" onClick={() => rf.zoomIn({ duration: 120 })}>
        <Icon name="plus" />
      </button>
      <button className="tb" title="Enquadrar tudo" onClick={() => rf.fitView({ padding: 0.25, maxZoom: 1.2, duration: 200 })}>
        <Icon name="fit" />
      </button>
      <span className="sep" />
      <button className={`tb ${snap ? "on" : ""}`} title="Alinhar à grade" onClick={() => setSnap(!snap)}>
        <Icon name="grid" />
      </button>
      <button className={`tb ${showVals ? "on" : ""}`} title="Mostrar o valor em cada fio durante a simulação" onClick={() => setShowVals(!showVals)}>
        <Icon name="value" />
      </button>
    </div>
  );
}
