import { Fragment, useEffect, useRef, useState } from "react";
import { ask, check, greet, runAction, useAssist } from "../assistant";
import { useUi } from "../ui";
import { texHtml } from "./Tex";
import { Icon } from "./Icon";

const CHIPS = ["Como começo um circuito?", "Como medir ganho e fase?", "Onde vejo o resultado?", "O que esse circuito faz?", "Como crio uma conta?"];

/** Texto simples com **negrito**, `código` e matemática $...$ . */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\$[^$\n]+\$|\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("$") && p.endsWith("$") && p.length > 2) return <span key={i} dangerouslySetInnerHTML={{ __html: texHtml(p.slice(1, -1), false) }} />;
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Rich({ text }: { text: string }) {
  // blocos $$...$$ viram equações em linha própria
  const chunks = text.split(/(\$\$[\s\S]+?\$\$)/g);
  return (
    <>
      {chunks.map((c, ci) => {
        if (c.startsWith("$$") && c.endsWith("$$") && c.length > 4) return <div key={ci} className="chat-eq" dangerouslySetInnerHTML={{ __html: texHtml(c.slice(2, -2), true) }} />;
        const lines = c.split("\n");
        const out: React.ReactNode[] = [];
        let list: string[] = [];
        let ordered = false;
        const flush = () => {
          if (!list.length) return;
          const items = list.map((l, i) => (
            <li key={i}>
              <Inline text={l} />
            </li>
          ));
          out.push(ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
          list = [];
        };
        for (const raw of lines) {
          const l = raw.trimEnd();
          const bullet = /^\s*[-*•]\s+(.*)$/.exec(l);
          const num = /^\s*\d+[.)]\s+(.*)$/.exec(l);
          if (bullet || num) {
            const isOrd = !!num;
            if (list.length && isOrd !== ordered) flush();
            ordered = isOrd;
            list.push((bullet ?? num)![1]);
          } else {
            flush();
            if (l.trim()) {
              out.push(
                <p key={out.length}>
                  <Inline text={l.replace(/^#+\s*/, "")} />
                </p>,
              );
            }
          }
        }
        flush();
        return <Fragment key={ci}>{out}</Fragment>;
      })}
    </>
  );
}

export default function AssistantPanel() {
  const open = useAssist((s) => s.open);
  const setOpen = useAssist((s) => s.setOpen);
  const messages = useAssist((s) => s.messages);
  const busy = useAssist((s) => s.busy);
  const needLogin = useAssist((s) => s.needLogin);
  const clear = useAssist((s) => s.clear);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) greet();
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);

  if (!open) return null;

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    void ask(q);
  };

  return (
    <aside className="assist" role="dialog" aria-label="Assistente">
      <div className="assist-head">
        <div>
          <h2>Assistente</h2>
          <span className="muted">Tira dúvidas e confere sua montagem</span>
        </div>
        <div className="assist-head-actions">
          {messages.length > 0 && (
            <button className="btn" onClick={clear} title="Limpar a conversa">
              Limpar
            </button>
          )}
          <button className="btn icon" aria-label="Fechar o assistente" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
      </div>

      <div className="assist-body">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role === "user" ? "me" : "bot"}${m.local ? " local" : ""}`}>
            {m.role === "user" ? m.text : <Rich text={m.text} />}
            {m.actions && m.actions.length > 0 && (
              <div className="chat-actions">
                {m.actions.map((a, k) => (
                  <button key={k} className={`btn${k === 0 ? " primary" : ""}`} disabled={busy} onClick={() => runAction(a)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="chat-msg bot typing">Pensando…</div>}
        {needLogin && (
          <button
            className="btn primary"
            onClick={() => {
              useUi.getState().setCloudOpen(true);
            }}
          >
            Entrar na conta
          </button>
        )}
        <div ref={end} />
      </div>

      <div className="assist-foot">
        <div className="assist-chips">
          <button className="chip-btn" disabled={busy} onClick={() => void check()}>
            Verificar montagem
          </button>
          {CHIPS.map((c) => (
            <button key={c} className="chip-btn" disabled={busy} onClick={() => void ask(c)}>
              {c}
            </button>
          ))}
        </div>
        <form
          className="assist-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            value={text}
            rows={1}
            maxLength={1500}
            placeholder="Pergunte ou peça: monte um filtro RC de 1 kHz…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" type="submit" disabled={busy || !text.trim()} aria-label="Enviar">
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}
