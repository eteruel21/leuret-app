/**
 * Textos de la eliminación de cuenta a partir de la vista previa de la API
 * (`GET /account/deletion-preview`). Sin dependencias de React Native para
 * poder probarlo.
 */

export type AccountDeletionBlocker = {
  companyId: string;
  companyName: string;
  activeMembers: number;
};

export type RetainedCategory = {
  category: string;
  title: string;
  description: string;
  legalBasis: string;
  retainUntil: string | null;
  counts: Record<string, number>;
};

export type AccountDeletionPreview = {
  canDelete: boolean;
  blockers: AccountDeletionBlocker[];
  companiesToClose: { companyId: string; companyName: string }[];
  membershipsToEnd: number;
  toDelete: Record<string, number>;
  retained: RetainedCategory[];
  retentionUntil: string | null;
};

const DELETE_LABELS: Array<[key: string, singular: string, plural: string]> = [
  ["legalAcceptances", "constancia legal", "constancias legales"],
  ["jobRequests", "petición de trabajo (con dirección, fotos y conversaciones)", "peticiones de trabajo (con dirección, fotos y conversaciones)"],
  ["profileDocuments", "documento personal", "documentos personales"],
  ["notifications", "notificación", "notificaciones"],
  ["personalPrices", "precio personal del catálogo", "precios personales del catálogo"],
  ["pendingPriceContributions", "aporte de precio pendiente", "aportes de precio pendientes"],
  ["pendingConnectionRequests", "solicitud de vinculación pendiente", "solicitudes de vinculación pendientes"],
  ["pendingInvitations", "invitación pendiente", "invitaciones pendientes"],
  ["pushDevices", "dispositivo con notificaciones", "dispositivos con notificaciones"]
];

/** «31 de diciembre de 2030» a partir de «2030-12-31». */
export function formatRetentionDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const month = months[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])} de ${month} de ${match[1]}`;
}

export function blockedDeletionMessage(blockers: AccountDeletionBlocker[]): string {
  const names = blockers.map((blocker) => `• ${blocker.companyName}`).join("\n");
  return (
    "Eres el único propietario de estas empresas, que tienen otros miembros:\n\n" +
    `${names}\n\n` +
    "Antes de eliminar tu cuenta, nombra a otro propietario en Equipo o retira a los demás miembros."
  );
}

export function deletionConfirmationMessage(preview: AccountDeletionPreview): string {
  const deleted = DELETE_LABELS.flatMap(([key, singular, plural]) => {
    const count = Number(preview.toDelete?.[key] ?? 0);
    if (!count) return [];
    return [`• ${count} ${count === 1 ? singular : plural}`];
  });

  const parts: string[] = [
    "Se deshabilitará tu acceso y se anonimizarán tu perfil y tus credenciales. Esta acción no se puede deshacer.",
    "",
    "Se elimina:",
    "• Tu nombre, teléfono, ubicación, foto y documentos",
    ...deleted
  ];

  if (preview.companiesToClose.length > 0) {
    parts.push(
      "",
      `Se cierra${preview.companiesToClose.length === 1 ? " tu empresa" : "n tus empresas"} sin otros miembros: ` +
        preview.companiesToClose.map((company) => company.companyName).join(", ") +
        "."
    );
  }

  if (preview.membershipsToEnd > 0) {
    parts.push(
      "",
      preview.membershipsToEnd === 1
        ? "Saldrás del equipo de 1 empresa."
        : `Saldrás de los equipos de ${preview.membershipsToEnd} empresas.`
    );
  }

  if (preview.retained.length > 0) {
    parts.push("", "Se conserva por obligación legal o porque pertenece a otra empresa:");
    for (const item of preview.retained) {
      const until = formatRetentionDate(item.retainUntil);
      parts.push(`• ${item.title}${until ? ` (hasta el ${until})` : ""}`);
    }
  }

  parts.push("", "Te recomendamos exportar tus datos antes de continuar.");
  return parts.join("\n");
}
