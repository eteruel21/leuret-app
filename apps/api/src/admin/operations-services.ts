import {
  adminGlobalSearchRepo,
  findAdminBudgetDetailRepo,
  findAdminInvoiceDetailRepo,
  findAdminProjectDetailRepo,
  getAdminOverviewRepo,
  listAdminAuditActionsRepo,
  listAdminAuditLogsRepo,
  listAdminBudgetsRepo,
  listAdminClientsRepo,
  listAdminInvoicesRepo,
  listAdminProjectsRepo,
  listAdminUserSessionsRepo,
  revokeAdminUserSessionsRepo,
  type ListFilters
} from "./operations-repository.js";

type Row = Record<string, any>;

export const toIso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : null;
};

/** Fechas `date` de Postgres: se devuelven como YYYY-MM-DD sin zona horaria. */
export const toDay = (value: unknown): string | null => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return typeof value === "string" && value ? value.slice(0, 10) : null;
};

export const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export type Page<T> = { rows: T[]; total: number; limit: number; offset: number };

function page<T>(rows: Row[], filters: ListFilters, map: (row: Row) => T): Page<T> {
  return {
    rows: rows.map(map),
    total: rows.length ? toNumber(rows[0]!.total_count) : 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

// ---------------------------------------------------------------- Obras

export function mapAdminProjectRow(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    projectCode: toText(row.project_code),
    status: String(row.status ?? "lead"),
    progressPercentage: toNumber(row.progress_percentage),
    startDate: toDay(row.start_date),
    estimatedEndDate: toDay(row.estimated_end_date),
    actualEndDate: toDay(row.actual_end_date),
    contractValue: row.contract_value === null || row.contract_value === undefined ? null : toNumber(row.contract_value),
    budgetEstimate: row.budget_estimate === null || row.budget_estimate === undefined ? null : toNumber(row.budget_estimate),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? ""),
    clientName: toText(row.client_name),
    managerName: toText(row.manager_name),
    taskCount: toNumber(row.task_count),
    openTaskCount: toNumber(row.open_task_count),
    overdueTaskCount: toNumber(row.overdue_task_count)
  };
}

export async function listAdminProjectsService(userId: string, filters: ListFilters) {
  return page(await listAdminProjectsRepo(userId, filters), filters, mapAdminProjectRow);
}

export async function getAdminProjectDetailService(userId: string, projectId: string) {
  const detail = await findAdminProjectDetailRepo(userId, projectId);
  if (!detail) return null;
  const project = detail.project;

  return {
    project: {
      ...mapAdminProjectRow(project),
      description: toText(project.description),
      clientEmail: toText(project.client_email),
      clientPhone: toText(project.client_phone),
      photoCount: toNumber(project.photo_count)
    },
    tasks: detail.tasks.map((task: Row) => ({
      id: String(task.id),
      title: String(task.title ?? ""),
      description: toText(task.description),
      status: String(task.status ?? ""),
      priority: toText(task.priority),
      dueDate: toIso(task.due_date),
      completedAt: toIso(task.completed_at),
      assigneeName: toText(task.assignee_name)
    })),
    progress: detail.progress.map((entry: Row) => ({
      id: String(entry.id),
      progressPercentage: toNumber(entry.progress_percentage),
      previousPercentage: entry.previous_percentage === null ? null : toNumber(entry.previous_percentage),
      notes: toText(entry.notes),
      authorName: toText(entry.author_name),
      createdAt: toIso(entry.created_at)
    })),
    budgets: detail.budgets.map(mapBudgetSummary),
    invoices: detail.invoices.map(mapInvoiceSummary),
    activities: detail.activities.map((activity: Row) => ({
      id: String(activity.id),
      title: String(activity.title ?? ""),
      type: toText(activity.type),
      status: toText(activity.status),
      date: toText(activity.date),
      startTime: toText(activity.start_time),
      endTime: toText(activity.end_time)
    }))
  };
}

// ---------------------------------------------------------- Presupuestos

function mapBudgetSummary(row: Row) {
  return {
    id: String(row.id),
    budgetNumber: toText(row.budget_number),
    title: String(row.title ?? ""),
    status: String(row.status ?? "draft"),
    total: toNumber(row.total),
    currencyCode: String(row.currency_code ?? "USD"),
    updatedAt: toIso(row.updated_at)
  };
}

function mapInvoiceSummary(row: Row) {
  return {
    id: String(row.id),
    invoiceNumber: toText(row.invoice_number),
    status: String(row.status ?? "draft"),
    issueDate: toDay(row.issue_date),
    dueDate: toDay(row.due_date),
    total: toNumber(row.total),
    balance: toNumber(row.balance)
  };
}

