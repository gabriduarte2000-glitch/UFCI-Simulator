// Estado e chamadas do assistente. A conversa fica só na memória da aba.
// O assistente propõe botões de ação; nada muda no projeto sem o usuário clicar.

import { create } from "zustand";
import {
  buildFromSpec,
  catalogText,
  compile,
  describeProject,
  lintProject,
  parseActions,
  parseEquation,
  patchProject,
  realizations,
  SITUATIONS,
  suggestFixes,
  synthesize,
  verifySynthesis,
  type ApplyResult,
  type AssistAction,
  type ProjectIR,
} from "@ufci/engine";
import { cloudError, getClient } from "./cloud";
import { useDiag } from "./diagnostics";
import { sim } from "./live";
import { useProject } from "./store";
import { isCompact, useUi } from "./ui";

export interface ChatMsg {
  role: "user" | "model";
  text: string;
  /** Resposta calculada no navegador, sem IA. */
  local?: boolean;
  actions?: AssistAction[];
}

interface AssistState {
  open: boolean;
  messages: ChatMsg[];
  busy: boolean;
  needLogin: boolean;
  greeted: boolean;
  setOpen(v: boolean): void;
  clear(): void;
}

export const useAssist = create<AssistState>((set) => ({
  open: false,
  messages: [],
  busy: false,
  needLogin: false,
  greeted: false,
  setOpen: (open) => set({ open }),
  clear: () => set({ messages: [], needLogin: false, greeted: false }),
}));

/** Há erro ou aviso na montagem: mostra um ponto no botão do assistente. */
export function useAssistAlert(): boolean {
  return useDiag((s) => s.list.some((d) => d.severity !== "info"));
}

const RUN: AssistAction = { type: "run", label: "Simular agora" };
const GRAFICOS: AssistAction = { type: "go", label: "Ver os gráficos", page: "graficos" };
const FREQ: AssistAction = { type: "go", label: "Medir ganho e fase", page: "math", tab: "frequencia" };
const EQUACAO: AssistAction = { type: "go", label: "Digitar uma equação", page: "math", tab: "equacao" };
const CONTA: AssistAction = { type: "open_cloud", label: "Criar conta ou entrar" };

const PAGE_NAMES: Record<string, string> = { montagem: "Montagem", dashboard: "Dashboard", graficos: "Gráficos", tabelas: "Tabelas", indicadores: "Indicadores", math: "Matemática" };

const push = (m: ChatMsg) => useAssist.setState((s) => ({ messages: [...s.messages, m] }));
const projectIsEmpty = () => useProject.getState().project.components.filter((c) => c.type !== "note.text").length === 0;

// ------------------------------------------------------------------------------------------------ verificação local

interface Check {
  text: string;
  actions: AssistAction[];
  problems: number;
}

export function localCheck(): Check {
  const p = useProject.getState().project;
  if (projectIsEmpty()) return { text: "O quadro está vazio.", actions: [], problems: 0 };
  const diags = [...compile(p).diagnostics, ...lintProject(p)].filter((d) => d.code !== "empty");
  const fixes = suggestFixes(p).slice(0, 3);
  const actions: AssistAction[] = fixes.map((f) => ({ type: "patch", label: f.label, ...f.patch }));
  if (!diags.length) return { text: "Não encontrei erros nem avisos na montagem.", actions, problems: 0 };
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const label = { error: "Erro", warning: "Atenção", info: "Dica" } as const;
  const text = ["Encontrei isto na sua montagem:", ...diags.sort((a, b) => rank[a.severity] - rank[b.severity]).map((d) => `- **${label[d.severity]}:** ${d.message}`)].join("\n");
  return { text, actions, problems: diags.length };
}

/** Primeira mensagem ao abrir: já olha a montagem e oferece o próximo passo. */
export function greet(): void {
  const st = useAssist.getState();
  if (st.greeted || st.messages.length) return;
  useAssist.setState({ greeted: true });
  if (projectIsEmpty()) {
    const rlc = SITUATIONS.find((s) => s.id === "rlc");
    push({
      role: "model",
      local: true,
      text: "Oi! Seu quadro está vazio. Posso montar um circuito para você: descreva o que quer, por exemplo **filtro RC passa-baixa de 1 kHz** ou **massa, mola e amortecedor**. Ou escolha um caminho:",
      actions: [
        ...(rlc ? ([{ type: "open_situation", label: "Abrir um circuito RLC pronto", situation: rlc.id }] as AssistAction[]) : []),
        EQUACAO,
        CONTA,
      ],
    });
    return;
  }
  const c = localCheck();
  if (c.problems) push({ role: "model", local: true, text: c.text, actions: [...c.actions, GRAFICOS].slice(0, 4) });
  else
    push({
      role: "model",
      local: true,
      text: "Oi! Olhei a sua montagem e não encontrei erros. Quer simular? Depois eu mostro onde ver o resultado. Também posso explicar o que o circuito faz ou como medir ganho e fase.",
      actions: [RUN, GRAFICOS, FREQ, ...c.actions].slice(0, 4),
    });
}

// ------------------------------------------------------------------------------------------------ execução dos botões

const leave = () => {
  if (isCompact()) useAssist.getState().setOpen(false);
};

/** Mostra no chat o que o simulador acha da montagem recém-feita e sugere o próximo passo. */
function followUp(intro: string): void {
  const c = localCheck();
  push({
    role: "model",
    local: true,
    text: `${intro}\n${c.problems ? c.text : "O simulador não encontrou erros."}`,
    actions: [RUN, GRAFICOS, ...c.actions].slice(0, 4),
  });
}

