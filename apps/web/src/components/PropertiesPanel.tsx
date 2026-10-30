import { useEffect, useMemo, useState } from "react";
import { getDef, portsOf, validateParam, type ComponentInstance, type ParamDef, type ParamOrigin } from "@ufci/engine";
import { useProject } from "../store";
import { useLive } from "../live";
import { Icon } from "./Icon";
import { nodeSize, SymbolArt } from "./Symbols";

const ORIGINS: { id: ParamOrigin; label: string; hint: string }[] = [
  { id: "illustrative", label: "ilustrativo", hint: "Valor de exemplo, sem fonte. Clique para marcar como estimado." },
  { id: "estimated", label: "estimado", hint: "Valor estimado ou medido por você. Clique para marcar como documentado." },
  { id: "documented", label: "documentado", hint: "Valor com fonte (livro, folha de dados). Clique para voltar a ilustrativo." },
];

function NumberField({ pd, value, onCommit }: { pd: ParamDef; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setDraft(String(+value.toPrecision(10)));
  }, [value, focus]);
  const parsed = Number(draft.replace(",", "."));
  const err = draft.trim() === "" || !Number.isFinite(parsed) ? `${pd.label} precisa ser um número.` : validateParam(pd, parsed);
  const commit = () => {
    if (!err && parsed !== value) onCommit(parsed);
  };
  return (
    <div className="field-col">
      <div className="field-row">
        <input
          className={`input ${err ? "bad" : ""}`}
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocus(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocus(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(String(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-invalid={!!err}
        />
        {pd.unit && <span className="unit">{pd.unit}</span>}
      </div>
      {pd.slider && (
        <input
          type="range"
          className="slider"
          min={pd.slider.min}
          max={pd.slider.max}
          step={pd.slider.step ?? (pd.slider.max - pd.slider.min) / 200}
          value={Math.min(pd.slider.max, Math.max(pd.slider.min, value))}
          onChange={(e) => onCommit(Number(e.target.value))}
        />
      )}
      {err && focus && <small className="field-err">{err}</small>}
    </div>
  );
}

function TextField({ pd, value, onCommit }: { pd: ParamDef; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (pd.key === "text")
    return <textarea className="input note-input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} aria-label={pd.label} />;
  return (
    <input
      className="input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      spellCheck={false}
      aria-label={pd.label}
    />
  );
}

function ParamRow({ comp, pd }: { comp: ComponentInstance; pd: ParamDef }) {
  const set = useProject((s) => s.setParam);
  const setOrigin = useProject((s) => s.setParamOrigin);
  const pv = comp.params[pd.key];
  const value = pv?.value ?? pd.default;
  const origin = pv?.origin ?? "illustrative";
  const oi = ORIGINS.findIndex((o) => o.id === origin);
  // O controle da entrada manual usa o intervalo definido nos próprios parâmetros.
  const eff: ParamDef =
    comp.type === "signal.manual" && pd.key === "value"
      ? { ...pd, slider: { min: Number(comp.params.min?.value ?? -1), max: Number(comp.params.max?.value ?? 1) } }
      : pd;
  return (
    <div className="param">
      <div className="param-label">
        <label>{pd.label}</label>
        {pd.kind !== "bool" && pd.kind !== "select" && pd.kind !== "text" && (
          <button className={`origin o-${origin}`} title={ORIGINS[oi].hint} onClick={() => setOrigin(comp.id, pd.key, ORIGINS[(oi + 1) % 3].id)}>
            {ORIGINS[oi].label}
          </button>
        )}
      </div>
      {pd.kind === "number" || pd.kind === "int" ? (
        <NumberField pd={eff} value={Number(value)} onCommit={(v) => set(comp.id, pd.key, v)} />
      ) : pd.kind === "bool" ? (
        <label className="check">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(comp.id, pd.key, e.target.checked)} />
          <span>{value ? "Ligado" : "Desligado"}</span>
        </label>
      ) : pd.kind === "select" ? (
        <select className="input" value={String(value)} onChange={(e) => set(comp.id, pd.key, e.target.value)}>
          {pd.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <TextField pd={pd} value={String(value)} onCommit={(v) => set(comp.id, pd.key, v)} />
      )}
      {pd.hint && <small className="hint">{pd.hint}</small>}
      {pd.structural && <small className="hint warn">Mudar isto altera as portas e reinicia a simulação.</small>}
      {pd.initialOnly && <small className="hint">Vale a partir do próximo reinício.</small>}
    </div>
  );
}

function ComponentPanel({ comp }: { comp: ComponentInstance }) {
  const def = getDef(comp.type)!;
  const [tab, setTab] = useState<"basic" | "initial" | "advanced" | "model">("basic");
  const setLabel = useProject((s) => s.setLabel);
  const del = useProject((s) => s.deleteComponents);
  const groups = useMemo(() => {
    const g = (k: string) => def.params.filter((p) => (p.group ?? "basic") === k);
    return { basic: g("basic"), initial: g("initial"), advanced: g("advanced") };
  }, [def]);
  const tabs = [
    { id: "basic", label: "Parâmetros", n: groups.basic.length },
    { id: "initial", label: "Iniciais", n: groups.initial.length },
    { id: "advanced", label: "Avançado", n: groups.advanced.length },
    { id: "model", label: "Modelo", n: 1 },
  ].filter((t) => t.n > 0) as { id: typeof tab; label: string }[];
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const { w, h } = nodeSize(def.symbol, comp.params);
  const sc = Math.min(1, 64 / w, 40 / h);
  const ports = portsOf(def, comp.params);
  return (
    <>
      <div className="comp-head">
        <svg width={w * sc + 6} height={h * sc + 6} viewBox={`-3 -3 ${w + 6} ${h + 6}`} className="comp-icon">
          <SymbolArt symbol={def.symbol} params={comp.params} w={w} h={h} />
        </svg>
        <div>
          <input className="name-input" value={comp.label ?? ""} onChange={(e) => setLabel(comp.id, e.target.value)} aria-label="Nome do componente" />
          <div className="comp-type">{def.label}</div>
        </div>
      </div>
      <p className="comp-desc">{def.description}</p>
      <div className="tabs small" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="params">
        {active === "model" ? (
          <div className="model">
            <h4>Equação</h4>
            <code>{def.model}</code>
            <h4>Hipóteses</h4>
            <ul>
              {def.hypotheses.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            <h4>Portas</h4>
            <ul>
              {ports.map((p) => (
                <li key={p.name}>
                  {p.label}: {p.dir === "in" ? "entrada" : p.dir === "out" ? "saída" : "física"} de {p.domain === "signal" ? "sinal" : p.domain}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          groups[active].map((pd) => <ParamRow key={pd.key} comp={comp} pd={pd} />)
        )}
      </div>
      <button className="btn danger" onClick={() => del([comp.id])}>
        <Icon name="trash" /> Remover componente
      </button>
    </>
  );
}

function ConnectionPanel({ id }: { id: string }) {
  const conn = useProject((s) => s.project.connections.find((c) => c.id === id));
  const comps = useProject((s) => s.project.components);
  const idx = useLive((s) => s.edgeSignal[id]);
  const value = useLive((s) => (idx !== null && idx !== undefined ? s.current[idx] : undefined));
  const del = useProject((s) => s.deleteConnections);
  if (!conn) return null;
  const name = (cid: string) => comps.find((c) => c.id === cid)?.label ?? cid;
  return (
    <>
      <h3 className="panel-title">Conexão</h3>
      <p className="comp-desc">
        {name(conn.from.component)} → {name(conn.to.component)}
      </p>
      <p className="comp-desc">Fio de sinal: leva um número no tempo, no sentido da seta.</p>
      {value !== undefined && <p className="live-value">Valor agora: {Number.isFinite(value) ? +value.toPrecision(6) : "inválido"}</p>}
      <button className="btn danger" onClick={() => del([id])}>
        <Icon name="trash" /> Remover conexão
      </button>
    </>
  );
}

export function PropertiesPanel() {
  const selNodes = useProject((s) => s.selectedNodes);
  const selEdges = useProject((s) => s.selectedEdges);
  const comp = useProject((s) => (s.selectedNodes.length === 1 ? s.project.components.find((c) => c.id === s.selectedNodes[0]) : undefined));
  return (
    <aside className="props" aria-label="Propriedades">
      <h2 className="panel-title">Propriedades do componente</h2>
      {comp && getDef(comp.type) ? (
        <ComponentPanel key={comp.id} comp={comp} />
      ) : selNodes.length > 1 ? (
        <p className="empty-note">{selNodes.length} componentes selecionados. Arraste para mover, Delete para remover, Ctrl+C e Ctrl+V para copiar.</p>
      ) : selEdges.length === 1 ? (
        <ConnectionPanel id={selEdges[0]} />
      ) : (
        <p className="empty-note">Selecione um componente na área de trabalho para ver e editar seus parâmetros. Com a simulação rodando, a mudança vale a partir do instante atual e fica marcada no gráfico.</p>
      )}
    </aside>
  );
}
