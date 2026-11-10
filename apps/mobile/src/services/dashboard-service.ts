import { authenticatedRequest } from "./api";
import { cacheOfflineData, getCachedOfflineData } from "./offline-sync-service";
import type { CompanyDashboard } from "../utils/dashboard";

/** Indicadores del negocio (solo owner/admin). Sin conexión usa la última copia. */
export async function getCompanyDashboard(
  companyId: string
): Promise<{ dashboard: CompanyDashboard | null; fromCache: boolean; error: string | null }> {
  const cacheKey = `dashboard_${companyId}`;
  try {
    const res = await authenticatedRequest<{ dashboard: CompanyDashboard }>(
      `/companies/${companyId}/dashboard`
    );
    await cacheOfflineData(cacheKey, res.dashboard);
    return { dashboard: res.dashboard, fromCache: false, error: null };
  } catch (error) {
    const cached = await getCachedOfflineData<CompanyDashboard>(cacheKey);
    return {
      dashboard: cached ?? null,
      fromCache: Boolean(cached),
      error: error instanceof Error ? error.message : "No se pudieron cargar los indicadores.",
    };
  }
}
