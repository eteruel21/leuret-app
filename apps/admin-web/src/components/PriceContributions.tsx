import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Users, X } from "lucide-react";

import {
  loadPriceContributions,
  reviewPriceContributions,
  type PriceContributionGroup,
  type PriceContributionStatus,
  type PriceContributionsResponse,
} from "../admin-data";
import { EmptyState, Field, SectionHeader, SelectField, SuccessBanner, Table } from "./CommonUI";
import { errorMessage, formatDate, formatMoney } from "../utils/helpers";

const STATUS_OPTIONS: Array<{ value: PriceContributionStatus; label: string }> = [
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
];

type Draft = { unitCost: string; salePrice: string; reason: string };

function draftFor(group: PriceContributionGroup): Draft {
  return {
    unitCost: String(group.medianCost),
    salePrice: String(group.suggestedSalePrice),
    reason: `Mediana de ${group.count} aporte${group.count === 1 ? "" : "s"} de usuarios`,
  };
}

function parseAmount(value: string): number {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Precios que aportan los usuarios desde la app para insumos sin precio (o
 * con un precio distinto). Aprobar cambia el precio del catálogo de todos y
 * lo deja en el historial con la fuente «Aportes de usuarios».
 */
export function PriceContributions({ onApproved }: { onApproved?: () => Promise<void> | void }) {
  const [status, setStatus] = useState<PriceContributionStatus>("pending");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PriceContributionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadPriceContributions({ status, search });
      setData(response);
      setDrafts(Object.fromEntries(response.groups.map((group) => [group.itemId, draftFor(group)])));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 300);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function updateDraft(itemId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [itemId]: { ...current[itemId]!, ...patch } }));
  }

  async function approve(group: PriceContributionGroup) {
    const draft = drafts[group.itemId] ?? draftFor(group);
    const unitCost = parseAmount(draft.unitCost);
    const salePrice = parseAmount(draft.salePrice);
    if (unitCost <= 0 || salePrice <= 0) {
      setError("El costo y la venta aprobados deben ser mayores que cero.");
      return;
    }
    if (salePrice < unitCost && !window.confirm("La venta es menor que el costo (margen negativo). ¿Aprobar de todas formas?")) {
      return;
    }

    setBusyItem(group.itemId);
    try {
      const result = await reviewPriceContributions(group.itemId, {
        action: "approve",
        unitCost,
        salePrice,
        reason: draft.reason.trim() || undefined,
      });
      setNotice(`«${group.name}» ahora cuesta ${formatMoney(unitCost)} (venta ${formatMoney(salePrice)}) para todos. ${result.reviewed} aporte${result.reviewed === 1 ? "" : "s"} aprobado${result.reviewed === 1 ? "" : "s"}.`);
      setError(null);
      await refresh();
      await onApproved?.();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyItem(null);
    }
  }

  async function reject(group: PriceContributionGroup) {
    const reason = window.prompt(
      `¿Por qué rechazas los aportes de «${group.name}»? (mínimo 5 caracteres)`,
      "Precio fuera de mercado",
    );
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError("Indica el motivo del rechazo (mínimo 5 caracteres).");
      return;
    }

    setBusyItem(group.itemId);
    try {
      const result = await reviewPriceContributions(group.itemId, { action: "reject", reason: reason.trim() });
      setNotice(`Se rechazaron ${result.reviewed} aporte${result.reviewed === 1 ? "" : "s"} de «${group.name}». Los usuarios conservan su precio personal.`);
      setError(null);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyItem(null);
    }
  }

  const groups = data?.groups ?? [];
  const pending = status === "pending";

  return (
    <section className="data-card">
      <div className="card-toolbar">
        <SectionHeader
          title="Precios aportados por usuarios"
          subtitle="Cuando un insumo no tiene precio, el usuario escribe lo que le cuesta desde la app. Lo usa de inmediato; aquí decides si pasa al catálogo de todos."
        />
        <button type="button" className="button button-secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} Actualizar
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <SuccessBanner message={notice} />}

      <div className="pricing-filters">
        <SelectField
          label="Estado"
          value={status}
          onChange={(value) => setStatus(value as PriceContributionStatus)}
          options={STATUS_OPTIONS}
        />
        <div className="search-field">
          <Field label="Buscar">
            <div className="suffix-input">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Insumo, código, categoría o tienda"
              />
              <span><Search size={15} /></span>
            </div>
          </Field>
        </div>
        <div className="price-alert-chip active contributions-count">
          <strong>{data?.totalItems ?? 0}</strong>
          <span>
            insumo{data?.totalItems === 1 ? "" : "s"} · {data?.totalContributions ?? 0} aporte
            {data?.totalContributions === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {groups.length === 0 && !loading ? (
        <EmptyState label={pending ? "No hay aportes pendientes." : "No hay aportes con este filtro."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Aportes</th>
              <th>Precio actual</th>
              <th>{pending ? "Aprobar costo" : "Costo aportado"}</th>
              <th>{pending ? "Venta" : "Revisado"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const draft = drafts[group.itemId] ?? draftFor(group);
              const open = expanded === group.itemId;
              const busy = busyItem === group.itemId;
              return [
                <tr key={group.itemId}>
                  <td>
                    <strong>{group.name}</strong>
                    <small>
                      {group.categoryName ?? "Sin categoría"} · {group.unitSymbol ?? "und."}
                      {group.stores.length ? ` · ${group.stores.slice(0, 3).join(", ")}` : ""}
                    </small>
                  </td>
                  <td>
                    <span className="severity-pill severity-pill--low">
                      <Users size={12} /> {group.count}
                    </span>
                    <small>
                      Mediana {formatMoney(group.medianCost)} · {formatMoney(group.minCost)}–{formatMoney(group.maxCost)}
                    </small>
                    {group.widespread && <small className="text-warning">Aportes muy dispersos: revisa antes de aprobar.</small>}
                  </td>
                  <td>
                    {group.currentUnitCost > 0 ? (
                      <>
                        {formatMoney(group.currentUnitCost)}
                        <small>
                          venta {formatMoney(group.currentSalePrice)}
                          {group.changePercentage !== null
                            ? ` · ${group.changePercentage > 0 ? "+" : ""}${group.changePercentage}%`
                            : ""}
                        </small>
                      </>
                    ) : (
                      <span className="severity-pill severity-pill--high">Sin precio</span>
                    )}
                  </td>
                  {pending ? (
                    <>
                      <td>
                        <input
                          aria-label={`Costo aprobado de ${group.name}`}
                          className="inline-price-input"
                          inputMode="decimal"
                          value={draft.unitCost}
                          onChange={(event) => {
                            const unitCost = event.target.value;
                            const parsed = parseAmount(unitCost);
                            updateDraft(group.itemId, {
                              unitCost,
                              salePrice: parsed > 0 ? String(Math.round(parsed * group.currentMarkup * 100) / 100) : draft.salePrice,
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Venta aprobada de ${group.name}`}
                          className="inline-price-input"
                          inputMode="decimal"
                          value={draft.salePrice}
                          onChange={(event) => updateDraft(group.itemId, { salePrice: event.target.value })}
                        />
                        <small>margen × {group.currentMarkup}</small>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{formatMoney(group.medianCost)}</td>
                      <td>
                        {formatDate(group.entries[0]?.reviewedAt ?? null)}
                        {group.entries[0]?.reviewNotes ? <small>{group.entries[0].reviewNotes}</small> : null}
                      </td>
                    </>
                  )}
                  <td className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title={open ? "Ocultar aportes" : "Ver aportes"}
                      onClick={() => setExpanded(open ? null : group.itemId)}
                    >
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {pending && (
                      <>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          disabled={busy}
                          onClick={() => void approve(group)}
                        >
                          {busy ? <Loader2 className="spin" size={14} /> : <Check size={14} />} Aprobar
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={busy}
                          onClick={() => void reject(group)}
                        >
                          <X size={14} /> Rechazar
                        </button>
                      </>
                    )}
                  </td>
                </tr>,
                open ? (
                  <tr key={`${group.itemId}-entries`} className="expanded-row">
                    <td colSpan={6}>
                      {pending && (
                        <Field label="Nota para el historial (opcional)">
                          <input
                            value={draft.reason}
                            maxLength={500}
                            onChange={(event) => updateDraft(group.itemId, { reason: event.target.value })}
                          />
                        </Field>
                      )}
                      <Table>
                        <thead>
                          <tr>
                            <th>Usuario</th>
                            <th>Costo</th>
                            <th>Tienda</th>
                            <th>Región</th>
                            <th>Nota</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.contributorName ?? "—"}</td>
                              <td>{formatMoney(entry.unitCost)}</td>
                              <td>{entry.storeName ?? "—"}</td>
                              <td>{entry.regionCode ?? "—"}</td>
                              <td>{entry.notes ?? "—"}</td>
                              <td>{formatDate(entry.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </Table>
      )}
      {data?.truncated && (
        <small>Se muestran los 2,000 aportes más recientes. Usa el buscador para encontrar otros.</small>
      )}
    </section>
  );
}
