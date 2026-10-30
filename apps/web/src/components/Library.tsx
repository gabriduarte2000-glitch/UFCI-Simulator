import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { allDefs, CATEGORIES, defaultParams, GROUPS, norm, searchComponents, SITUATIONS, SITUATION_GROUPS, type ComponentDef, type GroupId } from "@ufci/engine";
import { loadSituation } from "../loadSituation";
import { isCompact, useUi } from "../ui";
import { useAddAtCenter } from "./Canvas";
import { Icon } from "./Icon";
import { nodeSize, SymbolArt } from "./Symbols";

function Mini({ def }: { def: ComponentDef }) {
  const params = useMemo(() => defaultParams(def.type), [def.type]);
  const { w, h } = nodeSize(def.symbol, params);
  return (
    <svg viewBox={`-3 -3 ${w + 6} ${h + 6}`} className="mini-symbol" aria-hidden="true">
      <SymbolArt symbol={def.symbol} params={params} w={w} h={h} />
    </svg>
  );
}

const STORE = "ufci-lib-open";
const loadOpen = (): Record<string, boolean> => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (v && typeof v === "object") return v;
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return { signals: true };
};

/** Destaca no texto as palavras digitadas. */
function Mark({ text, q }: { text: string; q: string }) {
  const toks = norm(q).split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  if (!toks.length) return <>{text}</>;
  const n = norm(text);
  const spans: [number, number][] = [];
  for (const t of toks) {
    const i = n.indexOf(t);
    if (i >= 0) spans.push([i, i + t.length]);
  }
  if (!spans.length) return <>{text}</>;
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], k) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(<mark key={k}>{text.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

const SUGGEST = ["filtro", "PID", "motor", "diodo", "contador", "discreto", "ruído", "transistor"];


export function Library() {
  const [tab, setTab] = useState<"comp" | "sit">("comp");
  const setLeftOpen = useUi((s) => s.setLeftOpen);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const [closedCat, setClosedCat] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const add = useAddAtCenter();
  const defs = useMemo(() => allDefs(), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(open));
    } catch {
      /* ignora */
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [q]);

  const searching = q.trim().length > 0;
  const result = useMemo(() => (searching && tab === "comp" ? searchComponents(q) : null), [q, searching, tab]);

  const addDef = (d: ComponentDef) => {
    add(d.type);
    if (isCompact()) setLeftOpen(false);
  };

  const item = (d: ComponentDef) => (
    <button
      key={d.type}
      className="lib-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/ufci-type", d.type);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => addDef(d)}
      title={`${d.description}\nArraste para a área de trabalho ou clique para adicionar.`}
    >
      <Mini def={d} />
      <span>
        <Mark text={d.label} q={q} />
      </span>
    </button>
  );

  const catOf = (d: ComponentDef) => CATEGORIES.find((c) => c.id === d.category);
  const groupLabel = (id?: GroupId) => GROUPS.find((g) => g.id === id)?.label ?? "";

  const needle = norm(q.trim());
  const sits = SITUATIONS.filter((x) => !needle || norm(`${x.title} ${x.description} ${x.explore}`).includes(needle));

  return (
    <aside className="library" aria-label="Biblioteca de componentes">
      <div className="tabs">
        <button className={tab === "comp" ? "on" : ""} onClick={() => setTab("comp")}>
          Componentes
        </button>
        <button className={tab === "sit" ? "on" : ""} onClick={() => setTab("sit")}>
          Situações
        </button>
        <button className="collapse-btn" onClick={() => setLeftOpen(false)} title="Recolher a biblioteca" aria-label="Recolher a biblioteca">
          <Icon name="panelLeft" />
        </button>
      </div>

      <div className="search-wrap">
        <label className="search">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
              if (e.key === "Enter" && result?.hits[0]) addDef(result.hits[0]);
            }}
            placeholder={tab === "comp" ? "Buscar: filtro, PID, motor, diodo…" : "Buscar situação…"}
            aria-label={tab === "comp" ? "Buscar componente" : "Buscar situação"}
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {q && (
            <button
              className="search-x"
              aria-label="Limpar a busca"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        {tab === "comp" && !searching && (
          <div className="sugg" aria-label="Sugestões de busca">
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {result && (
          <div className="search-meta" role="status">
            {result.hits.length === 0 ? "Nenhum componente encontrado" : `${result.hits.length} ${result.hits.length === 1 ? "resultado" : "resultados"}${result.approximate ? " (busca aproximada)" : ""}`}
            {result.hits.length > 0 && <span className="muted"> · Enter adiciona o primeiro</span>}
          </div>
        )}
      </div>

      {tab === "comp" ? (
        <>
          <div className="lib-scroll" ref={scrollRef}>
            {result ? (
              <>
                {result.hits.length > 0 && <div className="lib-grid">{result.hits.map(item)}</div>}
                {result.hits.length === 0 && result.upcoming.length === 0 && (
                  <div className="lib-empty">
                    <strong>Não achei “{q.trim()}”.</strong>
                    <span>Tente outra palavra, o nome em inglês ou o que o componente faz (ex.: “passa baixa”, “conversor”, “atraso”).</span>
                    <div className="sugg">
                      {SUGGEST.map((s) => (
                        <button key={s} onClick={() => setQ(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {result.upcoming.length > 0 && (
                  <div className="lib-soon">
                    <h4>Ainda não disponível</h4>
                    {result.hits.length === 0 && <p className="muted">Esse item está no plano, mas a plataforma ainda não tem. Dá para montar parte dele com os blocos acima.</p>}
                    <ul>
                      {result.upcoming.slice(0, 6).map((u) => (
                        <li key={u.label}>
                          <span>{u.label}</span>
                          <em>{u.group} · em breve</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              GROUPS.map((g) => {
                const cats = CATEGORIES.filter((c) => c.available && c.group === g.id)
                  .map((c) => ({ c, items: defs.filter((d) => d.category === c.id) }))
                  .filter((x) => x.items.length > 0);
                const total = cats.reduce((n, x) => n + x.items.length, 0);
                if (!total) return null;
                const isOpen = !!open[g.id];
                return (
                  <section key={g.id} className={`lib-block${isOpen ? " open" : ""}`}>
                    <button className="lib-block-head" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [g.id]: !isOpen })}>
                      <span className="lib-block-title">
                        <strong>{g.label}</strong>
                        <small>{g.hint}</small>
                      </span>
                      <span className="lib-count">{total}</span>
                      <Icon name={isOpen ? "chevronUp" : "chevron"} size={16} />
                    </button>
                    {isOpen && (
                      <div className="lib-block-body">
                        {cats.map(({ c, items }) => {
                          const folded = cats.length > 1 && closedCat[c.id];
                          return (
                            <Fragment key={c.id}>
                              {cats.length > 1 && (
                                <button className="cat-head" aria-expanded={!folded} onClick={() => setClosedCat({ ...closedCat, [c.id]: !closedCat[c.id] })}>
                                  <span>
                                    {c.label} <i>{items.length}</i>
                                  </span>
                                  <Icon name={folded ? "chevron" : "chevronUp"} size={14} />
                                </button>
                              )}
                              {!folded && <div className="lib-grid">{items.map(item)}</div>}
                            </Fragment>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
          <div className="lib-tip">
            <Icon name="info" />
            <span>Arraste os componentes para a área de trabalho e ligue as portas com fios.</span>
          </div>
        </>
      ) : (
        <div className="lib-scroll examples">
          {sits.length === 0 && <div className="lib-empty"><strong>Nenhuma situação com “{q.trim()}”.</strong></div>}
          {SITUATION_GROUPS.map((g) => {
            const list = sits.filter((x) => x.group === g.id);
            if (!list.length) return null;
            return (
              <section key={g.id}>
                <div className="cat-head static">
                  <span>{g.label}</span>
                </div>
                {list.map((x) => (
                  <button
                    key={x.id}
                    className="example-card"
                    onClick={() => {
                      loadSituation(x);
                      if (isCompact()) setLeftOpen(false);
                    }}
                  >
                    <strong>{x.title}</strong>
                    <span>{x.description}</span>
                    <em>Explore: {x.explore}</em>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}
