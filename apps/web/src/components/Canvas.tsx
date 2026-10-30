import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection as RFConnection,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
} from "@xyflow/react";
import { checkPortPair, EXAMPLES, getDef, portsOf } from "@ufci/engine";
import { onProjectEvent, useProject } from "../store";
import { useDiag, INCOMPLETE_CODES } from "../diagnostics";
import { useLive } from "../live";
import { useUi } from "../ui";
import { BlockNode, type BlockNodeT } from "./BlockNode";
import { WireEdge, type WireEdgeT } from "./WireEdge";
import { CanvasToolbar } from "./CanvasToolbar";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

const nodeTypes = { block: BlockNode };
const edgeTypes = { wire: WireEdge };

function Markers() {
  const mk = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={color} />
    </marker>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {mk("arrow-n", "#1b2a41")}
        {mk("arrow-sel", "#2a6bd6")}
        {mk("arrow-err", "#d93a3a")}
      </defs>
    </svg>
  );
}

function Inner() {
  const project = useProject((s) => s.project);
  const selectedNodes = useProject((s) => s.selectedNodes);
  const selectedEdges = useProject((s) => s.selectedEdges);
  const diag = useDiag((s) => s.list);
  const runtime = useLive((s) => s.runtimeDiagnostics);
  const snap = useUi((s) => s.snap);
  const tool = useUi((s) => s.tool);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const flags = useMemo(() => {
    const nodes = new Map<string, "error" | "incomplete" | "warning">();
    const edges = new Set<string>();
    for (const d of [...diag, ...runtime]) {
      const kind = d.severity === "error" ? (INCOMPLETE_CODES.has(d.code) ? "incomplete" : "error") : "warning";
      for (const id of d.componentIds ?? []) {
        const cur = nodes.get(id);
        if (!cur || (cur !== "error" && kind === "error") || (cur === "warning" && kind === "incomplete")) nodes.set(id, kind);
      }
      if (d.severity === "error" && !INCOMPLETE_CODES.has(d.code)) for (const id of d.connectionIds ?? []) edges.add(id);
    }
    return { nodes, edges };
  }, [diag, runtime]);

  const nodes: BlockNodeT[] = useMemo(
    () =>
      project.components.map((c) => ({
        id: c.id,
        type: "block" as const,
        position: project.layout?.positions[c.id] ?? { x: 0, y: 0 },
        selected: selectedNodes.includes(c.id),
        data: { type: c.type, label: c.label ?? c.id, params: c.params, flag: flags.nodes.get(c.id) },
      })),
    [project.components, project.layout, selectedNodes, flags.nodes],
  );

  const edges: WireEdgeT[] = useMemo(
    () =>
      project.connections.map((c) => ({
        id: c.id,
        type: "wire" as const,
        source: c.from.component,
        sourceHandle: c.from.port,
        target: c.to.component,
        targetHandle: c.to.port,
        selected: selectedEdges.includes(c.id),
        data: { flag: flags.edges.has(c.id) ? ("error" as const) : undefined },
      })),
    [project.connections, selectedEdges, flags.edges],
  );

  const onNodesChange = useCallback((changes: NodeChange<BlockNodeT>[]) => {
    const st = useProject.getState();
    const pos: Record<string, { x: number; y: number }> = {};
    const removes: string[] = [];
    let sel = [...st.selectedNodes];
    let selChanged = false;
    for (const ch of changes) {
      if (ch.type === "position" && ch.position) pos[ch.id] = ch.position;
      else if (ch.type === "remove") removes.push(ch.id);
      else if (ch.type === "select") {
        selChanged = true;
        sel = ch.selected ? [...new Set([...sel, ch.id])] : sel.filter((x) => x !== ch.id);
      }
    }
    if (Object.keys(pos).length) st.movePositions(pos);
    if (removes.length) st.deleteComponents(removes);
    else if (selChanged) st.select(sel, sel.length ? [] : st.selectedEdges);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<WireEdgeT>[]) => {
    const st = useProject.getState();
    const removes: string[] = [];
    let sel = [...st.selectedEdges];
    let selChanged = false;
    for (const ch of changes) {
      if (ch.type === "remove") removes.push(ch.id);
      else if (ch.type === "select") {
        selChanged = true;
        sel = ch.selected ? [...new Set([...sel, ch.id])] : sel.filter((x) => x !== ch.id);
      }
    }
    if (removes.length) st.deleteConnections(removes);
    else if (selChanged) st.select(sel.length ? [] : st.selectedNodes, sel);
  }, []);

  const portOf = useCallback((comp: string, port: string) => {
    const c = useProject.getState().project.components.find((x) => x.id === comp);
    const d = c && getDef(c.type);
    if (!c || !d) return null;
    const p = portsOf(d, c.params).find((x) => x.name === port);
    return p ? { p, owner: c.label ?? d.label } : null;
  }, []);

  const isValid = useCallback(
    (c: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }) => {
      if (!c.sourceHandle || !c.targetHandle) return false;
      const a = portOf(c.source, c.sourceHandle),
        b = portOf(c.target, c.targetHandle);
      if (!a || !b) return false;
      if (!checkPortPair(a.p, a.owner, b.p, b.owner).ok) return false;
      const conns = useProject.getState().project.connections;
      const inTarget = a.p.dir === "in" ? { comp: c.source, port: c.sourceHandle } : b.p.dir === "in" ? { comp: c.target, port: c.targetHandle } : null;
      if (inTarget && conns.some((w) => w.to.component === inTarget.comp && w.to.port === inTarget.port)) return false;
      return true;
    },
    [portOf],
  );

  const onConnect = useCallback((c: RFConnection) => {
    if (!c.sourceHandle || !c.targetHandle) return;
    useProject.getState().connect({ component: c.source, port: c.sourceHandle }, { component: c.target, port: c.targetHandle });
  }, []);

  // Solta o fio sobre uma porta incompatível: explica por quê.
  const onConnectEnd: OnConnectEnd = useCallback((_e, state) => {
    if (state.isValid === false && state.fromHandle && state.toHandle) {
      const from = { component: state.fromNode!.id, port: state.fromHandle.id! };
      const to = { component: state.toNode!.id, port: state.toHandle.id! };
      useProject.getState().connect(from, to);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/ufci-type");
      if (!type) return;
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useProject.getState().addComponent(type, { x: Math.round((p.x - 40) / 20) * 20, y: Math.round((p.y - 25) / 20) * 20 });
    },
    [rf],
  );

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const st = useProject.getState();
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === "c") st.copy();
      else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        st.paste();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        st.select(st.project.components.map((c) => c.id), []);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Enquadra a vista quando um projeto novo é carregado (exemplo, arquivo, novo).
  useEffect(
    () =>
      onProjectEvent((e) => {
        if (e.kind === "replace") setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1.1, duration: 250 }), 60);
      }),
    [rf],
  );

  // Enquadra ao carregar um projeto novo.
  const firstCount = useRef(project.components.length);
  useEffect(() => {
    if (firstCount.current > 0) setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1.2 }), 50);
  }, [rf]);

  const empty = project.components.length === 0;

  return (
    <div className="canvas-wrap" ref={wrapper} onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))} onDrop={onDrop}>
      <Markers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValid}
        onNodeDragStart={() => useProject.getState().pushHistory()}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={snap}
        snapGrid={[20, 20]}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionOnDrag={tool === "select"}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === "pan" ? true : [1, 2]}
        panOnScroll={false}
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "wire" }}
        defaultViewport={{ x: 40, y: 40, zoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#b9c6da" />
        <MiniMap pannable zoomable className="minimap" maskColor="rgba(15,26,46,0.12)" nodeColor="#7f93b2" />
      </ReactFlow>
      <CanvasToolbar />
      <DiagnosticsPanel />
      {empty && (
        <div className="empty-hint">
          <h2>Comece o seu sistema</h2>
          <p>Arraste um componente da biblioteca para cá e ligue as portas com fios. Ou abra um exemplo pronto:</p>
          <div className="empty-actions">
            {EXAMPLES.map((ex) => (
              <button key={ex.id} className="btn" onClick={() => useProject.getState().replaceProject(ex.make())}>
                {ex.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <Notice />
    </div>
  );
}

function Notice() {
  const notice = useProject((s) => s.notice);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!notice) return;
    if (clear.current) clearTimeout(clear.current);
    clear.current = setTimeout(() => useProject.setState({ notice: null }), 7000);
    return () => {
      if (clear.current) clearTimeout(clear.current);
    };
  }, [notice]);
  if (!notice) return null;
  return (
    <div className="toast" role="alert" onClick={() => useProject.setState({ notice: null })}>
      {notice.text}
    </div>
  );
}

/** Precisa estar dentro de um ReactFlowProvider (o App fornece). */
export function Canvas() {
  return <Inner />;
}

/** Usado pela biblioteca para adicionar no centro da área visível. */
export function useAddAtCenter() {
  const rf = useReactFlow();
  return (type: string) => {
    const el = document.querySelector(".canvas-wrap") as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    const p = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 });
    const jitter = (useProject.getState().project.components.length % 5) * 20;
    useProject.getState().addComponent(type, { x: Math.round((p.x - 40) / 20) * 20 + jitter, y: Math.round((p.y - 25) / 20) * 20 + jitter });
  };
}
