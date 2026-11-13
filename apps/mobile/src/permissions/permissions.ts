import type { CompanyRole } from "../types/company";

/**
 * Única fuente de permisos de la app por rol de empresa.
 *
 * Cada capacidad refleja el `requireCompanyRole([...])` de la ruta
 * correspondiente en apps/api. Si cambias un guard en la API,
 * actualiza aquí la misma lista (los tests lo documentan).
 */

const ALL_ROLES: readonly CompanyRole[] = [
  "owner",
  "admin",
  "supervisor",
  "sales",
  "estimator",
  "member",
];

const MANAGERS: readonly CompanyRole[] = ["owner", "admin"];

export const CAPABILITIES = {
  // Presupuestos — budgets/routes.ts
  "budgets.view": ["owner", "admin", "estimator"],
  "budgets.edit": ["owner", "admin", "estimator"],

  // Peticiones de trabajo de clientes — job-requests/routes.ts
  "jobRequests.view": ["owner", "admin", "estimator", "sales"],
  "jobRequests.quote": ["owner", "admin", "estimator"],

  // Proyectos — projects/routes.ts
  "projects.list": ALL_ROLES,
  "projects.view": ALL_ROLES,
  // Montos de la obra (estimado y valor contratado); la API los oculta a los demás.
  "projects.financials": ["owner", "admin", "supervisor", "sales"],
  "projects.status.edit": ["owner", "admin", "supervisor", "sales"],
  "projects.create": ["owner", "admin", "supervisor", "sales"],
  "projects.progress.edit": MANAGERS,

  // Tareas y avances — projects/tasks, projects/progress, storage
  "tasks.mine": ALL_ROLES,
  "tasks.edit": ALL_ROLES,
  "tasks.delete": ["owner", "admin", "supervisor"],
  "progress.upload": ALL_ROLES,
  "progress.record": ["owner", "admin", "supervisor"],
  "progress.delete": ["owner", "admin", "supervisor"],

  // Facturas — invoices/routes.ts
  "invoices.view": ALL_ROLES,
  "invoices.create": ["owner", "admin", "sales"],
  "invoices.payments.record": ["owner", "admin", "sales"],
  "invoices.manageFinancial": MANAGERS,

  // Clientes — clients/routes.ts
  "clients.view": ALL_ROLES,
  "clients.edit": ["owner", "admin", "sales"],
  "clients.delete": MANAGERS,

  // Catálogo — catalog/routes.ts, operations/routes.ts
  "catalog.view": ALL_ROLES,
  "catalog.manage": MANAGERS,

  // Cálculos — calculations/routes.ts
  "calculations.use": ALL_ROLES,
  "calculations.delete": ["owner", "admin", "estimator"],

  // Agenda — activities/routes.ts
  "agenda.use": ALL_ROLES,
  "agenda.delete": ["owner", "admin", "supervisor"],

  // Empresa y equipo — companies/routes.ts
  "team.view": ALL_ROLES,
  "company.manage": MANAGERS,
} as const satisfies Record<string, readonly CompanyRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(
  role: CompanyRole | null | undefined,
  capability: Capability
): boolean {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly CompanyRole[]).includes(role);
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  supervisor: "Supervisor",
  sales: "Ventas",
  estimator: "Presupuestista",
  member: "Equipo de campo",
};

export type QuickActionId =
  | "calculate"
  | "budget"
  | "project"
  | "client"
  | "agenda"
  | "tasks"
  | "invoices";

/** Accesos rápidos del inicio, en el orden que más usa cada rol. */
export const HOME_QUICK_ACTIONS: Record<CompanyRole, readonly QuickActionId[]> = {
  owner: ["budget", "project", "invoices", "client"],
  admin: ["budget", "project", "invoices", "client"],
  estimator: ["budget", "calculate", "client", "agenda"],
  sales: ["client", "agenda", "project", "invoices"],
  supervisor: ["project", "tasks", "agenda", "calculate"],
  member: ["tasks", "agenda", "calculate", "client"],
};

const QUICK_ACTION_CAPABILITY: Record<QuickActionId, Capability> = {
  calculate: "calculations.use",
  budget: "budgets.view",
  project: "projects.view",
  client: "clients.view",
  agenda: "agenda.use",
  tasks: "tasks.mine",
  invoices: "invoices.view",
};

export function quickActionsFor(
  role: CompanyRole | null | undefined
): QuickActionId[] {
  if (!role) return [];
  return HOME_QUICK_ACTIONS[role].filter((id) =>
    can(role, QUICK_ACTION_CAPABILITY[id])
  );
}

export const HOME_FOCUS: Record<CompanyRole, string> = {
  owner: "Resumen de tu empresa: obras, cobros y equipo.",
  admin: "Resumen de la empresa: obras, cobros y equipo.",
  estimator: "Tus presupuestos y cálculos, listos para cotizar.",
  sales: "Tus clientes, visitas y cobros pendientes.",
  supervisor: "Tus obras, tareas y avances del día.",
  member: "Tus tareas asignadas y la agenda del día.",
};
