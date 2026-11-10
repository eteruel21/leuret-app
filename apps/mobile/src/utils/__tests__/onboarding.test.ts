import { describe, expect, it } from "vitest";

import { hasBillingDetails, onboardingProgress, onboardingSteps } from "../onboarding";

const empty = { hasBillingDetails: false, teamSize: 1, pendingInvitations: 0, clientCount: 0, budgetCount: 0 };

describe("guía de arranque", () => {
  it("una empresa nueva tiene los 4 pasos pendientes", () => {
    const steps = onboardingSteps(empty);
    expect(steps.map((step) => step.id)).toEqual(["billing", "team", "client", "budget"]);
    expect(onboardingProgress(steps)).toEqual({ done: 0, total: 4, complete: false });
  });

  it("una invitación enviada cuenta como equipo invitado", () => {
    const steps = onboardingSteps({ ...empty, pendingInvitations: 1 });
    expect(steps.find((step) => step.id === "team")?.done).toBe(true);
  });

  it("se completa cuando están todos los pasos", () => {
    const steps = onboardingSteps({ hasBillingDetails: true, teamSize: 3, pendingInvitations: 0, clientCount: 2, budgetCount: 1 });
    expect(onboardingProgress(steps).complete).toBe(true);
  });

  it("los datos de facturación requieren razón social y RUC", () => {
    expect(hasBillingDetails({ legal_name: "Obras SA", tax_id: "8-1-1" })).toBe(true);
    expect(hasBillingDetails({ legal_name: "Obras SA", tax_id: " " })).toBe(false);
    expect(hasBillingDetails(null)).toBe(false);
  });
});
