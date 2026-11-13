import { describe, expect, it } from "vitest";

import {
  budgetRangeLabel,
  clientRequestState,
  contractorRequestState,
  daysLeft,
  locationLabel,
  parseAmount,
  timeAgo,
  validateJobRequestForm,
} from "../job-requests";

const validForm = {
  title: "Instalar tomacorrientes",
  description: "Seis tomacorrientes dobles en la sala y la cocina.",
  category: "Electricidad",
  province: "Panamá",
  addressLine: "Calle 5, casa 22",
  budgetMin: "",
  budgetMax: "400",
};

describe("peticiones de trabajo", () => {
  it("valida el formulario", () => {
    expect(validateJobRequestForm(validForm)).toBeNull();
    expect(validateJobRequestForm({ ...validForm, title: "Hola" })).toMatch(/título/);
    expect(validateJobRequestForm({ ...validForm, category: null })).toMatch(/tipo de trabajo/);
    expect(validateJobRequestForm({ ...validForm, description: "Corto" })).toMatch(/20 caracteres/);
    expect(validateJobRequestForm({ ...validForm, addressLine: "" })).toMatch(/dirección/);
    expect(validateJobRequestForm({ ...validForm, budgetMin: "500", budgetMax: "100" })).toMatch(/mínimo/);
    expect(validateJobRequestForm({ ...validForm, budgetMax: "mucho" })).toMatch(/número/);
  });

  it("interpreta montos", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("1,500.50")).toBe(1500.5);
    expect(parseAmount("$300")).toBe(300);
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("-5")).toBeNaN();
  });

  it("describe el rango de presupuesto y la ubicación", () => {
    expect(budgetRangeLabel(null, null)).toBeNull();
    expect(budgetRangeLabel(null, 400)).toMatch(/^Hasta/);
    expect(budgetRangeLabel(100, null)).toMatch(/^Desde/);
    expect(locationLabel({ province: "Panamá", district: "San Miguelito", corregimiento: null })).toBe("San Miguelito, Panamá");
  });

  it("traduce estados para cada lado", () => {
    expect(clientRequestState("open").label).toBe("Recibiendo presupuestos");
    expect(clientRequestState("full").tone).toBe("warning");
    expect(contractorRequestState({ effectiveStatus: "awarded", quoteStatus: "approved" }).label).toBe("¡Te eligieron!");
    expect(contractorRequestState({ effectiveStatus: "awarded", quoteStatus: "sent" }).label).toBe("Presupuesto enviado");
    expect(contractorRequestState({ effectiveStatus: "awarded", quoteStatus: null }).label).toBe("Adjudicada a otra empresa");
    expect(contractorRequestState({ effectiveStatus: "open", quoteStatus: null }).label).toBe("Abierta");
  });

  it("calcula tiempos relativos", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(timeAgo("2026-11-12T11:58:00Z", now)).toBe("hace 2 min");
    expect(timeAgo("2026-11-12T09:00:00Z", now)).toBe("hace 3 h");
    expect(timeAgo("2026-11-10T12:00:00Z", now)).toBe("hace 2 días");
    expect(daysLeft("2026-11-15T12:00:00Z", now)).toBe(3);
    expect(daysLeft("2026-11-01T12:00:00Z", now)).toBe(0);
  });
});
