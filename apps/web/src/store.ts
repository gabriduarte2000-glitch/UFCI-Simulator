import { create } from "zustand";
import {
  checkPortPair,
  emptyProject,
  getDef,
  newComponent,
  nextId,
  parseProject,
  portsOf,
  type ParamOrigin,
  type ProjectIR,
  type SimConfig,
} from "@ufci/engine";

export type ProjectEvent =
  | { kind: "replace" }
  | { kind: "structure" }
  | { kind: "simconfig" }
  | { kind: "param"; compId: string; key: string; value: number | boolean | string };

type Listener = (e: ProjectEvent) => void;
const listeners = new Set<Listener>();
export const onProjectEvent = (l: Listener) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const emit = (e: ProjectEvent) => listeners.forEach((l) => l(e));

const STORAGE_KEY = "ufci:project:v1";
const HISTORY_LIMIT = 100;

interface ClipboardData {
  components: ProjectIR["components"];
  connections: ProjectIR["connections"];
  positions: Record<string, { x: number; y: number }>;
}

interface State {
  project: ProjectIR;
  selectedNodes: string[];
  selectedEdges: string[];
  past: ProjectIR[];
  future: ProjectIR[];
  clipboard: ClipboardData | null;
  /** Mensagem curta de retorno ao usuário (aviso de conexão recusada etc.). */
  notice: { id: number; text: string } | null;
  lastParamEdit: { key: string; at: number } | null;

  setNotice(text: string): void;
  select(nodes: string[], edges: string[]): void;
  newProject(): void;
  replaceProject(p: ProjectIR): void;
  openFromText(text: string): string | null;
  setName(name: string): void;
  addComponent(type: string, pos: { x: number; y: number }): string | null;
  pushHistory(): void;
  movePositions(pos: Record<string, { x: number; y: number }>): void;
  deleteSelection(): void;
  deleteComponents(ids: string[]): void;
  deleteConnections(ids: string[]): void;
  connect(from: { component: string; port: string }, to: { component: string; port: string }): boolean;
  setParam(compId: string, key: string, value: number | boolean | string): void;
  setParamOrigin(compId: string, key: string, origin: ParamOrigin): void;
  setLabel(compId: string, label: string): void;
  setSim(patch: Partial<SimConfig>): void;
  undo(): void;
  redo(): void;
  copy(): void;
  paste(): void;
}

const clone = <T,>(v: T): T => structuredClone(v);

function load(): ProjectIR {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const r = parseProject(JSON.parse(raw));
      if (r.ok) return r.project;
    }
  } catch {
    /* armazenamento indisponível */
  }
  return emptyProject();
}

let noticeId = 0;

