export type CompanyRole =
  | "owner"
  | "admin"
  | "supervisor"
  | "sales"
  | "estimator"
  | "member";

export type InvitableCompanyRole =
  | "admin"
  | "supervisor"
  | "sales"
  | "estimator"
  | "member";

export type Company = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  currency_code: string;
  tax_rate: number;
  /** Correos automáticos de cobro a clientes (antes y después del vencimiento). */
  payment_reminders_enabled?: boolean;
  timezone: string;
  quotation_prefix: string;
  invoice_prefix: string;
  receipt_prefix: string;
  project_prefix: string;
  payment_prefix: string;
  created_by: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyMembership = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  active: boolean;
  company: Company;
};

export type CompanyMember = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  active: boolean;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  joined_at: string;
};

export type CompanyInvitation = {
  id: string;
  company_id: string;
  email: string;
  role: InvitableCompanyRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  inviter_email?: string | null;
  /** Solo viene al crear la invitación; no se puede volver a consultar. */
  acceptanceToken?: string;
  /** Si el servidor pudo enviar el correo de invitación. */
  emailSent?: boolean;
};

export type AuditLogEntry = {
  id: string;
  company_id: string;
  user_id: string;
  user_email: string | null;
  user_full_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
