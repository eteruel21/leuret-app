import {
  createRemoteActivity,
  deleteRemoteActivity,
  fetchCompanyActivities,
  fetchCompanyActivity,
  updateRemoteActivity
} from "@/services/activity-service";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled";

export type AppointmentType =
  | "visit"
  | "meeting"
  | "work"
  | "payment"
  | "other";

export type Appointment = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  date: string;
  time: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  address: string;
  notes: string;
  reminderMinutes: number;
  /** Obra vinculada (se conserva al editar). */
  projectId?: string;
  projectName?: string;
  /** Recordatorio local del dispositivo (no se guarda en el servidor). */
  notificationId: string;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentInput = Omit<Appointment, "id" | "createdAt" | "updatedAt" | "projectName">;

/**
 * La agenda vive en PostgreSQL (`/companies/:id/activities`). En el
 * dispositivo solo queda el id del recordatorio local de cada actividad.
 * (Antes, sin empresa activa, se guardaba solo en el teléfono.)
 */
export async function getAppointments(companyId: string, projectId?: string): Promise<Appointment[]> {
  const items = await fetchCompanyActivities(companyId, { projectId });
  return [...items].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

export async function getAppointmentById(id: string, companyId: string): Promise<Appointment> {
  return fetchCompanyActivity(companyId, id);
}

export async function saveAppointment(
  data: AppointmentInput,
  id: string | undefined,
  companyId: string,
  projectId?: string
): Promise<Appointment> {
  if (id) return updateRemoteActivity(companyId, id, data);
  return createRemoteActivity(companyId, data, projectId);
}

export async function deleteAppointment(id: string, companyId: string): Promise<Appointment[]> {
  await deleteRemoteActivity(companyId, id);
  return getAppointments(companyId);
}
