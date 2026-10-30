// Estado e chamadas do assistente. A conversa fica só na memória da aba.

import { create } from "zustand";
import { catalogText, compile, describeProject, lintProject } from "@ufci/engine";
import { cloudError, getClient } from "./cloud";
import { useProject } from "./store";
import { useUi } from "./ui";

export interface ChatMsg {
  role: "user" | "model";
  text: string;
  /** Resposta calculada no navegador, sem IA. */
  local?: boolean;
}

interface AssistState {
  open: boolean;
  messages: ChatMsg[];
  busy: boolean;
  needLogin: boolean;
  setOpen(v: boolean): void;
  clear(): void;
}

export const useAssist = create<AssistState>((set) => ({
  open: false,
  messages: [],
  busy: false,
  needLogin: false,
  setOpen: (open) => set({ open }),
  clear: () => set({ messages: [], needLogin: false }),
}));

const PAGE_NAMES: Record<string, string> = { montagem: "Montagem", dashboard: "Dashboard", graficos: "Gráficos", tabelas: "Tabelas", indicadores: "Indicadores", math: "Matemática" };

const push = (m: ChatMsg) => useAssist.setState((s) => ({ messages: [...s.messages, m] }));

/** Resumo dos erros e avisos, calculado no navegador. */
export function localCheck(): string {
  const p = useProject.getState().project;
  if (p.components.filter((c) => c.type !== "note.text").length === 0) return "O quadro está vazio. Arraste componentes da Biblioteca ou abra uma situação pronta na aba Situações.";
  const diags = [...compile(p).diagnostics, ...lintProject(p)].filter((d) => d.code !== "empty");
  if (!diags.length) return "Não encontrei erros nem avisos na montagem. Clique em Simular para ver o resultado.";
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const label = { error: "Erro", warning: "Atenção", info: "Dica" } as const;
  return ["Encontrei isto na sua montagem:", ...diags.sort((a, b) => rank[a.severity] - rank[b.severity]).map((d) => `- **${label[d.severity]}:** ${d.message}`)].join("\n");
}

async function hasSession(): Promise<boolean> {
  try {
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/** Chama a função de servidor. Devolve o texto ou lança uma mensagem pronta para o usuário. */
async function invoke(history: { role: "user" | "model"; text: string }[]): Promise<string> {
  const sb = await getClient();
  const project = `Aba aberta: ${PAGE_NAMES[useUi.getState().page] ?? useUi.getState().page}.\n${describeProject(useProject.getState().project)}`;
  const { data, error } = await sb.functions.invoke("assistente", { body: { messages: history, project, catalog: catalogText() } });
  if (error) {
    let msg = cloudError(error);
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) msg = String(j.error);
      } catch {
        /* mantém a mensagem genérica */
      }
    }
    throw new Error(msg);
  }
  return String(data?.text ?? "Sem resposta.");
}

async function run(history: { role: "user" | "model"; text: string }[]): Promise<void> {
  useAssist.setState({ busy: true });
  try {
    push({ role: "model", text: await invoke(history) });
  } catch (e) {
    push({ role: "model", text: e instanceof Error ? e.message : cloudError(e), local: true });
  } finally {
    useAssist.setState({ busy: false });
  }
}

export async function ask(text: string): Promise<void> {
  const q = text.trim();
  if (!q || useAssist.getState().busy) return;
  push({ role: "user", text: q });
  if (!(await hasSession())) {
    useAssist.setState({ needLogin: true });
    push({ role: "model", text: "Para conversar com o assistente você precisa entrar na sua conta. O botão Verificar montagem funciona sem conta.", local: true });
    return;
  }
  useAssist.setState({ needLogin: false });
  await run(useAssist.getState().messages.filter((m) => !m.local).map((m) => ({ role: m.role, text: m.text })));
}

/** Verifica no navegador e, se houver conta, pede ao assistente que explique. */
export async function check(): Promise<void> {
  if (useAssist.getState().busy) return;
  push({ role: "user", text: "Verificar minha montagem" });
  push({ role: "model", text: localCheck(), local: true });
  const empty = useProject.getState().project.components.filter((c) => c.type !== "note.text").length === 0;
  if (empty || !(await hasSession())) return;
  await run([{ role: "user", text: "Verifique a minha montagem. Explique cada aviso em palavras simples, diga como corrigir e aponte qualquer problema de lógica que o simulador não detecta." }]);
}
