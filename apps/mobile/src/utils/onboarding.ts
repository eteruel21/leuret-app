/** Primeros pasos de una empresa nueva (lógica pura, sin React). */

export type OnboardingFacts = {
  hasBillingDetails: boolean;
  teamSize: number;
  pendingInvitations: number;
  clientCount: number;
  budgetCount: number;
};

export type OnboardingStep = {
  id: "billing" | "team" | "client" | "budget";
  title: string;
  detail: string;
  done: boolean;
  href: string;
};

export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
  return [
    {
      id: "billing",
      title: "Completa los datos de facturación",
      detail: "Razón social y RUC para que tus facturas salgan completas.",
      done: facts.hasBillingDetails,
      href: "/facturas/settings",
    },
    {
      id: "team",
      title: "Invita a tu equipo",
      detail: "Supervisores, ventas o equipo de campo, cada uno con su rol.",
      done: facts.teamSize > 1 || facts.pendingInvitations > 0,
      href: "/equipo",
    },
    {
      id: "client",
      title: "Agrega tu primer cliente",
      detail: "Con su correo, para enviarle presupuestos y recordatorios.",
      done: facts.clientCount > 0,
      href: "/(tabs)/clientes",
    },
    {
      id: "budget",
      title: "Crea tu primer presupuesto",
      detail: "Desde una obra o con las calculadoras.",
      done: facts.budgetCount > 0,
      href: "/presupuestos",
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((step) => step.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}

export function hasBillingDetails(company: { legal_name: string | null; tax_id: string | null } | null): boolean {
  return Boolean(company?.legal_name?.trim() && company?.tax_id?.trim());
}
