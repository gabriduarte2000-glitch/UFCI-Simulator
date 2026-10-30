import { Icon } from "./Icon";
import { useUi, type Page } from "../ui";

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: "montagem", label: "Montagem", icon: "build" },
  { id: "dashboard", label: "Dashboard", icon: "dash" },
  { id: "graficos", label: "Gráficos", icon: "chartLine" },
  { id: "tabelas", label: "Tabelas", icon: "table" },
  { id: "indicadores", label: "Indicadores", icon: "gauge" },
  { id: "math", label: "Matemática", icon: "sigma" },
];

/** Navegação entre páginas na parte de baixo da tela (só aparece em telas estreitas). */
export function BottomNav() {
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  return (
    <nav className="bottom-nav" aria-label="Páginas">
      {PAGES.map((p) => (
        <button key={p.id} className={page === p.id ? "on" : ""} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
          <Icon name={p.icon} size={20} />
          <span>{p.label}</span>
        </button>
      ))}
    </nav>
  );
}
