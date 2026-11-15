/**
 * Solicitudes de factura (migración 044): qué ve el cliente al pie de su obra
 * y cómo se agrupan las solicitudes del lado del contratista.
 */

export type ClientInvoiceFooter =
  | { kind: "request" }
  | { kind: "pending" }
  | { kind: "invoice"; invoiceId: string };

type ProjectForFooter = {
  status: string;
  can_request_invoice?: boolean;
  invoice_request?: { status: "pending" | "fulfilled" | "cancelled"; invoice_id: string | null } | null;
  invoices: { id: string }[];
};

/**
 * - Obra terminada con presupuesto aprobado sin facturar → «Solicitar factura».
 * - Solicitud pendiente → aviso «Factura solicitada».
 * - Obra terminada y con factura → «Ver factura».
 */
export function clientInvoiceFooter(project: ProjectForFooter): ClientInvoiceFooter | null {
  if (project.can_request_invoice) return { kind: "request" };
  if (project.invoice_request?.status === "pending") return { kind: "pending" };
  if (project.status === "completed") {
    const invoiceId = project.invoice_request?.invoice_id ?? project.invoices[0]?.id;
    if (invoiceId) return { kind: "invoice", invoiceId };
  }
  return null;
}

export type InvoiceRequestLike = {
  id: string;
  budget_id: string;
  status: "pending" | "fulfilled" | "cancelled";
};

/** La solicitud pendiente de un presupuesto, si la hay. */
export function pendingRequestForBudget<T extends InvoiceRequestLike>(requests: T[], budgetId: string): T | null {
  return requests.find((request) => request.budget_id === budgetId && request.status === "pending") ?? null;
}

export function invoiceRequestsLabel(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 cliente pidió su factura" : `${count} clientes pidieron su factura`;
}