export function mapAdminBudgetRow(row: Row) {
  return {
    ...mapBudgetSummary(row),
    version: toNumber(row.version) || 1,
    validUntil: toDay(row.valid_until),
    approvedAt: toIso(row.approved_at),
    createdAt: toIso(row.created_at),
    pastValidity: Boolean(row.past_validity),
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? ""),
    clientName: toText(row.client_name),
    projectName: toText(row.project_name),
    itemCount: toNumber(row.item_count)
  };
}

export async function listAdminBudgetsService(userId: string, filters: ListFilters) {
  return page(await listAdminBudgetsRepo(userId, filters), filters, mapAdminBudgetRow);
}

export async function getAdminBudgetDetailService(userId: string, budgetId: string) {
  const detail = await findAdminBudgetDetailRepo(userId, budgetId);
  if (!detail) return null;
  const budget = detail.budget;

  return {
    budget: {
      ...mapAdminBudgetRow(budget),
      description: toText(budget.description),
      notes: toText(budget.notes),
      terms: toText(budget.terms),
      rejectionReason: toText(budget.rejection_reason),
      subtotal: toNumber(budget.subtotal),
      discountType: String(budget.discount_type ?? "none"),
      discountValue: toNumber(budget.discount_value),
      discountAmount: toNumber(budget.discount_amount),
      taxRate: toNumber(budget.tax_rate),
      taxAmount: toNumber(budget.tax_amount),
      clientEmail: toText(budget.client_email),
      createdByName: toText(budget.created_by_name)
    },
    items: detail.items.map((item: Row) => ({
      id: String(item.id),
      itemType: String(item.item_type ?? "manual"),
      description: String(item.description ?? ""),
      unitName: String(item.unit_name ?? ""),
      quantity: toNumber(item.quantity),
      unitCost: toNumber(item.unit_cost),
      unitPrice: toNumber(item.unit_price),
      discountPercentage: toNumber(item.discount_percentage),
      subtotal: toNumber(item.subtotal),
      taxable: Boolean(item.taxable),
      sectionName: toText(item.section_name)
    })),
    versions: detail.versions.map((version: Row) => ({
      id: String(version.id),
      versionNumber: toNumber(version.version_number),
      createdAt: toIso(version.created_at),
      createdByName: toText(version.created_by_name)
    })),
    invoices: detail.invoices.map(mapInvoiceSummary)
  };
}

// ------------------------------------------------------------ Facturación

export function mapAdminInvoiceRow(row: Row) {
  return {
    ...mapInvoiceSummary(row),
    issuedAt: toIso(row.issued_at),
    createdAt: toIso(row.created_at),
    currencyCode: String(row.currency_code ?? "USD"),
    totalPaid: toNumber(row.total_paid),
    totalCredit: toNumber(row.total_credit),
    paymentCount: toNumber(row.payment_count),
    isOverdue: Boolean(row.is_overdue),
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? ""),
    clientName: toText(row.client_name),
    budgetNumber: toText(row.budget_number)
  };
}

export async function listAdminInvoicesService(userId: string, filters: ListFilters) {
  return page(await listAdminInvoicesRepo(userId, filters), filters, mapAdminInvoiceRow);
}

export async function getAdminInvoiceDetailService(userId: string, invoiceId: string) {
  const detail = await findAdminInvoiceDetailRepo(userId, invoiceId);
  if (!detail) return null;
  const invoice = detail.invoice;
  const items = Array.isArray(invoice.items) ? (invoice.items as Row[]) : [];

  return {
    invoice: {
      ...mapAdminInvoiceRow(invoice),
      notes: toText(invoice.notes),
      clientEmail: toText(invoice.client_email),
      budgetId: toText(invoice.budget_id),
      items: items.slice(0, 300).map((item) => ({
        description: String(item.description ?? item.name ?? ""),
        quantity: toNumber(item.quantity),
        unitName: toText(item.unit_name ?? item.unitName),
        unitPrice: toNumber(item.unit_price ?? item.unitPrice),
        subtotal: toNumber(item.subtotal ?? item.total)
      }))
    },
    payments: detail.payments.map((payment: Row) => ({
      id: String(payment.id),
      paymentNumber: toText(payment.payment_number),
      receiptNumber: toText(payment.receipt_number),
      status: String(payment.status ?? "confirmed"),
      method: String(payment.method ?? "other"),
      amount: toNumber(payment.amount),
      paidAt: toIso(payment.paid_at),
      reference: toText(payment.reference),
      reversedAt: toIso(payment.reversed_at),
      reversalReason: toText(payment.reversal_reason)
    })),
    creditNotes: detail.creditNotes.map((note: Row) => ({
      id: String(note.id),
      creditNoteNumber: toText(note.credit_note_number),
      status: String(note.status ?? "issued"),
      amount: toNumber(note.amount),
      reason: toText(note.reason),
      issuedAt: toIso(note.issued_at),
      cancelledAt: toIso(note.cancelled_at)
    })),
    history: detail.history.map((entry: Row) => ({
      id: String(entry.id),
      eventType: String(entry.event_type ?? ""),
      fromStatus: toText(entry.from_status),
      toStatus: toText(entry.to_status),
      actorName: toText(entry.actor_name),
      createdAt: toIso(entry.created_at)
    })),
    reminders: detail.reminders.map((reminder: Row) => ({
      id: String(reminder.id),
      kind: String(reminder.kind ?? ""),
      sentTo: String(reminder.sent_to ?? ""),
      claimedAt: toIso(reminder.claimed_at)
    }))
  };
}

