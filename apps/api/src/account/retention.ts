/**
 * Categorías que se conservan al eliminar una cuenta y su fundamento.
 *
 * La base de datos (private.account_deletion_scope) devuelve los conteos y la
 * fecha límite; aquí se agregan los textos que ve la persona. El plazo fiscal
 * es de cinco años contados desde el 31 de diciembre del año del último
 * documento (ITBMS: Código Fiscal art. 1057-V, parágrafo 18; registros
 * contables y documentación de respaldo: Ley 52 de 2016, modificada por la
 * Ley 254 de 2021). Revisar con asesoría legal si cambia la normativa.
 */

export type RetainedCategoryCode =
  | "client_fiscal_documents"
  | "closed_company_fiscal_documents"
  | "closed_company_records"
  | "company_client_records"
  | "team_contributions"
  | "security_records";

export type RawRetainedCategory = {
  category: RetainedCategoryCode | string;
  retainUntil: string | null;
  [count: string]: unknown;
};

export type AccountDeletionScope = {
  blockers: Array<{
    companyId: string;
    companyName: string;
    activeMembers: number;
  }>;
  companiesToClose: Array<{
    companyId: string;
    companyName: string;
  }>;
  membershipsToEnd: number;
  toDelete: Record<string, number>;
  retained: RawRetainedCategory[];
  retentionUntil: string | null;
};

export type RetainedCategory = {
  category: string;
  title: string;
  description: string;
  legalBasis: string;
  retainUntil: string | null;
  counts: Record<string, number>;
};

const FISCAL_BASIS =
  "Obligación legal de conservar facturas y documentos contables por al menos cinco años desde el cierre del año (Código Fiscal, art. 1057-V; Ley 52 de 2016). Ley 81 de 2019: tratamiento por obligación legal.";

const CATEGORY_TEXTS: Record<
  RetainedCategoryCode,
  { title: string; description: string; legalBasis: string }
> = {
  client_fiscal_documents: {
    title: "Facturas que recibiste como cliente",
    description:
      "Las facturas emitidas a tu nombre, sus notas de crédito y pagos quedan bloqueadas: solo la empresa emisora puede consultarlas para cumplir sus obligaciones. Se eliminan o anonimizan al vencer el plazo.",
    legalBasis: FISCAL_BASIS
  },
  closed_company_fiscal_documents: {
    title: "Facturas de tus empresas",
    description:
      "Tus empresas sin otros miembros se cierran. Sus facturas, notas de crédito, pagos y los presupuestos, obras y clientes que las respaldan se conservan restringidos, sin acceso desde la app, hasta que venza el plazo legal.",
    legalBasis: FISCAL_BASIS
  },
  closed_company_records: {
    title: "Registros de tus empresas",
    description:
      "Tus empresas sin otros miembros se cierran. Sus presupuestos, obras y clientes (sin facturas emitidas) quedan inactivos y restringidos mientras pueda haber una reclamación; después se eliminan.",
    legalBasis:
      "Formulación, ejercicio o defensa de reclamaciones (Ley 81 de 2019 y Decreto Ejecutivo 285 de 2021)."
  },
  company_client_records: {
    title: "Tu ficha de cliente en otras empresas",
    description:
      "Cada empresa conserva la ficha con la que te atendió (presupuestos, obras y facturas), porque es su propio registro comercial. Se corta el vínculo con tu cuenta y pierdes el acceso al portal.",
    legalBasis:
      "Cada empresa es responsable de sus registros comerciales y fiscales; para ejercer tus derechos sobre ellos, escribe a la empresa."
  },
  team_contributions: {
    title: "Tu trabajo en equipos que siguen activos",
    description:
      "Las fotos de obra, presupuestos y tareas que hiciste como miembro de otra empresa siguen siendo de esa empresa. Tu nombre deja de aparecer porque el perfil se anonimiza.",
    legalBasis:
      "Recursos de la empresa con una finalidad vigente (Política de retención, sección 2)."
  },
  security_records: {
    title: "Registros de seguridad",
    description:
      "La bitácora de auditoría y las sesiones anonimizadas (sin IP ni dispositivo) se conservan para investigar incidentes y prevenir fraude.",
    legalBasis:
      "Seguridad del servicio y defensa de reclamaciones (Ley 81 de 2019, deber de seguridad)."
  }
};

function numericCounts(raw: RawRetainedCategory): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === "category" || key === "retainUntil") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      counts[key] = numeric;
    }
  }

  return counts;
}

function hasAnyCount(counts: Record<string, number>): boolean {
  return Object.values(counts).some((value) => value > 0);
}

export function describeRetainedCategories(
  raw: RawRetainedCategory[] | null | undefined
): RetainedCategory[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    const texts = CATEGORY_TEXTS[item.category as RetainedCategoryCode];
    const counts = numericCounts(item);

    if (!texts || !hasAnyCount(counts)) {
      return [];
    }

    return [{
      category: item.category,
      title: texts.title,
      description: texts.description,
      legalBasis: texts.legalBasis,
      retainUntil: item.retainUntil ?? null,
      counts
    }];
  });
}

export function buildDeletionPreview(scope: AccountDeletionScope) {
  return {
    canDelete: scope.blockers.length === 0,
    blockers: scope.blockers,
    companiesToClose: scope.companiesToClose,
    membershipsToEnd: Number(scope.membershipsToEnd ?? 0),
    toDelete: scope.toDelete,
    retained: describeRetainedCategories(scope.retained),
    retentionUntil: scope.retentionUntil
  };
}
