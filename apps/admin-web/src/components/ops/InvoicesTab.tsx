import { useEffect, useState } from "react";
import { BellRing, CreditCard, History, Receipt, ReceiptText } from "lucide-react";

import type { Company } from "../../admin-data";
import {
  INVOICE_STATUS,
  PAYMENT_METHOD,
  REMINDER_KIND,
  dateTime,
  day,
  downloadCsv,
  loadInvoiceDetail,
  loadInvoices,
  money,
} from "../../operations-data";
import { AlertBanner, EmptyState, Table } from "../CommonUI";
import {
  Drawer,
  DrawerSection,
  KeyValues,
  ListToolbar,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  StatusPill,
  statusPill,
  useAdminList,
  useDebounced,
  useDetail,
} from "./OpsUI";
import type { OpsNavigate } from "./navigation";

const STATUS_OPTIONS = [
  { value: "overdue_real", label: "Vencidas con saldo (real)" },
  ...Object.entries(INVOICE_STATUS).map(([value, entry]) => ({ value, label: entry.label })),
];

const HISTORY_LABELS: Record<string, string> = {
  created: "Creada",
  issued: "Emitida",
  status_changed: "Cambio de estado",
  payment_recorded: "Pago registrado",
  payment_reversed: "Pago revertido",
  credit_note_issued: "Nota de crédito emitida",
  credit_note_cancelled: "Nota de crédito anulada",
  cancelled: "Anulada",
};

function historyLabel(eventType: string, toStatus: string | null): string {
  const event = HISTORY_LABELS[eventType] ?? eventType;
  const status = toStatus ? INVOICE_STATUS[toStatus]?.label ?? toStatus : null;
  return status && status !== event ? `${event} → ${status}` : event;
}

