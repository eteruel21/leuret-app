import { authenticatedRequest } from "./api";

export type Page<T> = { rows: T[]; total: number; limit: number; offset: number };

export type ListQuery = {
  search?: string;
  status?: string;
  companyId?: string;
  limit?: number;
  offset?: number;
};

function queryString(query: ListQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status) params.set("status", query.status);
  if (query.companyId) params.set("companyId", query.companyId);
  params.set("limit", String(query.limit ?? 50));
  params.set("offset", String(query.offset ?? 0));
  return params.toString();
}

// ---------------------------------------------------------------- Etiquetas

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  lead: { label: "Prospecto", tone: "neutral" },
  inspection: { label: "Inspección", tone: "info" },
  quoted: { label: "Cotizada", tone: "info" },
  approved: { label: "Aprobada", tone: "success" },
  in_progress: { label: "En ejecución", tone: "success" },
  paused: { label: "Pausada", tone: "warning" },
  completed: { label: "Terminada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "danger" },
};

export const BUDGET_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Borrador", tone: "neutral" },
  sent: { label: "Enviado", tone: "info" },
  viewed: { label: "Visto", tone: "info" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  expired: { label: "Vencido", tone: "warning" },
  cancelled: { label: "Anulado", tone: "danger" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Borrador", tone: "neutral" },
  issued: { label: "Emitida", tone: "info" },
  partially_paid: { label: "Pago parcial", tone: "warning" },
  paid: { label: "Pagada", tone: "success" },
  overdue: { label: "Vencida", tone: "danger" },
  cancelled: { label: "Anulada", tone: "danger" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  check: "Cheque",
  other: "Otro",
};

export const TASK_STATUS: Record<string, string> = {
  todo: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  blocked: "Bloqueada",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  COMPANY_SUSPENDED: "Empresa suspendida",
  COMPANY_REACTIVATED: "Empresa reactivada",
  ADMIN_SESSIONS_REVOKED: "Sesiones cerradas por admin",
  COMPANY_CREATED: "Empresa creada",
  BILLING_UPDATED: "Datos de facturación actualizados",
  MEMBER_ACTIVATED: "Miembro activado",
  MEMBER_DEACTIVATED: "Miembro desactivado",
  MEMBER_ROLE_UPDATED: "Rol de miembro cambiado",
  MEMBER_REMOVED: "Miembro eliminado",
};

export const REMINDER_KIND: Record<string, string> = {
  due_soon: "Aviso antes del vencimiento",
  overdue: "Aviso de factura vencida",
  overdue_week: "Aviso a la semana de vencida",
};

export function auditLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action] ??
    action
      .toLowerCase()
      .split("_")
      .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join(" ")
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// ----------------------------------------------------------------- Tipos

export type AdminProject = {
  id: string;
  name: string;
  projectCode: string | null;
  status: string;
  progressPercentage: number;
  startDate: string | null;
  estimatedEndDate: string | null;
  actualEndDate: string | null;
  contractValue: number | null;
  budgetEstimate: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  companyId: string;
  companyName: string;
  clientName: string | null;
  managerName: string | null;
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
};

export type BudgetSummary = {
  id: string;
  budgetNumber: string | null;
  title: string;
  status: string;
  total: number;
  currencyCode: string;
  updatedAt: string | null;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  balance: number;
};

export type AdminProjectDetail = {
  project: AdminProject & {
    description: string | null;
    clientEmail: string | null;
    clientPhone: string | null;
    photoCount: number;
  };
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string | null;
    dueDate: string | null;
    completedAt: string | null;
    assigneeName: string | null;
  }>;
  progress: Array<{
    id: string;
    progressPercentage: number;
    previousPercentage: number | null;
    notes: string | null;
    authorName: string | null;
    createdAt: string | null;
  }>;
  budgets: BudgetSummary[];
  invoices: InvoiceSummary[];
  activities: Array<{
    id: string;
    title: string;
    type: string | null;
    status: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
  }>;
};

export type AdminBudget = BudgetSummary & {
  version: number;
  validUntil: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  pastValidity: boolean;
  companyId: string;
  companyName: string;
  clientName: string | null;
  projectName: string | null;
  itemCount: number;
};

export type AdminBudgetDetail = {
  budget: AdminBudget & {
    description: string | null;
    notes: string | null;
    terms: string | null;
    rejectionReason: string | null;
    subtotal: number;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    taxRate: number;
    taxAmount: number;
    clientEmail: string | null;
    createdByName: string | null;
  };
  items: Array<{
    id: string;
    itemType: string;
    description: string;
    unitName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    discountPercentage: number;
    subtotal: number;
    taxable: boolean;
    sectionName: string | null;
  }>;
  versions: Array<{ id: string; versionNumber: number; createdAt: string | null; createdByName: string | null }>;
  invoices: InvoiceSummary[];
};

export type AdminInvoice = InvoiceSummary & {
  issuedAt: string | null;
  createdAt: string | null;
  currencyCode: string;
  totalPaid: number;
  totalCredit: number;
  paymentCount: number;
  isOverdue: boolean;
  companyId: string;
  companyName: string;
  clientName: string | null;
  budgetNumber: string | null;
};

