import { authenticatedRequest } from "./api";

export type SalesFigures = {
  quotedCount: number;
  quotedTotal: number;
  approvedCount: number;
  approvedTotal: number;
  invoicedCount: number;
  invoicedTotal: number;
  collectedTotal: number;
};

export type SalesPersonPerformance = {
  userId: string;
  name: string;
  active: boolean;
  months: (SalesFigures & { month: number })[];
  totals: SalesFigures;
  previousYearTotals: SalesFigures;
};

/** Cotizado, aprobado, ejecutado (facturado) y cobrado por persona de ventas. */
export async function getSalesPerformance(
  companyId: string,
  year: number
): Promise<{ people: SalesPersonPerformance[]; error: string | null }> {
  try {
    const res = await authenticatedRequest<{ year: number; people: SalesPersonPerformance[] }>(
      `/companies/${companyId}/sales-performance?year=${year}`
    );
    return { people: res.people, error: null };
  } catch (error) {
    return { people: [], error: error instanceof Error ? error.message : "No se pudo cargar el informe de ventas." };
  }
}
