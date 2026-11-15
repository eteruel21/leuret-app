import { describe, expect, it } from "vitest";

import {
  blockedDeletionMessage,
  deletionConfirmationMessage,
  formatRetentionDate,
  type AccountDeletionPreview,
} from "../account-deletion";

const basePreview: AccountDeletionPreview = {
  canDelete: true,
  blockers: [],
  companiesToClose: [],
  membershipsToEnd: 0,
  toDelete: {},
  retained: [],
  retentionUntil: null,
};

describe("eliminación de cuenta", () => {
  it("formatea la fecha de conservación", () => {
    expect(formatRetentionDate("2030-12-31")).toBe("31 de diciembre de 2030");
    expect(formatRetentionDate("2031-01-05T00:00:00Z")).toBe("5 de enero de 2031");
    expect(formatRetentionDate(null)).toBeNull();
    expect(formatRetentionDate("sin fecha")).toBeNull();
  });

  it("lista las empresas que impiden eliminar la cuenta", () => {
    const message = blockedDeletionMessage([
      { companyId: "1", companyName: "Equipo SA", activeMembers: 2 },
    ]);
    expect(message).toContain("• Equipo SA");
    expect(message).toContain("otro propietario");
  });

  it("resume lo que se elimina, se cierra y se conserva", () => {
    const message = deletionConfirmationMessage({
      ...basePreview,
      toDelete: { jobRequests: 2, notifications: 1, pushDevices: 0 },
      companiesToClose: [{ companyId: "c", companyName: "Mi Taller" }],
      membershipsToEnd: 1,
      retained: [
        {
          category: "client_fiscal_documents",
          title: "Facturas que recibiste como cliente",
          description: "",
          legalBasis: "",
          retainUntil: "2030-12-31",
          counts: { invoices: 1 },
        },
        {
          category: "team_contributions",
          title: "Tu trabajo en equipos que siguen activos",
          description: "",
          legalBasis: "",
          retainUntil: null,
          counts: { projectPhotos: 3 },
        },
      ],
    });

    expect(message).toContain("• 2 peticiones de trabajo");
    expect(message).toContain("• 1 notificación");
    expect(message).not.toContain("dispositivo");
    expect(message).toContain("Se cierra tu empresa sin otros miembros: Mi Taller.");
    expect(message).toContain("Saldrás del equipo de 1 empresa.");
    expect(message).toContain("• Facturas que recibiste como cliente (hasta el 31 de diciembre de 2030)");
    expect(message).toContain("• Tu trabajo en equipos que siguen activos\n");
    expect(message).toContain("exportar tus datos");
  });

  it("sin nada que conservar no muestra esa sección", () => {
    const message = deletionConfirmationMessage(basePreview);
    expect(message).not.toContain("Se conserva");
  });
});