export function InvoicesTab({
  companies,
  initialStatus = "",
  initialCompanyId = "",
  focusId = null,
  onNavigate,
}: {
  companies: Company[];
  initialStatus?: string;
  initialCompanyId?: string;
  focusId?: string | null;
  onNavigate: OpsNavigate;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setOffset(0), [debouncedSearch, status, companyId]);

  const { page, loading, error, reload, setError } = useAdminList(loadInvoices, {
    search: debouncedSearch,
    status,
    companyId,
    limit: PAGE_SIZE,
    offset,
  });
  const rows = page?.rows ?? [];

  function exportCsv() {
    downloadCsv(
      `facturas-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Número", "Empresa", "Cliente", "Presupuesto", "Estado", "Emisión", "Vencimiento", "Total", "Pagado", "Notas de crédito", "Saldo", "Moneda", "Vencida"],
      rows.map((invoice) => [
        invoice.invoiceNumber,
        invoice.companyName,
        invoice.clientName,
        invoice.budgetNumber,
        INVOICE_STATUS[invoice.status]?.label ?? invoice.status,
        invoice.issueDate,
        invoice.dueDate,
        invoice.total.toFixed(2),
        invoice.totalPaid.toFixed(2),
        invoice.totalCredit.toFixed(2),
        invoice.balance.toFixed(2),
        invoice.currencyCode,
        invoice.isOverdue ? "Sí" : "No",
      ])
    );
  }

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      <section className="data-card">
        <ListToolbar
          title="Facturas de todas las empresas"
          subtitle={page ? `${page.total} factura${page.total === 1 ? "" : "s"}` : "Cargando..."}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Buscar número, empresa, cliente o presupuesto..."
          status={status}
          onStatus={setStatus}
          statusOptions={STATUS_OPTIONS}
          companies={companies}
          companyId={companyId}
          onCompany={setCompanyId}
          loading={loading}
          onReload={reload}
          onExport={rows.length ? exportCsv : undefined}
        />

        {loading && !page ? (
          <LoadingBlock label="Cargando facturas..." />
        ) : rows.length === 0 ? (
          <EmptyState label="No hay facturas que coincidan con los filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Empresa</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th className="numeric">Total</th>
                <th className="numeric">Saldo</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody className={loading ? "is-refreshing" : undefined}>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="clickable-row" onClick={() => setSelectedId(invoice.id)}>
                  <td>
                    <strong>{invoice.invoiceNumber ?? "Borrador"}</strong>
                    <small>{invoice.budgetNumber ? `Presupuesto ${invoice.budgetNumber}` : ""}</small>
                  </td>
                  <td>{invoice.companyName}</td>
                  <td>{invoice.clientName ?? "—"}</td>
                  <td>
                    {statusPill(INVOICE_STATUS, invoice.status)}
                    {invoice.isOverdue && invoice.status !== "overdue" && <StatusPill label="Vencida" tone="danger" />}
                  </td>
                  <td className="numeric">{money(invoice.total, invoice.currencyCode)}</td>
                  <td className="numeric">
                    <strong className={invoice.balance > 0 ? (invoice.isOverdue ? "text-danger" : undefined) : "text-success"}>
                      {money(invoice.balance, invoice.currencyCode)}
                    </strong>
                    {invoice.totalPaid > 0 && <small>Pagado {money(invoice.totalPaid, invoice.currencyCode)}</small>}
                  </td>
                  <td>{day(invoice.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page && <Pagination total={page.total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />}
      </section>

      {selectedId && <InvoiceDrawer id={selectedId} onClose={() => setSelectedId(null)} onNavigate={onNavigate} />}
    </>
  );
}

function InvoiceDrawer({ id, onClose, onNavigate }: { id: string; onClose: () => void; onNavigate: OpsNavigate }) {
  const { detail, error } = useDetail(loadInvoiceDetail, id);
  const invoice = detail?.invoice;
  const currency = invoice?.currencyCode ?? "USD";

  return (
    <Drawer
      title={invoice ? `Factura ${invoice.invoiceNumber ?? "borrador"}` : "Factura"}
      subtitle={invoice ? <>{statusPill(INVOICE_STATUS, invoice.status)} {invoice.companyName}</> : "Cargando..."}
      onClose={onClose}
      actions={
        invoice && (
          <>
            {invoice.budgetId && (
              <button className="button button-ghost" type="button" onClick={() => onNavigate({ tab: "budgets", id: invoice.budgetId })}>
                Ver presupuesto
              </button>
            )}
            <button className="button button-ghost" type="button" onClick={() => onNavigate({ tab: "companies", id: invoice.companyId })}>
              Ver empresa
            </button>
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cerrar
            </button>
          </>
        )
      }
    >
      {error && <AlertBanner message={error} />}
      {!detail && !error && <LoadingBlock label="Cargando factura..." />}
      {detail && invoice && (
        <>
          <DrawerSection title="Resumen" icon={<Receipt size={17} />}>
            <div className="totals-strip">
              <div>
                <span>Total</span>
                <strong>{money(invoice.total, currency)}</strong>
              </div>
              <div>
                <span>Pagado</span>
                <strong className="text-success">{money(invoice.totalPaid, currency)}</strong>
              </div>
              <div>
                <span>Notas de crédito</span>
                <strong>{money(invoice.totalCredit, currency)}</strong>
              </div>
              <div className="totals-strip-main">
                <span>Saldo</span>
                <strong className={invoice.isOverdue ? "text-danger" : undefined}>{money(invoice.balance, currency)}</strong>
              </div>
            </div>
            <KeyValues
              items={[
                ["Cliente", invoice.clientName],
                ["Correo del cliente", invoice.clientEmail],
                ["Presupuesto", invoice.budgetNumber],
                ["Emisión", day(invoice.issueDate)],
                ["Vencimiento", <span className={invoice.isOverdue ? "text-danger" : undefined}>{day(invoice.dueDate)}</span>],
                ["Emitida el", dateTime(invoice.issuedAt)],
              ]}
            />
            {invoice.notes && <p className="drawer-note">{invoice.notes}</p>}
          </DrawerSection>

          {invoice.items.length > 0 && (
            <DrawerSection title="Detalle facturado" icon={<ReceiptText size={17} />} aside={`${invoice.items.length}`}>
              <Table>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="numeric">Cant.</th>
                    <th className="numeric">P. unit.</th>
                    <th className="numeric">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={`${index}-${item.description}`}>
                      <td>{item.description}</td>
                      <td className="numeric">
                        {item.quantity.toLocaleString("es-PA", { maximumFractionDigits: 3 })} {item.unitName ?? ""}
                      </td>
                      <td className="numeric">{money(item.unitPrice, currency)}</td>
                      <td className="numeric">{money(item.subtotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </DrawerSection>
          )}

          <DrawerSection title="Pagos" icon={<CreditCard size={17} />} aside={`${detail.payments.length}`}>
            {detail.payments.length === 0 ? (
              <EmptyState label="Sin pagos registrados." />
            ) : (
              <ul className="drawer-list">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className={payment.status === "reversed" ? "is-done" : undefined}>
                    <div>
                      <strong>
                        {payment.receiptNumber ?? payment.paymentNumber ?? "Pago"} · {PAYMENT_METHOD[payment.method] ?? payment.method}
                      </strong>
                      <small>
                        {[dateTime(payment.paidAt), payment.reference].filter(Boolean).join(" · ")}
                        {payment.status === "reversed" && ` · Revertido: ${payment.reversalReason ?? "sin motivo"}`}
                      </small>
                    </div>
                    <strong className={payment.status === "reversed" ? "muted-text" : "text-success"}>{money(payment.amount, currency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>

          {detail.creditNotes.length > 0 && (
            <DrawerSection title="Notas de crédito" icon={<ReceiptText size={17} />}>
              <ul className="drawer-list">
                {detail.creditNotes.map((note) => (
                  <li key={note.id} className={note.status === "cancelled" ? "is-done" : undefined}>
                    <div>
                      <strong>{note.creditNoteNumber ?? "Nota de crédito"}</strong>
                      <small>{[dateTime(note.issuedAt), note.reason].filter(Boolean).join(" · ")}</small>
                    </div>
                    <strong>{money(note.amount, currency)}</strong>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          {detail.reminders.length > 0 && (
            <DrawerSection title="Recordatorios de cobro" icon={<BellRing size={17} />}>
              <ul className="drawer-list">
                {detail.reminders.map((reminder) => (
                  <li key={reminder.id}>
                    <div>
                      <strong>{REMINDER_KIND[reminder.kind] ?? reminder.kind}</strong>
                      <small>{reminder.sentTo}</small>
                    </div>
                    <span className="muted-text">{dateTime(reminder.claimedAt)}</span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          <DrawerSection title="Historial" icon={<History size={17} />}>
            {detail.history.length === 0 ? (
              <EmptyState label="Sin eventos registrados." />
            ) : (
              <ul className="timeline">
                {detail.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>{historyLabel(entry.eventType, entry.toStatus)}</strong>
                    <small>{[entry.actorName, dateTime(entry.createdAt)].filter(Boolean).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
