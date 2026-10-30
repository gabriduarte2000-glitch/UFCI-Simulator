import { useReactFlow, useViewport } from "@xyflow/react";
import { useProject } from "../store";
import { useUi } from "../ui";
import { Icon } from "./Icon";
import { useAddAtCenter } from "./Canvas";

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
  const hasNodeSel = useProject((s) => s.selectedNodes.length > 0);
  const addNote = useAddAtCenter();
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
      <button className="tb" title="Duplicar selecionados (Ctrl+D)" disabled={!hasNodeSel} onClick={() => { const st = useProject.getState(); st.copy(); st.paste(); }}>
        <Icon name="duplicate" />
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
      <button className="tb" title="Adicionar anotação de texto" onClick={() => addNote("note.text")}>
        <Icon name="note" />
      </button>
      <button className="tb" title="Atalhos: Ctrl+Z desfazer, Ctrl+Y refazer, Ctrl+C/V copiar e colar, Ctrl+D duplicar, Ctrl+A selecionar tudo, Delete remover, duplo clique abre as propriedades, botão do meio move a vista." onClick={() => useProject.getState().setNotice("Atalhos: Ctrl+Z desfaz, Ctrl+Y refaz, Ctrl+C e Ctrl+V copiam e colam, Ctrl+D duplica, Ctrl+A seleciona tudo, Delete remove. Duplo clique num componente abre as propriedades. Botão do meio do mouse move a vista.")}>
        <Icon name="help" />
      </button>
      <button className={`tb ${snap ? "on" : ""}`} title="Alinhar à grade" onClick={() => setSnap(!snap)}>
        <Icon name="grid" />
      </button>
      <button className={`tb ${showVals ? "on" : ""}`} title="Mostrar o valor em cada fio durante a simulação" onClick={() => setShowVals(!showVals)}>
        <Icon name="value" />
      </button>
    </div>
  );
}
