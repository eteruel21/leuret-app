import { authenticatedRequest } from "@/services/api";
import type { BudgetStatus } from "@/types/budget";
import type {
  InvoicePaymentMethod,
  InvoicePaymentStatus,
  InvoiceSnapshot,
  InvoiceStatus,
  ReceiptSnapshot,
} from "@/types/invoice";
import type { ProjectStatus } from "@/types/project";

export type ClientCompanyInfo = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address?: string | null;
  logo_url?: string | null;
  currency_code?: string | null;
  timezone?: string | null;
  payment_instructions?: string | null;
};

export type ClientInvoice = {
  id: string;
  company_id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  issued_at: string | null;
  snapshot_data: InvoiceSnapshot | null;
  created_at: string;
  company: ClientCompanyInfo;
  project_id: string | null;
  currency_code: string;
  total_amount: number | null;
  adjusted_total_amount: number;
  total_paid: number;
  total_credit: number;
  balance_due: number;
  is_overdue: boolean;
};

export type ClientInvoicePayment = {
  id: string;
  invoice_id: string;
  payment_number: string;
  receipt_number: string;
  status: InvoicePaymentStatus;
  method: InvoicePaymentMethod;
  amount: number;
  currency_code: string;
  paid_at: string;
  reference: string | null;
  receipt_schema_version: 1;
  receipt_snapshot_data: ReceiptSnapshot;
  reversed_at: string | null;
  created_at: string;
};

export type ClientCreditNote = {
  id: string;
  credit_note_number: string;
  status: "issued" | "cancelled";
  amount: number;
  currency_code: string;
  reason: string;
  issued_at: string;
};

export type ClientInvoiceDetail = ClientInvoice & {
  payments: ClientInvoicePayment[];
  credit_notes: ClientCreditNote[];
};

export type ClientActivity = {
  id: string;
  title: string;
  type: "visit" | "meeting" | "work" | "payment" | "other";
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  date: string;
  start_time: string;
  end_time: string | null;
  address: string | null;
  project_id?: string | null;
  project_name?: string | null;
  company?: Pick<ClientCompanyInfo, "id" | "name" | "phone">;
};

export type ClientProjectDetail = {
  id: string;
  company_id: string;
  project_code: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  estimated_end_date: string | null;
  actual_end_date: string | null;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  company: ClientCompanyInfo;
  progress_history: {
    id: string;
    progress_percentage: number;
    previous_percentage: number;
    notes: string | null;
    created_at: string;
  }[];
  photos: { id: string; caption: string | null; created_at: string; signedUrl: string }[];
  activities: ClientActivity[];
  budgets: {
    id: string;
    budget_number: string;
    title: string;
    status: BudgetStatus;
    total: number;
    currency_code: string;
    valid_until: string | null;
    created_at: string;
  }[];
  invoices: ClientInvoice[];
};

export type ClientSummary = {
  pending_budgets: number;
  active_projects: number;
  open_invoices: {
    currency_code: string;
    open_count: number;
    overdue_count: number;
    balance_due: number;
  }[];
  next_activity: ClientActivity | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No fue posible completar la solicitud.";
}

export async function getClientSummary(): Promise<{ summary: ClientSummary | null; error: string | null }> {
  try {
    const response = await authenticatedRequest<{ summary: ClientSummary }>("/client/summary");
    return { summary: response.summary, error: null };
  } catch (error) {
    return { summary: null, error: errorMessage(error) };
  }
}

export async function listClientInvoices(): Promise<{ invoices: ClientInvoice[]; error: string | null }> {
  try {
    const response = await authenticatedRequest<{ invoices: ClientInvoice[] }>("/client/invoices");
    return { invoices: response.invoices, error: null };
  } catch (error) {
    return { invoices: [], error: errorMessage(error) };
  }
}

export async function getClientInvoice(
  invoiceId: string,
): Promise<{ invoice: ClientInvoiceDetail | null; error: string | null }> {
  try {
    const response = await authenticatedRequest<{ invoice: ClientInvoiceDetail }>(
      `/client/invoices/${encodeURIComponent(invoiceId)}`,
    );
    return { invoice: response.invoice, error: null };
  } catch (error) {
    return { invoice: null, error: errorMessage(error) };
  }
}

export async function getClientProject(
  projectId: string,
): Promise<{ project: ClientProjectDetail | null; error: string | null }> {
  try {
    const response = await authenticatedRequest<{ project: ClientProjectDetail }>(
      `/client/projects/${encodeURIComponent(projectId)}`,
    );
    return { project: response.project, error: null };
  } catch (error) {
    return { project: null, error: errorMessage(error) };
  }
}
