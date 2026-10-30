// Projetos na nuvem (Supabase). A chave publishable é pública por projeto: a segurança vem das regras de linha (RLS) do banco.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "https://rdosnolxpnwntaczgage.supabase.co";
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_yriKLJlduglO5MZFjkjgKg_AB7iO9Hi";

let client: Promise<SupabaseClient> | null = null;

/** Carrega a biblioteca só quando o usuário abre a janela da nuvem. */
export function getClient(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  );
  return client;
}

export interface CloudProject {
  id: string;
  name: string;
  updated_at: string;
}

const MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme o e-mail pelo link que enviamos antes de entrar."],
  [/user already registered/i, "Esse e-mail já tem conta. Use Entrar."],
  [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
  [/unable to validate email|invalid format/i, "O e-mail não parece válido."],
  [/rate limit|too many/i, "Muitas tentativas. Espere alguns minutos."],
  [/failed to fetch|networkerror|load failed/i, "Sem conexão com a nuvem. Confira a internet."],
  [/relation .* does not exist|could not find the table|schema cache/i, "A tabela de projetos ainda não existe no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor."],
  [/row-level security/i, "Sem permissão para salvar. Entre na conta de novo."],
];

export function cloudError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return MESSAGES.find(([r]) => r.test(m))?.[1] ?? `Erro da nuvem: ${m}`;
}
