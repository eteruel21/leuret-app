import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Loader2, RefreshCw, Search } from "lucide-react";
import {
  loadPriceAlerts,
  loadPriceHistory,
  type PriceAlert,
  type PriceAlertKind,
  type PriceAlertsResponse,
  type PriceHistoryEntry,
} from "../admin-data";
import { EmptyState, Field, SectionHeader, SelectField, Table } from "./CommonUI";
import { errorMessage, formatDate, formatMoney } from "../utils/helpers";

const KIND_LABELS: Record<PriceAlertKind, string> = {
  big_change: "Cambio fuerte",
  negative_margin: "Margen negativo",
  low_margin: "Margen bajo",
  no_price: "Sin precio",
  stale: "Desactualizado",
};

const SOURCE_LABELS: Record<string, string> = {
  panel_super_admin: "Panel admin",
  ajuste_masivo: "Ajuste masivo",
};

function sourceLabel(source: string | null) {
  if (!source) return "—";
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  if (source.startsWith("actualizacion_mercado")) return "Actualización de mercado";
  return source;
}

function percentLabel(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

export function PriceMonitor({ onOpenItem }: { onOpenItem?: (itemId: string) => void }) {
  const [alerts, setAlerts] = useState<PriceAlertsResponse | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<PriceAlertKind | "all">("all");
  const [threshold, setThreshold] = useState("15");
  const [historySearch, setHistorySearch] = useState("");
  const [historyItem, setHistoryItem] = useState<{ id: string; name: string } | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      setAlerts(await loadPriceAlerts(Number(threshold) || 15));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingAlerts(false);
    }
  }, [threshold]);

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      setHistory(
        await loadPriceHistory({
          search: historyItem ? undefined : historySearch,
          itemId: historyItem?.id,
          limit: historyItem ? 200 : 100,
        }),
      );
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingHistory(false);
    }
  }, [historyItem, historySearch]);

  useEffect(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshHistory(), 300);
    return () => window.clearTimeout(timer);
  }, [refreshHistory]);

  const visibleAlerts = useMemo(
    () =>
      (alerts?.alerts ?? []).filter(
        (alert) => kindFilter === "all" || alert.kind === kindFilter,
      ),
    [alerts, kindFilter],
  );

  function showItemHistory(alert: Pick<PriceAlert, "itemId" | "name">) {
    setHistoryItem({ id: alert.itemId, name: alert.name });
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <section className="data-card">
        <div className="card-toolbar">
          <SectionHeader
            title="Alertas de precios"
            subtitle="Cambios fuertes en los últimos 60 días, márgenes en rojo, partidas sin precio y precios con más de 180 días sin revisar."
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void refreshAlerts()}
            disabled={loadingAlerts}
          >
            {loadingAlerts ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}{" "}
            Actualizar
          </button>
        </div>

        <div className="price-alert-summary">
          {(Object.keys(KIND_LABELS) as PriceAlertKind[]).map((kind) => (
            <button
              type="button"
              key={kind}
              className={`price-alert-chip price-alert-chip--${kind}${kindFilter === kind ? " active" : ""}`}
              onClick={() => setKindFilter(kindFilter === kind ? "all" : kind)}
            >
              <strong>{alerts?.counts[kind] ?? 0}</strong>
              <span>{KIND_LABELS[kind]}</span>
            </button>
          ))}
          <div className="price-alert-threshold">
            <SelectField
              label="Umbral de cambio"
              value={threshold}
              onChange={setThreshold}
              options={[
                { value: "10", label: "±10%" },
                { value: "15", label: "±15%" },
                { value: "20", label: "±20%" },
                { value: "30", label: "±30%" },
              ]}
            />
          </div>
        </div>

        {visibleAlerts.length === 0 && !loadingAlerts ? (
          <EmptyState label="Sin alertas para este filtro." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Elemento</th>
                <th>Alerta</th>
                <th>Costo</th>
                <th>Venta</th>
                <th>Último cambio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleAlerts.slice(0, 200).map((alert) => (
                <tr key={`${alert.itemId}-${alert.kind}`}>
                  <td>
                    <strong>{alert.name}</strong>
                    <small>
                      {alert.code ?? "Sin código"} · {alert.unitSymbol ?? "und."}
                    </small>
                  </td>
                  <td>
                    <span className={`severity-pill severity-pill--${alert.severity}`}>
                      <AlertTriangle size={12} /> {KIND_LABELS[alert.kind]}
                    </span>
                    <small>{alert.message}</small>
                  </td>
                  <td>{formatMoney(alert.unitCost)}</td>
                  <td>{formatMoney(alert.salePrice)}</td>
                  <td>{formatDate(alert.lastPriceChange)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Ver historial"
                      onClick={() => showItemHistory(alert)}
                    >
                      <History size={16} />
                    </button>
                    {onOpenItem && (
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => onOpenItem(alert.itemId)}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {visibleAlerts.length > 200 && (
          <p className="table-footnote">
            Mostrando 200 de {visibleAlerts.length} alertas.
          </p>
        )}
      </section>

      <section className="data-card">
        <div className="card-toolbar">
          <SectionHeader
            title="Historial de cambios"
            subtitle={
              historyItem
                ? `Todos los cambios de «${historyItem.name}».`
                : "Últimos 100 cambios del catálogo global: ediciones, ajustes masivos y actualizaciones de mercado."
            }
          />
          {historyItem && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setHistoryItem(null)}
            >
              Ver todo el historial
            </button>
          )}
        </div>

        {!historyItem && (
          <div className="pricing-filters">
            <div className="search-field">
              <Field label="Buscar">
                <div className="suffix-input">
                  <input
                    type="text"
                    placeholder="Nombre, código u origen…"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                  />
                  <span>
                    <Search size={15} />
                  </span>
                </div>
              </Field>
            </div>
          </div>
        )}

        {loadingHistory ? (
          <div className="loading-row">
            <Loader2 className="spin" size={18} /> Cargando historial…
          </div>
        ) : history.length === 0 ? (
          <EmptyState label="Sin cambios registrados." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Elemento</th>
                <th>Costo</th>
                <th>Venta</th>
                <th>Variación</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.createdAt)}</td>
                  <td>
                    <strong>{entry.name}</strong>
                    <small>{entry.code ?? "Sin código"}</small>
                  </td>
                  <td>
                    {formatMoney(entry.previousUnitCost)} → {formatMoney(entry.unitCost)}
                  </td>
                  <td>
                    {formatMoney(entry.previousSalePrice)} → {formatMoney(entry.salePrice)}
                  </td>
                  <td
                    className={
                      entry.costChangePercentage === null
                        ? undefined
                        : entry.costChangePercentage > 0
                          ? "change-up"
                          : entry.costChangePercentage < 0
                            ? "change-down"
                            : undefined
                    }
                  >
                    {percentLabel(entry.costChangePercentage)}
                  </td>
                  <td>
                    {sourceLabel(entry.source)}
                    {entry.changedByName && <small>{entry.changedByName}</small>}
                    {entry.notes && <small title={entry.notes}>{entry.notes}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
