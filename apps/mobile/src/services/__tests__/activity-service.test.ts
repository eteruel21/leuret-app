import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyActivities, fetchCompanyActivity } from "../activity-service";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  save: vi.fn()
}));

vi.mock("@/services/api", () => ({
  authenticatedRequest: mocks.request
}));

vi.mock("@/utils/local-storage", () => ({
  loadLocalData: mocks.load,
  saveLocalData: mocks.save
}));

const serverActivity = {
  id: "activity-1",
  company_id: "company-1",
  client_id: null,
  project_id: null,
  assigned_user_id: null,
  title: "Visita de obra",
  type: "visit",
  status: "scheduled",
  date: "2026-11-10",
  start_time: "09:30:00",
  end_time: "10:30:00",
  address: null,
  notes: null,
  reminder_minutes: 15
};

describe("fetchCompanyActivities - Supabase es la fuente oficial", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.load.mockReset();
    mocks.save.mockReset();
    mocks.load.mockResolvedValue([]);
    mocks.save.mockResolvedValue(undefined);
  });

  it("usa los datos de la API y conserva solo el identificador local de la notificación", async () => {
    mocks.load.mockResolvedValue([{ id: "activity-1", notificationId: "notification-1" }]);
    mocks.request.mockResolvedValue({ activities: [serverActivity] });

    const activities = await fetchCompanyActivities("company-1");

    expect(mocks.request).toHaveBeenCalledWith("/companies/company-1/activities");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: "activity-1",
      title: "Visita de obra",
      time: "09:30",
      notificationId: "notification-1"
    });
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it("si el servidor devuelve cero actividades, no muestra las entradas antiguas", async () => {
    mocks.load.mockResolvedValue([{ id: "stale", notificationId: "old" }]);
    mocks.request.mockResolvedValue({ activities: [] });
    expect(await fetchCompanyActivities("company-1")).toEqual([]);
  });

  it("no disfraza un error de conexión con actividades antiguas", async () => {
    mocks.load.mockResolvedValue([{ id: "stale", notificationId: "old" }]);
    mocks.request.mockRejectedValue(new Error("API no disponible"));

    await expect(fetchCompanyActivities("company-1")).rejects.toThrow("API no disponible");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("no devuelve cache cuando los permisos no autorizan la lectura", async () => {
    mocks.request.mockRejectedValue(new Error("403: acceso denegado"));
    await expect(fetchCompanyActivities("company-1")).rejects.toThrow("acceso denegado");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("rechaza respuestas incompletas de la API", async () => {
    mocks.request.mockResolvedValue({});
    await expect(fetchCompanyActivities("company-1")).rejects.toThrow("respuesta de agenda inválida");
  });

  it("incluye filtros de proyecto y cliente en la consulta", async () => {
    mocks.request.mockResolvedValue({ activities: [] });
    await fetchCompanyActivities("company-1", {
      projectId: "project-1",
      clientId: "client-1"
    });
    expect(mocks.request).toHaveBeenCalledWith(
      "/companies/company-1/activities?projectId=project-1&clientId=client-1"
    );
  });

  it("al editar lee la actividad del servidor por id, con su obra y fechas reales", async () => {
    mocks.load.mockResolvedValue([{ id: "activity-1", notificationId: "notification-1" }]);
    mocks.request.mockResolvedValue({
      activity: {
        ...serverActivity,
        project_id: "project-1",
        project: { id: "project-1", name: "Casa Pérez", project_code: null },
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-02T10:00:00Z"
      }
    });

    const activity = await fetchCompanyActivity("company-1", "activity-1");

    expect(mocks.request).toHaveBeenCalledWith("/companies/company-1/activities/activity-1");
    expect(activity).toMatchObject({
      projectId: "project-1",
      projectName: "Casa Pérez",
      notificationId: "notification-1",
      createdAt: "2026-11-01T10:00:00Z",
      updatedAt: "2026-11-02T10:00:00Z"
    });
  });

  it("si no se puede leer la actividad, el error llega a la pantalla", async () => {
    mocks.request.mockRejectedValue(new Error("Actividad no encontrada."));
    await expect(fetchCompanyActivity("company-1", "activity-9")).rejects.toThrow("Actividad no encontrada.");
  });
});
