import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, X } from "lucide-react";

import type { Company } from "../../admin-data";
import type { ListQuery, Page, Tone } from "../../operations-data";
import { errorMessage } from "../../utils/helpers";

export const PAGE_SIZE = 50;

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>;
}

export function statusPill(map: Record<string, { label: string; tone: Tone }>, status: string) {
  const entry = map[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusPill label={entry.label} tone={entry.tone} />;
}

/** Valor que se actualiza después de `delay` ms sin cambios (búsquedas). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type ListState<P> = {
  page: P | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setError: (value: string | null) => void;
};

/** Carga una página del servidor y descarta respuestas viejas si cambian los filtros. */
export function useAdminList<P extends Page<unknown>>(
  loader: (query: ListQuery) => Promise<P>,
  query: ListQuery
): ListState<P> {
  const [page, setPage] = useState<P | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);
  const key = JSON.stringify(query);

  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    loader(JSON.parse(key) as ListQuery)
      .then((result) => {
        if (current === requestId.current) setPage(result);
      })
      .catch((loadError: unknown) => {
        if (current === requestId.current) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [loader, key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { page, loading, error, reload, setError };
}

/** Carga un detalle por id con estado de carga y error. */
export function useDetail<T>(loader: (id: string) => Promise<T>, id: string | null) {
  const [detail, setDetail] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    setDetail(null);
    setError(null);
    loader(id)
      .then((result) => active && setDetail(result))
      .catch((loadError: unknown) => active && setError(errorMessage(loadError)));
    return () => {
      active = false;
    };
  }, [loader, id]);

  return { detail, error };
}

export interface ListToolbarProps {
  title: string;
  subtitle: string;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  status?: string;
  onStatus?: (value: string) => void;
  statusOptions?: Array<{ value: string; label: string }>;
  statusAllLabel?: string;
  companies?: Company[];
  companyId?: string;
  onCompany?: (value: string) => void;
  loading: boolean;
  onReload: () => void;
  onExport?: () => void;
}

export function ListToolbar(props: ListToolbarProps) {
  return (
    <div className="card-toolbar ops-toolbar">
      <div className="section-header">
        <h2>{props.title}</h2>
        <p>{props.subtitle}</p>
      </div>
      <div className="toolbar-actions ops-controls">
        <div className="search-box">
          <Search size={16} />
          <input
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder={props.searchPlaceholder}
            aria-label="Buscar"
          />
          {props.search && (
            <button type="button" onClick={() => props.onSearch("")} aria-label="Limpiar búsqueda">
              <X size={14} />
            </button>
          )}
        </div>
        {props.statusOptions && props.onStatus && (
          <select value={props.status ?? ""} onChange={(event) => props.onStatus?.(event.target.value)} aria-label="Filtrar por estado">
            <option value="">{props.statusAllLabel ?? "Todos los estados"}</option>
            {props.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {props.companies && props.onCompany && (
          <select value={props.companyId ?? ""} onChange={(event) => props.onCompany?.(event.target.value)} aria-label="Filtrar por empresa">
            <option value="">Todas las empresas</option>
            {props.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        )}
        {props.onExport && (
          <button className="icon-button" type="button" onClick={props.onExport} title="Exportar CSV" aria-label="Exportar CSV">
            <Download size={17} />
          </button>
        )}
        <button className="icon-button" type="button" onClick={props.onReload} disabled={props.loading} title="Actualizar" aria-label="Actualizar">
          <RefreshCw size={17} className={props.loading ? "spin" : undefined} />
        </button>
      </div>
    </div>
  );
}

export function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) {
    return <p className="table-footnote">{total} registro{total === 1 ? "" : "s"}</p>;
  }
  const from = Math.min(total, offset + 1);
  const to = Math.min(total, offset + limit);
  return (
    <div className="ops-pagination">
      <span>
        {from}–{to} de {total}
      </span>
      <button className="icon-button" type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))} aria-label="Página anterior">
        <ChevronLeft size={17} />
      </button>
      <button className="icon-button" type="button" disabled={to >= total} onClick={() => onChange(offset + limit)} aria-label="Página siguiente">
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="review-loading">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

/** Panel lateral para el detalle de un registro. Se cierra con Esc o clic fuera. */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {actions && <footer className="drawer-footer">{actions}</footer>}
      </aside>
    </div>
  );
}

export function DrawerSection({ title, icon, children, aside }: { title: string; icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="drawer-section">
      <div className="drawer-section-heading">
        {icon}
        <h3>{title}</h3>
        {aside && <span className="drawer-section-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function KeyValues({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="ops-progress">
      <div className="progress-bar" aria-label={`${Math.round(clamped)}%`}>
        <span style={{ width: `${clamped}%` }} />
      </div>
      <small>{Math.round(clamped)}%</small>
    </div>
  );
}

export function KpiCard({ label, value, detail, tone = "neutral", onClick }: { label: string; value: ReactNode; detail?: ReactNode; tone?: Tone; onClick?: () => void }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </>
  );
  return onClick ? (
    <button type="button" className={`stat-card kpi-card kpi-card--${tone}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`stat-card kpi-card kpi-card--${tone}`}>{content}</div>
  );
}

/** Barras horizontales simples para repartir un total por estado. */
export function StatusBars({
  counts,
  labels,
  onSelect,
}: {
  counts: Record<string, number>;
  labels: Record<string, { label: string; tone: Tone }>;
  onSelect?: (status: string) => void;
}) {
  const entries = Object.keys(labels)
    .map((status) => [status, counts[status] ?? 0] as const)
    .filter(([, count]) => count > 0);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (entries.length === 0) return <p className="muted-text">Sin registros todavía.</p>;
  return (
    <ul className="status-bars">
      {entries.map(([status, count]) => (
        <li key={status}>
          <button type="button" onClick={() => onSelect?.(status)} disabled={!onSelect}>
            <span className="status-bars-label">{labels[status]?.label ?? status}</span>
            <span className="status-bars-track">
              <span className={`status-bars-fill status-bars-fill--${labels[status]?.tone ?? "neutral"}`} style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <strong>{count}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Gráfico de columnas mensual en SVG, sin dependencias. */
export function MonthlyColumns({ data, format }: { data: Array<{ month: string; collected: number }>; format: (value: number) => string }) {
  const max = Math.max(1, ...data.map((entry) => entry.collected));
  const width = 600;
  const height = 160;
  const gap = 8;
  const barWidth = data.length ? (width - gap * (data.length - 1)) / data.length : 0;
  const monthName = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("es-PA", { month: "short" }).format(new Date(year ?? 2000, (month ?? 1) - 1, 1));
  };

  return (
    <figure className="monthly-columns">
      <svg viewBox={`0 0 ${width} ${height + 22}`} role="img" aria-label="Cobros por mes">
        {data.map((entry, index) => {
          const barHeight = entry.collected > 0 ? Math.max(3, (entry.collected / max) * height) : 0;
          const x = index * (barWidth + gap);
          return (
            <g key={entry.month}>
              <title>{`${monthName(entry.month)}: ${format(entry.collected)}`}</title>
              <rect x={x} y={0} width={barWidth} height={height} rx={4} className="monthly-columns-track" />
              <rect x={x} y={height - barHeight} width={barWidth} height={barHeight} rx={4} className="monthly-columns-bar" />
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle">
                {monthName(entry.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
