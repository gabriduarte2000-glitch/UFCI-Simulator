import { useMemo, useState } from "react";
import { allDefs, CATEGORIES, defaultParams, SITUATIONS, SITUATION_GROUPS, type ComponentDef } from "@ufci/engine";
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

export function Library() {
  const [tab, setTab] = useState<"comp" | "sit">("comp");
  const setLeftOpen = useUi((s) => s.setLeftOpen);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const add = useAddAtCenter();
  const defs = useMemo(() => allDefs(), []);
  const needle = q.trim().toLowerCase();
  const match = (d: ComponentDef) => !needle || d.label.toLowerCase().includes(needle) || d.description.toLowerCase().includes(needle) || d.type.includes(needle);

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
      {tab === "comp" ? (
        <>
          <label className="search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar componente..." aria-label="Buscar componente" />
          </label>
          <div className="lib-scroll">
            {CATEGORIES.filter((c) => c.available)
              .map((cat) => ({ cat, items: defs.filter((d) => d.category === cat.id && match(d)) }))
              .filter((g) => g.items.length > 0)
              .map(({ cat, items }) => (
                <section key={cat.id}>
                  <button className="cat-head" onClick={() => setClosed({ ...closed, [cat.id]: !closed[cat.id] })} aria-expanded={!closed[cat.id]}>
                    <span>{cat.label}</span>
                    <Icon name={closed[cat.id] ? "chevron" : "chevronUp"} size={14} />
                  </button>
                  {!closed[cat.id] && (
                    <div className="lib-grid">
                      {items.map((d) => (
                        <button
                          key={d.type}
                          className="lib-item"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/ufci-type", d.type);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => {
                            add(d.type);
                            if (isCompact()) setLeftOpen(false);
                          }}
                          title={`${d.description}\nArraste para a área de trabalho ou clique para adicionar.`}
                        >
                          <Mini def={d} />
                          <span>{d.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ))}
          </div>
          <div className="lib-tip">
            <Icon name="info" />
            <span>Arraste os componentes para a área de trabalho e ligue as portas com fios.</span>
          </div>
        </>
      ) : (
        <div className="lib-scroll examples">
          {SITUATION_GROUPS.map((g) => (
            <section key={g.id}>
              <div className="cat-head static">
                <span>{g.label}</span>
              </div>
              {SITUATIONS.filter((x) => x.group === g.id).map((x) => (
                <button key={x.id} className="example-card" onClick={() => {
                    loadSituation(x);
                    if (isCompact()) setLeftOpen(false);
                  }}>
                  <strong>{x.title}</strong>
                  <span>{x.description}</span>
                  <em>Explore: {x.explore}</em>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
