import { authenticatedRequest } from "./api";
import { cacheOfflineData, getCachedOfflineData } from "./offline-sync-service";
import type { RoleDashboard } from "../utils/role-dashboard";

/** Indicadores para Ventas y Presupuestista. Sin conexión usa la última copia. */
export async function getRoleDashboard(
  companyId: string
): Promise<{ dashboard: RoleDashboard | null; fromCache: boolean; error: string | null }> {
  const cacheKey = `role_dashboard_${companyId}`;
  try {
    const res = await authenticatedRequest<{ dashboard: RoleDashboard }>(`/companies/${companyId}/dashboard/role`);
    await cacheOfflineData(cacheKey, res.dashboard);
    return { dashboard: res.dashboard, fromCache: false, error: null };
  } catch (error) {
    const cached = await getCachedOfflineData<RoleDashboard>(cacheKey);
    return {
      dashboard: cached ?? null,
      fromCache: Boolean(cached),
      error: error instanceof Error ? error.message : "No se pudieron cargar los indicadores.",
    };
  }
}
