import { authenticatedRequest } from "./api";
import {
  cacheOfflineData,
  enqueueOfflineAction,
  getCachedOfflineData,
  getOfflineQueue,
  isRetryableOfflineError
} from "./offline-sync-service";

export type ProjectTaskStatus = "todo" | "in_progress" | "review" | "completed";
export type ProjectTaskPriority = "low" | "medium" | "high" | "urgent";

export type ProjectTask = {
  id: string;
  company_id: string;
  project_id: string;
  assigned_user_id: string | null;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: {
    id: string;
    email: string;
  } | null;
  is_pending_sync?: boolean;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  assignedUserId?: string | null;
  status?: ProjectTaskStatus;
  priority?: ProjectTaskPriority;
  dueDate?: string | null;
};

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Tareas de la obra. Sin conexión usa la última copia y lo indica (fromCache). */
export async function listProjectTasksResult(
  companyId: string,
  projectId: string
): Promise<{ tasks: ProjectTask[]; fromCache: boolean; error: string | null }> {
  const cacheKey = `tasks_${companyId}_${projectId}`;
  try {
    const res = await authenticatedRequest<{ tasks: ProjectTask[] }>(
      `/companies/${companyId}/projects/${projectId}/tasks`
    );
    // Las tareas creadas sin conexión siguen visibles mientras su acción
    // siga en la cola; al sincronizarse llegan del servidor.
    const queued = new Set((await getOfflineQueue()).map((action) => `off_task_${action.id}`));
    const cached = (await getCachedOfflineData<ProjectTask[]>(cacheKey)) ?? [];
    const pending = cached.filter((task) => task.is_pending_sync && queued.has(task.id));
    const tasks = [...res.tasks, ...pending];
    await cacheOfflineData(cacheKey, tasks);
    return { tasks, fromCache: false, error: null };
  } catch (error) {
    const cached = await getCachedOfflineData<ProjectTask[]>(cacheKey);
    return {
      tasks: cached ?? [],
      fromCache: true,
      error: errorMessage(error, "No se pudieron cargar las tareas.")
    };
  }
}

export async function listProjectTasks(companyId: string, projectId: string): Promise<ProjectTask[]> {
  return (await listProjectTasksResult(companyId, projectId)).tasks;
}

/** Una tarea creada sin conexión aún no existe en el servidor. */
export function isUnsyncedTask(task: Pick<ProjectTask, "id" | "is_pending_sync">): boolean {
  return Boolean(task.is_pending_sync) || task.id.startsWith("off_task_");
}

export type MyTask = ProjectTask & {
  project: {
    id: string;
    name: string;
    project_code: string | null;
    status: string;
  };
};

/** Tareas asignadas al usuario en la empresa (vista "Mis tareas"). */
export async function listMyTasks(
  companyId: string,
  status: "open" | "all" = "open"
): Promise<{ tasks: MyTask[]; fromCache: boolean }> {
  const cacheKey = `my_tasks_${companyId}_${status}`;
  try {
    const res = await authenticatedRequest<{ tasks: MyTask[] }>(
      `/companies/${companyId}/tasks/mine?status=${status}`
    );
    await cacheOfflineData(cacheKey, res.tasks);
    return { tasks: res.tasks, fromCache: false };
  } catch {
    const cached = await getCachedOfflineData<MyTask[]>(cacheKey);
    return { tasks: cached ?? [], fromCache: true };
  }
}

export async function createProjectTask(
  companyId: string,
  projectId: string,
  input: CreateTaskInput
): Promise<ProjectTask | null> {
  const endpoint = `/companies/${companyId}/projects/${projectId}/tasks`;
  try {
    const res = await authenticatedRequest<{ task: ProjectTask }>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
    return res.task;
  } catch (error) {
    if (!isRetryableOfflineError(error)) return null;
    const action = await enqueueOfflineAction({
      type: "CREATE_TASK",
      endpoint,
      method: "POST",
      body: input as unknown as Record<string, unknown>
    });

    const optimisticTask: ProjectTask = {
      id: `off_task_${action.id}`,
      company_id: companyId,
      project_id: projectId,
      assigned_user_id: input.assignedUserId || null,
      title: input.title,
      description: input.description || null,
      status: input.status || "todo",
      priority: input.priority || "medium",
      due_date: input.dueDate || null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pending_sync: true
    };

    const cacheKey = `tasks_${companyId}_${projectId}`;
    const cached = (await getCachedOfflineData<ProjectTask[]>(cacheKey)) ?? [];
    await cacheOfflineData(cacheKey, [...cached, optimisticTask]);

    return optimisticTask;
  }
}

export async function updateProjectTask(
  companyId: string,
  projectId: string,
  taskId: string,
  input: Partial<CreateTaskInput>
): Promise<{ task: ProjectTask | null; error: string | null }> {
  if (taskId.startsWith("off_task_")) {
    return { task: null, error: "Esta tarea se creó sin conexión. Podrás cambiarla cuando se sincronice." };
  }
  try {
    const res = await authenticatedRequest<{ task: ProjectTask }>(
      `/companies/${companyId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PUT",
        body: JSON.stringify(input)
      }
    );
    return { task: res.task, error: null };
  } catch (error) {
    return { task: null, error: errorMessage(error, "No se pudo actualizar la tarea.") };
  }
}

export async function deleteProjectTask(
  companyId: string,
  projectId: string,
  taskId: string
): Promise<{ ok: boolean; error: string | null }> {
  if (taskId.startsWith("off_task_")) {
    return { ok: false, error: "Esta tarea se creó sin conexión. Podrás eliminarla cuando se sincronice." };
  }
  try {
    await authenticatedRequest(
      `/companies/${companyId}/projects/${projectId}/tasks/${taskId}`,
      { method: "DELETE" }
    );
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "No se pudo eliminar la tarea.") };
  }
}
