import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { type GlobalSearchResult, globalSearch } from "../../operations-data";
import { errorMessage } from "../../utils/helpers";
import { useDebounced } from "./OpsUI";
import { TAB_LABELS, type NavTarget, type Tab } from "./navigation";


type Entry = {
  key: string;
  group: string;
  label: string;
  detail: string | null;
  run: () => void;
};

const GROUPS: Array<{ key: keyof GlobalSearchResult; label: string; tab: Tab }> = [
  { key: "users", label: "Usuarios", tab: "users" },
  { key: "companies", label: "Empresas", tab: "companies" },
  { key: "projects", label: "Obras", tab: "projects" },
  { key: "budgets", label: "Presupuestos", tab: "budgets" },
  { key: "invoices", label: "Facturas", tab: "invoices" },
  { key: "clients", label: "Clientes", tab: "clients" },
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Búsqueda global (Ctrl/⌘ + K): navega a cualquier pestaña o registro. */
export function CommandPalette({
  onClose,
  onNavigate,
  onOpenUser,
}: {
  onClose: () => void;
  onNavigate: (target: NavTarget) => void;
  onOpenUser: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounced = useDebounced(query.trim(), 250);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      setError(null);
      return undefined;
    }
    let current = true;
    setLoading(true);
    globalSearch(debounced)
      .then((value) => current && setResults(value))
      .catch((searchError: unknown) => current && setError(errorMessage(searchError)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [debounced]);

  const entries = useMemo<Entry[]>(() => {
    const close = (action: () => void) => () => {
      onClose();
      action();
    };
    const needle = normalize(query.trim());
    const tabs: Entry[] = (Object.keys(TAB_LABELS) as Tab[])
      .filter((tab) => !needle || normalize(TAB_LABELS[tab]).includes(needle))
      .map((tab) => ({
        key: `tab-${tab}`,
        group: "Ir a",
        label: TAB_LABELS[tab],
        detail: null,
        run: close(() => onNavigate({ tab })),
      }));

    const records: Entry[] = results
      ? GROUPS.flatMap((group) =>
          results[group.key].map((hit) => ({
            key: `${group.key}-${hit.id}`,
            group: group.label,
            label: hit.label,
            detail: hit.detail,
            run: close(() => {
              if (group.key === "users") onOpenUser(hit.id);
              else if (group.key === "clients") onNavigate({ tab: "clients", id: hit.id, search: hit.label });
              else onNavigate({ tab: group.tab, id: hit.id });
            }),
          }))
        )
      : [];

    return [...records, ...tabs];
  }, [query, results, onClose, onNavigate, onOpenUser]);

  useEffect(() => setActive(0), [entries.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(entries.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[active]?.run();
    }
  }

  let lastGroup = "";

  return (
    <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Búsqueda global" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca usuarios, empresas, obras, presupuestos, facturas o clientes..."
            aria-label="Buscar en toda la plataforma"
          />
          {loading ? <Loader2 className="spin" size={16} /> : <kbd>Esc</kbd>}
        </div>
        {error && <p className="palette-error">{error}</p>}
        <ul className="palette-list" ref={listRef} role="listbox">
          {entries.length === 0 && !loading && <li className="palette-empty">Sin resultados para “{query}”.</li>}
          {entries.map((entry, index) => {
            const heading = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <li key={entry.key}>
                {heading && <span className="palette-group">{heading}</span>}
                <button
                  type="button"
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "is-active" : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={entry.run}
                >
                  <span>
                    <strong>{entry.label}</strong>
                    {entry.detail && <small>{entry.detail}</small>}
                  </span>
                  <ArrowRight size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> para moverte · <kbd>Enter</kbd> para abrir
          </span>
          <span>
            <kbd>Ctrl</kbd> + <kbd>K</kbd>
          </span>
        </footer>
      </div>
    </div>
  );
}