function showErrors(title: string, errors: string[]): void {
  push({ role: "model", local: true, text: [title, ...errors.slice(0, 6).map((e) => `- ${e}`)].join("\n") });
}

function applyBuilt(r: ApplyResult, what: string): boolean {
  if (!r.ok) {
    showErrors(`Não consegui montar (${what}). O que deu errado:`, r.errors);
    return false;
  }
  const st = useProject.getState();
  st.applyProject(r.ir);
  st.setNotice(`${what} montado no quadro. Para voltar ao que estava antes, use Desfazer (Ctrl+Z).`);
  useUi.getState().setPage("montagem");
  return true;
}

export function runAction(a: AssistAction): void {
  const ui = useUi.getState();
  switch (a.type) {
    case "go":
      ui.setPage(a.page);
      if (a.page === "math" && a.tab) ui.setMathTab(a.tab);
      leave();
      return;
    case "open_situation": {
      const s = SITUATIONS.find((x) => x.id === a.situation);
      if (!s) return showErrors("Não encontrei essa situação.", [a.situation]);
      const st = useProject.getState();
      st.applyProject(s.make());
      st.setNotice(`Situação aberta: ${s.title}. ${s.explore} (Desfazer: Ctrl+Z)`);
      ui.setPage("montagem");
      leave();
      push({ role: "model", local: true, text: `Abri "${s.title}". ${s.explore}`, actions: [RUN, GRAFICOS] });
      return;
    }
    case "build_equation": {
      const parsed = parseEquation(a.equation);
      if (!parsed.ok) return showErrors("Não consegui ler a equação:", [parsed.error]);
      const list = realizations(parsed.model);
      const pick = list.find((r) => r.id === a.realization && r.available) ?? list.find((r) => r.available && r.group !== "blocos") ?? list.find((r) => r.available && r.id === "integrators") ?? list.find((r) => r.available);
      if (!pick) return showErrors("Nenhuma montagem serve para essa equação.", list.map((r) => `${r.title}: ${r.why ?? ""}`));
      const s = synthesize(parsed.model, pick.id);
      const v = verifySynthesis(parsed.model, s);
      if (!applyBuilt({ ok: true, ir: s.ir }, pick.title)) return;
      leave();
      followUp(`Montei: ${pick.title}. ${v.ok ? "Conferi: a função de transferência do que foi montado é a mesma da equação." : v.message}`);
      return;
    }
    case "build_circuit": {
      const r = buildFromSpec(a, a.label.slice(0, 50));
      if (!applyBuilt(r, "O circuito")) return;
      leave();
      followUp("Montei o circuito no quadro. Os valores são ilustrativos: mude-os no painel de propriedades.");
      return;
    }
    case "patch": {
      const r: ApplyResult = patchProject(useProject.getState().project, a);
      if (!r.ok) return showErrors("Não consegui aplicar a correção:", r.errors);
      const st = useProject.getState();
      st.applyProject(r.ir);
      st.setNotice(`Aplicado: ${a.label}. Para desfazer, use Ctrl+Z.`);
      ui.setPage("montagem");
      leave();
      followUp(`Pronto: ${a.label}.`);
      return;
    }
    case "run":
      ui.setPage("montagem");
      sim.play();
      leave();
      return;
    case "open_cloud":
      ui.setCloudOpen(true);
      return;
  }
}

// ------------------------------------------------------------------------------------------------ conversa com a IA

async function hasSession(): Promise<boolean> {
  try {
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

interface Reply {
  text: string;
  actions: AssistAction[];
}

async function invoke(history: { role: "user" | "model"; text: string }[]): Promise<Reply> {
  const sb = await getClient();
  const project = `Aba aberta: ${PAGE_NAMES[useUi.getState().page] ?? useUi.getState().page}.\n${describeProject(useProject.getState().project)}`;
  const situations = SITUATIONS.map((s) => `${s.id}: ${s.title}`).join("\n");
  const { data, error } = await sb.functions.invoke("assistente", { body: { messages: history, project, catalog: catalogText(), situations } });
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
  return { text: String(data?.text ?? "Sem resposta."), actions: parseActions(data?.actions) };
}

async function run(history: { role: "user" | "model"; text: string }[]): Promise<void> {
  useAssist.setState({ busy: true });
  try {
    const r = await invoke(history);
    push({ role: "model", text: r.text, actions: r.actions });
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
    push({
      role: "model",
      local: true,
      text: "Para conversar com o assistente você precisa entrar na sua conta. Enquanto isso, o botão Verificar montagem funciona sem conta.",
      actions: [CONTA],
    });
    return;
  }
  useAssist.setState({ needLogin: false });
  await run(useAssist.getState().messages.filter((m) => !m.local).map((m) => ({ role: m.role, text: m.text })));
}

/** Verifica no navegador e, se houver conta, pede ao assistente que explique. */
export async function check(): Promise<void> {
  if (useAssist.getState().busy) return;
  push({ role: "user", text: "Verificar minha montagem" });
  const c = localCheck();
  push({ role: "model", local: true, text: c.text, actions: c.actions });
  if (projectIsEmpty() || !(await hasSession())) return;
  await run([{ role: "user", text: "Verifique a minha montagem. Explique cada aviso em palavras simples, diga como corrigir e aponte qualquer problema de lógica que o simulador não detecta." }]);
}

export type { ProjectIR };