export const useProject = create<State>((set, get) => {
  const commit = (mutate: (p: ProjectIR) => void, ev: ProjectEvent | null, history = true) => {
    const cur = get().project;
    const next = clone(cur);
    mutate(next);
    next.meta.updatedAt = new Date().toISOString();
    set((s) => ({
      project: next,
      past: history ? [...s.past.slice(-HISTORY_LIMIT + 1), cur] : s.past,
      future: history ? [] : s.future,
    }));
    if (ev) emit(ev);
  };

  return {
    project: load(),
    selectedNodes: [],
    selectedEdges: [],
    past: [],
    future: [],
    clipboard: null,
    notice: null,
    lastParamEdit: null,

    setNotice: (text) => set({ notice: { id: ++noticeId, text } }),
    select: (nodes, edges) => {
      const s = get();
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
      if (same(nodes, s.selectedNodes) && same(edges, s.selectedEdges)) return;
      set({ selectedNodes: nodes, selectedEdges: edges });
    },

    newProject: () => {
      set({ project: emptyProject(), past: [], future: [], selectedNodes: [], selectedEdges: [] });
      emit({ kind: "replace" });
    },
    replaceProject: (p) => {
      set({ project: p, past: [], future: [], selectedNodes: [], selectedEdges: [] });
      emit({ kind: "replace" });
    },
    openFromText: (text) => {
      try {
        const r = parseProject(JSON.parse(text));
        if (!r.ok) return r.error;
        get().replaceProject(r.project);
        return null;
      } catch {
        return "O arquivo não é um JSON válido.";
      }
    },
    setName: (name) => commit((p) => void (p.meta.name = name), null),

    addComponent: (type, pos) => {
      const def = getDef(type);
      if (!def) return null;
      const id = nextId(get().project.components.map((c) => c.id), def.type.split(".")[1] + "_");
      const count = get().project.components.filter((c) => c.type === type).length;
      const label = count === 0 ? def.labelPrefix : `${def.labelPrefix} ${count + 1}`;
      commit((p) => {
        p.components.push(newComponent(type, id, label));
        p.layout = p.layout ?? { positions: {} };
        p.layout.positions[id] = pos;
      }, { kind: "structure" });
      set({ selectedNodes: [id], selectedEdges: [] });
      return id;
    },

    pushHistory: () => set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), clone(s.project)], future: [] })),

    movePositions: (pos) => {
      set((s) => {
        const next = { ...s.project, layout: { positions: { ...(s.project.layout?.positions ?? {}), ...pos } } };
        return { project: next };
      });
    },

    deleteSelection: () => {
      const { selectedNodes, selectedEdges } = get();
      if (selectedNodes.length) get().deleteComponents(selectedNodes);
      else if (selectedEdges.length) get().deleteConnections(selectedEdges);
    },
    deleteComponents: (ids) => {
      if (!ids.length) return;
      const set_ = new Set(ids);
      commit((p) => {
        p.components = p.components.filter((c) => !set_.has(c.id));
        p.connections = p.connections.filter((c) => !set_.has(c.from.component) && !set_.has(c.to.component));
        for (const id of ids) delete p.layout?.positions[id];
      }, { kind: "structure" });
      set({ selectedNodes: [], selectedEdges: [] });
    },
    deleteConnections: (ids) => {
      const existing = new Set(get().project.connections.map((c) => c.id));
      ids = ids.filter((id) => existing.has(id));
      if (!ids.length) return;
      const set_ = new Set(ids);
      commit((p) => void (p.connections = p.connections.filter((c) => !set_.has(c.id))), { kind: "structure" });
      set({ selectedEdges: [] });
    },

    connect: (from, to) => {
      const p = get().project;
      const a = p.components.find((c) => c.id === from.component);
      const b = p.components.find((c) => c.id === to.component);
      if (!a || !b) return false;
      const da = getDef(a.type),
        db = getDef(b.type);
      if (!da || !db) return false;
      const pa = portsOf(da, a.params).find((x) => x.name === from.port);
      const pb = portsOf(db, b.params).find((x) => x.name === to.port);
      if (!pa || !pb) return false;
      if (from.component === to.component && pa.dir !== "phys") {
        /* laço de um bloco nele mesmo é permitido se houver integrador; o compilador decide */
      }
      const chk = checkPortPair(pa, a.label ?? da.label, pb, b.label ?? db.label);
      if (!chk.ok) {
        get().setNotice(chk.message);
        return false;
      }
      // Normaliza: saída → entrada.
      let f = from,
        t = to;
      if (pa.dir === "in" && pb.dir === "out") [f, t] = [to, from];
      const target = pa.dir === "in" ? from : pb.dir === "in" ? to : null;
      if (target && p.connections.some((c) => c.to.component === target.component && c.to.port === target.port)) {
        get().setNotice("Esta entrada já recebe um sinal. Uma entrada recebe um sinal só. Para combinar sinais, use um somador.");
        return false;
      }
      if (p.connections.some((c) => c.from.component === f.component && c.from.port === f.port && c.to.component === t.component && c.to.port === t.port)) return false;
      commit((pp) => {
        pp.connections.push({ id: nextId(pp.connections.map((c) => c.id), "w"), from: f, to: t });
      }, { kind: "structure" });
      return true;
    },

    setParam: (compId, key, value) => {
      const s = get();
      const def = getDef(s.project.components.find((c) => c.id === compId)?.type ?? "");
      const pd = def?.params.find((x) => x.key === key);
      const now = Date.now();
      const tag = `${compId}.${key}`;
      const coalesce = s.lastParamEdit && s.lastParamEdit.key === tag && now - s.lastParamEdit.at < 1500;
      commit((p) => {
        const c = p.components.find((x) => x.id === compId);
        if (!c) return;
        c.params[key] = { ...(c.params[key] ?? { unit: pd?.unit }), value };
      }, null, !coalesce);
      set({ lastParamEdit: { key: tag, at: now } });
      // Mudança estrutural recompõe as portas; a mudança comum segue ao vivo.
      emit(pd?.structural ? { kind: "structure" } : { kind: "param", compId, key, value });
    },
    setParamOrigin: (compId, key, origin) =>
      commit((p) => {
        const c = p.components.find((x) => x.id === compId);
        if (c && c.params[key]) c.params[key] = { ...c.params[key], origin };
      }, null, false),
    setLabel: (compId, label) =>
      commit((p) => {
        const c = p.components.find((x) => x.id === compId);
        if (c) c.label = label;
      }, null),

    setSim: (patch) => commit((p) => void (p.simulation = { ...p.simulation, ...patch }), { kind: "simconfig" }),

    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selectedNodes: [], selectedEdges: [] });
      emit({ kind: "replace" });
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length) return;
      const nxt = future[0];
      set({ project: nxt, past: [...past, project], future: future.slice(1), selectedNodes: [], selectedEdges: [] });
      emit({ kind: "replace" });
    },

    copy: () => {
      const { project, selectedNodes } = get();
      if (!selectedNodes.length) return;
      const ids = new Set(selectedNodes);
      set({
        clipboard: {
          components: clone(project.components.filter((c) => ids.has(c.id))),
          connections: clone(project.connections.filter((c) => ids.has(c.from.component) && ids.has(c.to.component))),
          positions: clone(Object.fromEntries(selectedNodes.map((id) => [id, project.layout?.positions[id] ?? { x: 0, y: 0 }]))),
        },
      });
    },
    paste: () => {
      const cb = get().clipboard;
      if (!cb) return;
      const newIds: string[] = [];
      commit((p) => {
        const map = new Map<string, string>();
        for (const c of cb.components) {
          const prefix = c.type.split(".")[1] + "_";
          const id = nextId([...p.components.map((x) => x.id), ...map.values()], prefix);
          map.set(c.id, id);
          p.components.push({ ...clone(c), id });
          const pos = cb.positions[c.id];
          p.layout = p.layout ?? { positions: {} };
          p.layout.positions[id] = { x: pos.x + 40, y: pos.y + 40 };
          newIds.push(id);
        }
        for (const w of cb.connections) {
          p.connections.push({
            id: nextId(p.connections.map((x) => x.id), "w"),
            from: { component: map.get(w.from.component)!, port: w.from.port },
            to: { component: map.get(w.to.component)!, port: w.to.port },
          });
        }
      }, { kind: "structure" });
      // Deslocamento acumulado para colagens seguidas.
      set((s) => ({
        selectedNodes: newIds,
        selectedEdges: [],
        clipboard: s.clipboard && {
          ...s.clipboard,
          positions: Object.fromEntries(Object.entries(s.clipboard.positions).map(([k, v]) => [k, { x: v.x + 40, y: v.y + 40 }])),
        },
      }));
    },
  };
});

// Autosave.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useProject.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s.project));
    } catch {
      /* sem armazenamento: o usuário ainda pode salvar o arquivo */
    }
  }, 400);
});