export async function getAdminOverviewService(userId: string) {
  const overview = await getAdminOverviewRepo(userId);
  const billing = overview.billing as Row;
  const tasks = overview.tasks as Row;
  const countBy = (rows: Row[]) =>
    Object.fromEntries(rows.map((row) => [String(row.status), toNumber(row.count)])) as Record<string, number>;

  return {
    generatedAt: new Date().toISOString(),
    billing: {
      issuedCount: toNumber(billing.issued_count),
      issuedTotal: toNumber(billing.issued_total),
      collectedTotal: toNumber(billing.collected_total),
      outstandingTotal: toNumber(billing.outstanding_total),
      overdueCount: toNumber(billing.overdue_count),
      overdueTotal: toNumber(billing.overdue_total),
      draftCount: toNumber(billing.draft_count)
    },
    monthlyCollected: overview.monthly.map((row: Row) => ({
      month: String(row.month),
      collected: toNumber(row.collected)
    })),
    projectsByStatus: countBy(overview.projectStatus),
    budgetsByStatus: countBy(overview.budgetStatus),
    budgetTotalsByStatus: Object.fromEntries(
      overview.budgetStatus.map((row: Row) => [String(row.status), toNumber(row.total)])
    ) as Record<string, number>,
    tasks: {
      openCount: toNumber(tasks.open_count),
      overdueCount: toNumber(tasks.overdue_count)
    },
    topCompanies: overview.topCompanies.map((row: Row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      collected: toNumber(row.collected),
      paidInvoices: toNumber(row.paid_invoices)
    }))
  };
}

// --------------------------------------------------------------- Clientes

export function mapAdminClientRow(row: Row) {
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? "Sin nombre"),
    clientType: String(row.client_type ?? "person"),
    documentType: toText(row.document_type),
    documentNumber: toText(row.document_number),
    email: toText(row.email),
    phone: toText(row.phone),
    active: Boolean(row.active),
    hasPortalAccess: Boolean(row.has_portal_access),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? ""),
    projectCount: toNumber(row.project_count),
    budgetCount: toNumber(row.budget_count),
    invoiceCount: toNumber(row.invoice_count)
  };
}

export async function listAdminClientsService(userId: string, filters: ListFilters) {
  return page(await listAdminClientsRepo(userId, filters), filters, mapAdminClientRow);
}

// ------------------------------------------------------------- Auditoría

export function mapAdminAuditRow(row: Row) {
  return {
    id: String(row.id),
    action: String(row.action ?? ""),
    targetType: String(row.target_type ?? ""),
    targetId: toText(row.target_id),
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    createdAt: toIso(row.created_at),
    companyId: toText(row.company_id),
    companyName: toText(row.company_name),
    actorName: toText(row.actor_name),
    actorEmail: toText(row.actor_email)
  };
}

export async function listAdminAuditLogsService(userId: string, filters: ListFilters) {
  const [rows, actions] = await Promise.all([
    listAdminAuditLogsRepo(userId, filters),
    listAdminAuditActionsRepo(userId)
  ]);
  return {
    ...page(rows, filters, mapAdminAuditRow),
    actions: actions.map((row: Row) => ({ action: String(row.action), count: toNumber(row.count) }))
  };
}

// --------------------------------------------------------------- Sesiones

export async function listAdminUserSessionsService(userId: string, targetUserId: string) {
  const rows = await listAdminUserSessionsRepo(userId, targetUserId);
  return rows.map((row: Row) => ({
    id: String(row.id),
    userAgent: toText(row.user_agent),
    ipAddress: toText(row.ip_address),
    createdAt: toIso(row.created_at),
    lastUsedAt: toIso(row.last_used_at),
    expiresAt: toIso(row.expires_at)
  }));
}

export async function revokeAdminUserSessionsService(userId: string, targetUserId: string, reason: string) {
  return revokeAdminUserSessionsRepo(userId, targetUserId, reason.trim());
}

// --------------------------------------------------------- Búsqueda global

export async function adminGlobalSearchService(userId: string, query: string) {
  const result = await adminGlobalSearchRepo(userId, query);
  const map = (rows: Row[]) =>
    rows.map((row) => ({ id: String(row.id), label: String(row.label ?? ""), detail: toText(row.detail) }));
  return {
    users: map(result.users),
    companies: map(result.companies),
    projects: map(result.projects),
    budgets: map(result.budgets),
    invoices: map(result.invoices),
    clients: map(result.clients)
  };
}
