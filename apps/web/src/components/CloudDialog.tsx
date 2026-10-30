import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudError, getClient, type CloudProject } from "../cloud";
import { useProject } from "../store";
import { useUi } from "../ui";
import { projectToFile } from "../util";

const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function CloudDialog() {
  const open = useUi((s) => s.cloudOpen);
  const setOpen = useUi((s) => s.setCloudOpen);
  const cloudId = useUi((s) => s.cloudId);
  const setCloudId = useUi((s) => s.setCloudId);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [list, setList] = useState<CloudProject[]>([]);
  const first = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const sb = await getClient();
      const { data, error } = await sb.from("projects").select("id,name,updated_at").order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      setList(data ?? []);
    } catch (e) {
      setMsg({ kind: "err", text: cloudError(e) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let off = () => {};
    let alive = true;
    setMsg(null);
    void getClient()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession();
        if (!alive) return;
        setSession(data.session);
        setReady(true);
        const sub = sb.auth.onAuthStateChange((_e, s) => setSession(s));
        off = () => sub.data.subscription.unsubscribe();
      })
      .catch((e) => {
        setReady(true);
        setMsg({ kind: "err", text: cloudError(e) });
      });
    return () => {
      alive = false;
      off();
    };
  }, [open]);

  useEffect(() => {
    if (open && session) void refresh();
  }, [open, session, refresh]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "err", text: cloudError(e) });
    } finally {
      setBusy(false);
    }
  };

  const auth = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const sb = await getClient();
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
        setPass("");
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pass, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setPass("");
        if (!data.session) setMsg({ kind: "ok", text: "Conta criada. Abra o e-mail que enviamos e confirme o link; depois volte e use Entrar." });
      }
    });
  };

  const save = (asNew: boolean) =>
    void run(async () => {
      const sb = await getClient();
      const p = useProject.getState().project;
      const data = JSON.parse(projectToFile(p));
      if (cloudId && !asNew) {
        const { data: rows, error } = await sb.from("projects").update({ name: p.meta.name, data }).eq("id", cloudId).select("id");
        if (error) throw error;
        if (!rows?.length) {
          setCloudId(null);
          throw new Error("Esse projeto não existe mais na nuvem. Use Salvar como novo.");
        }
        setMsg({ kind: "ok", text: "Projeto atualizado na nuvem." });
      } else {
        const { data: row, error } = await sb.from("projects").insert({ name: p.meta.name, data }).select("id").single();
        if (error) throw error;
        setCloudId(row.id);
        setMsg({ kind: "ok", text: "Projeto salvo na nuvem." });
      }
      await refresh();
    });

  const load = (id: string) =>
    void run(async () => {
      const st = useProject.getState();
      if (st.project.components.length > 0 && !window.confirm("Abrir no lugar do projeto atual? Salve o atual antes se quiser guardá-lo.")) return;
      const sb = await getClient();
      const { data, error } = await sb.from("projects").select("data").eq("id", id).single();
      if (error) throw error;
      const err = st.openFromText(JSON.stringify(data.data));
      if (err) throw new Error(err);
      setCloudId(id);
      useUi.getState().setPage("montagem");
      st.setNotice("Projeto aberto da nuvem.");
      setOpen(false);
    });

  const remove = (p: CloudProject) => {
    if (!window.confirm(`Excluir "${p.name}" da nuvem? Não dá para desfazer.`)) return;
    void run(async () => {
      const sb = await getClient();
      const { error } = await sb.from("projects").delete().eq("id", p.id);
      if (error) throw error;
      if (cloudId === p.id) setCloudId(null);
      await refresh();
    });
  };

  const logout = () =>
    void run(async () => {
      const sb = await getClient();
      await sb.auth.signOut();
      setList([]);
      setCloudId(null);
    });

  return (
    <div className="cloud-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cloud-dialog" role="dialog" aria-modal="true" aria-label="Projetos na nuvem">
        <div className="cloud-head">
          <h2>Projetos na nuvem</h2>
          <button className="btn icon" aria-label="Fechar" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>

        {!ready && <p className="muted">Conectando…</p>}

        {ready && !session && (
          <form className="cloud-form" onSubmit={auth}>
            <p className="muted">Entre para guardar seus projetos e abri-los em qualquer aparelho. Sem conta, o simulador continua funcionando e você pode salvar em arquivo.</p>
            <div className="seg small">
              <button type="button" className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>
                Entrar
              </button>
              <button type="button" className={mode === "up" ? "on" : ""} onClick={() => setMode("up")}>
                Criar conta
              </button>
            </div>
            <label className="synth-field">
              <span>E-mail</span>
              <input ref={first} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="synth-field">
              <span>Senha</span>
              <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        )}

        {ready && session && (
          <>
            <div className="cloud-user">
              <span className="muted">{session.user.email}</span>
              <button className="link-btn" onClick={logout}>
                Sair
              </button>
            </div>
            <div className="cloud-actions">
              {cloudId && (
                <button className="btn primary" disabled={busy} onClick={() => save(false)}>
                  Atualizar na nuvem
                </button>
              )}
              <button className={cloudId ? "btn" : "btn primary"} disabled={busy} onClick={() => save(true)}>
                Salvar como novo
              </button>
            </div>
            <h3 className="math-h3">Seus projetos</h3>
            {list.length === 0 ? (
              <p className="muted">Nenhum projeto salvo ainda.</p>
            ) : (
              <ul className="cloud-list">
                {list.map((p) => (
                  <li key={p.id} className={p.id === cloudId ? "on" : ""}>
                    <div>
                      <strong>{p.name}</strong>
                      <small className="muted">{fmtDate(p.updated_at)}{p.id === cloudId ? " · aberto" : ""}</small>
                    </div>
                    <button className="btn" disabled={busy} onClick={() => load(p.id)}>
                      Abrir
                    </button>
                    <button className="btn" disabled={busy} onClick={() => remove(p)} aria-label={`Excluir ${p.name}`}>
                      Excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {msg && (
          <div className={`synth-check ${msg.kind === "ok" ? "ok" : "bad"}`} role="status">
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
