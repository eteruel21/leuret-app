import { authenticatedRequest } from "./api";
import {
  cacheOfflineData,
  enqueueOfflineAction,
  getCachedOfflineData,
  getOfflineQueue,
  isRetryableOfflineError
} from "./offline-sync-service";

export type ProjectProgressHistoryRecord = {
  id: string;
  company_id: string;
  project_id: string;
  progress_percentage: number;
  previous_percentage: number;
  notes: string | null;
  created_at: string;
  created_by_user?: {
    id: string;
    email: string;
  } | null;
  is_pending_sync?: boolean;
};

/** Historial de avance. Sin conexión usa la última copia y lo indica (fromCache). */
export async function listProjectProgressHistoryResult(
  companyId: string,
  projectId: string
): Promise<{ history: ProjectProgressHistoryRecord[]; fromCache: boolean; error: string | null }> {
  const cacheKey = `progress_history_${companyId}_${projectId}`;
  try {
    const res = await authenticatedRequest<{ history: ProjectProgressHistoryRecord[] }>(
      `/companies/${companyId}/projects/${projectId}/progress-history`
    );
    const queued = new Set((await getOfflineQueue()).map((action) => `off_prog_${action.id}`));
    const cached = (await getCachedOfflineData<ProjectProgressHistoryRecord[]>(cacheKey)) ?? [];
    const pending = cached.filter((record) => record.is_pending_sync && queued.has(record.id));
    const history = [...pending, ...res.history];
    await cacheOfflineData(cacheKey, history);
    return { history, fromCache: false, error: null };
  } catch (error) {
    const cached = await getCachedOfflineData<ProjectProgressHistoryRecord[]>(cacheKey);
    return {
      history: cached ?? [],
      fromCache: true,
      error: error instanceof Error && error.message ? error.message : "No se pudo cargar el historial de avance."
    };
  }
}

export async function listProjectProgressHistory(
  companyId: string,
  projectId: string
): Promise<ProjectProgressHistoryRecord[]> {
  return (await listProjectProgressHistoryResult(companyId, projectId)).history;
}

export async function recordProjectProgressHistory(
  companyId: string,
  projectId: string,
  progressPercentage: number,
  notes?: string | null
): Promise<ProjectProgressHistoryRecord | null> {
  const endpoint = `/companies/${companyId}/projects/${projectId}/progress-history`;
  const body = {
    progressPercentage,
    notes: notes || null
  };

  try {
    const res = await authenticatedRequest<{ record: ProjectProgressHistoryRecord }>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );
    return res.record;
  } catch (error) {
    if (!isRetryableOfflineError(error)) return null;
    // Si no hay red, encolar en el almacenamiento local y retornar registro optimista
    const action = await enqueueOfflineAction({
      type: "RECORD_PROGRESS",
      endpoint,
      method: "POST",
      body
    });

    const optimisticRecord: ProjectProgressHistoryRecord = {
      id: `off_prog_${action.id}`,
      company_id: companyId,
      project_id: projectId,
      progress_percentage: progressPercentage,
      previous_percentage: 0,
      notes: notes || null,
      created_at: new Date().toISOString(),
      is_pending_sync: true
    };

    const cacheKey = `progress_history_${companyId}_${projectId}`;
    const cached = (await getCachedOfflineData<ProjectProgressHistoryRecord[]>(cacheKey)) ?? [];
    await cacheOfflineData(cacheKey, [optimisticRecord, ...cached]);

    return optimisticRecord;
  }
}