export type AdminInvoiceDetail = {
  invoice: AdminInvoice & {
    notes: string | null;
    clientEmail: string | null;
    budgetId: string | null;
    items: Array<{ description: string; quantity: number; unitName: string | null; unitPrice: number; subtotal: number }>;
  };
  payments: Array<{
    id: string;
    paymentNumber: string | null;
    receiptNumber: string | null;
    status: string;
    method: string;
    amount: number;
    paidAt: string | null;
    reference: string | null;
    reversedAt: string | null;
    reversalReason: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string | null;
    status: string;
    amount: number;
    reason: string | null;
    issuedAt: string | null;
    cancelledAt: string | null;
  }>;
  history: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorName: string | null;
    createdAt: string | null;
  }>;
  reminders: Array<{ id: string; kind: string; sentTo: string; claimedAt: string | null }>;
};

export type AdminClient = {
  id: string;
  displayName: string;
  clientType: string;
  documentType: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  hasPortalAccess: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  companyId: string;
  companyName: string;
  projectCount: number;
  budgetCount: number;
  invoiceCount: number;
};

export type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  companyId: string | null;
  companyName: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

export type AdminAuditPage = Page<AdminAuditLog> & { actions: Array<{ action: string; count: number }> };

export type AdminOverview = {
  generatedAt: string;
  billing: {
    issuedCount: number;
    issuedTotal: number;
    collectedTotal: number;
    outstandingTotal: number;
    overdueCount: number;
    overdueTotal: number;
    draftCount: number;
  };
  monthlyCollected: Array<{ month: string; collected: number }>;
  projectsByStatus: Record<string, number>;
  budgetsByStatus: Record<string, number>;
  budgetTotalsByStatus: Record<string, number>;
  tasks: { openCount: number; overdueCount: number };
  topCompanies: Array<{ id: string; name: string; collected: number; paidInvoices: number }>;
};

export type UserSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export type SearchHit = { id: string; label: string; detail: string | null };

export type GlobalSearchResult = {
  users: SearchHit[];
  companies: SearchHit[];
  projects: SearchHit[];
  budgets: SearchHit[];
  invoices: SearchHit[];
  clients: SearchHit[];
};

// ------------------------------------------------------------- Peticiones

export const loadOverview = () => authenticatedRequest<AdminOverview>("/admin/overview");

export const loadProjects = (query: ListQuery) =>
  authenticatedRequest<Page<AdminProject>>(`/admin/projects?${queryString(query)}`);
export const loadProjectDetail = (id: string) =>
  authenticatedRequest<AdminProjectDetail>(`/admin/projects/${encodeURIComponent(id)}`);

export const loadBudgets = (query: ListQuery) =>
  authenticatedRequest<Page<AdminBudget>>(`/admin/budgets?${queryString(query)}`);
export const loadBudgetDetail = (id: string) =>
  authenticatedRequest<AdminBudgetDetail>(`/admin/budgets/${encodeURIComponent(id)}`);

export const loadInvoices = (query: ListQuery) =>
  authenticatedRequest<Page<AdminInvoice>>(`/admin/invoices?${queryString(query)}`);
export const loadInvoiceDetail = (id: string) =>
  authenticatedRequest<AdminInvoiceDetail>(`/admin/invoices/${encodeURIComponent(id)}`);

export const loadClients = (query: ListQuery) =>
  authenticatedRequest<Page<AdminClient>>(`/admin/clients?${queryString(query)}`);

export const loadAuditLogs = (query: ListQuery) =>
  authenticatedRequest<AdminAuditPage>(`/admin/audit-logs?${queryString(query)}`);

export const globalSearch = (q: string) =>
  authenticatedRequest<GlobalSearchResult>(`/admin/search?q=${encodeURIComponent(q.trim())}`);

export async function loadUserSessions(userId: string): Promise<UserSession[]> {
  const response = await authenticatedRequest<{ sessions: UserSession[] }>(
    `/admin/users/${encodeURIComponent(userId)}/sessions`
  );
  return response.sessions;
}

export async function revokeUserSessions(userId: string, reason: string): Promise<number> {
  const response = await authenticatedRequest<{ revokedCount: number }>(
    `/admin/users/${encodeURIComponent(userId)}/sessions/revoke`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
  return response.revokedCount;
}

// ------------------------------------------------------------- Utilidades

export function money(value: number | null | undefined, currency = "USD"): string {
  const code = currency === "PAB" || !currency ? "USD" : currency;
  try {
    return new Intl.NumberFormat("es-PA", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).format(value ?? 0);
  } catch {
    return `$${(value ?? 0).toFixed(2)}`;
  }
}

/** Fecha `YYYY-MM-DD` o ISO a texto local sin correr el día por la zona horaria. */
export function day(value: string | null | undefined): string {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** Descarga filas como CSV (UTF-8 con BOM para que Excel respete los acentos). */
export function downloadCsv(fileName: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Describe el navegador/dispositivo a partir del user-agent. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconocido";
  const agent = userAgent.toLowerCase();
  const device = agent.includes("iphone") || agent.includes("ipad")
    ? "iOS"
    : agent.includes("android")
      ? "Android"
      : agent.includes("windows")
        ? "Windows"
        : agent.includes("mac os")
          ? "macOS"
          : agent.includes("linux")
            ? "Linux"
            : "Otro";
  const app = agent.includes("expo") || agent.includes("okhttp") || agent.includes("cfnetwork")
    ? "App móvil"
    : agent.includes("edg/")
      ? "Edge"
      : agent.includes("chrome")
        ? "Chrome"
        : agent.includes("firefox")
          ? "Firefox"
          : agent.includes("safari")
            ? "Safari"
            : "Navegador";
  return `${app} · ${device}`;
}
