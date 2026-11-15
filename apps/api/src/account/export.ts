import type { PoolClient } from "pg";

import { withUserTransaction } from "../db/with-user-transaction.js";
import {
  generateSignedPhotoUrl,
  generateSignedProfileDocumentUrl
} from "../storage/signed-url.js";
import { loadLegalAcceptances } from "./legal-acceptances.js";

/** Versión del formato del archivo exportado. */
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 2;

/** Vigencia de los enlaces de descarga de archivos incluidos en la exportación. */
export const EXPORT_FILE_LINK_MINUTES = 24 * 60;

const PROFILE_DOCUMENT_TYPES = [
  { column: "doc_id_url", documentType: "identification", label: "Documento de identidad" },
  { column: "doc_operation_notice_url", documentType: "operation_notice", label: "Aviso de operación" },
  { column: "doc_references_url", documentType: "references", label: "Referencias" },
  { column: "doc_address_proof_url", documentType: "address_proof", label: "Comprobante de domicilio" }
] as const;

type ExportedFile = {
  kind:
    | "profile_document"
    | "profile_media"
    | "job_request_photo"
    | "job_request_message_photo"
    | "project_photo";
  label: string;
  id: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
  downloadUrl: string;
};

type Row = Record<string, unknown>;

function joinUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return value === null || value === undefined || !Number.isFinite(numeric)
    ? null
    : numeric;
}

/**
 * Índice de los archivos del usuario con enlaces firmados de 24 horas. Las
 * rutas internas del almacenamiento no salen en el archivo exportado.
 */
async function buildFileIndex(
  userId: string,
  origin: string,
  profile: Row | null,
  jobRequestPhotos: Row[],
  jobRequestMessages: Row[],
  projectPhotos: Row[]
): Promise<ExportedFile[]> {
  const files: ExportedFile[] = [];

  for (const document of PROFILE_DOCUMENT_TYPES) {
    const expected = `profile-documents/${userId}/${document.documentType}`;
    const stored = profile?.[document.column];
    if (typeof stored === "string" && stored.trim() === expected) {
      files.push({
        kind: "profile_document",
        label: document.label,
        id: document.documentType,
        mimeType: null,
        sizeBytes: null,
        createdAt: null,
        downloadUrl: joinUrl(
          origin,
          await generateSignedProfileDocumentUrl(
            userId,
            document.documentType,
            EXPORT_FILE_LINK_MINUTES
          )
        )
      });
    }
  }

  if (typeof profile?.avatar_url === "string" && profile.avatar_url.trim()) {
    files.push({
      kind: "profile_media",
      label: "Foto de perfil",
      id: "avatar",
      mimeType: null,
      sizeBytes: null,
      createdAt: null,
      downloadUrl: joinUrl(origin, `/storage/public/profile-media/${userId}/avatar`)
    });
  }

  if (typeof profile?.company_logo_url === "string" && profile.company_logo_url.trim()) {
    files.push({
      kind: "profile_media",
      label: "Logo del perfil profesional",
      id: "company-logo",
      mimeType: null,
      sizeBytes: null,
      createdAt: null,
      downloadUrl: joinUrl(origin, `/storage/public/profile-media/${userId}/company-logo`)
    });
  }

  for (const photo of jobRequestPhotos) {
    if (typeof photo.id !== "string" || typeof photo.storage_path !== "string") continue;
    files.push({
      kind: "job_request_photo",
      label: "Foto de petición de trabajo",
      id: photo.id,
      mimeType: typeof photo.mime_type === "string" ? photo.mime_type : null,
      sizeBytes: asNumber(photo.file_size),
      createdAt: asIso(photo.created_at),
      downloadUrl: joinUrl(
        origin,
        await generateSignedPhotoUrl(photo.id, photo.storage_path, EXPORT_FILE_LINK_MINUTES)
      )
    });
  }

  for (const message of jobRequestMessages) {
    if (typeof message.id !== "string" || typeof message.photo_storage_path !== "string") continue;
    files.push({
      kind: "job_request_message_photo",
      label: "Foto enviada en una conversación",
      id: message.id,
      mimeType: typeof message.photo_mime_type === "string" ? message.photo_mime_type : null,
      sizeBytes: null,
      createdAt: asIso(message.created_at),
      downloadUrl: joinUrl(
        origin,
        await generateSignedPhotoUrl(message.id, message.photo_storage_path, EXPORT_FILE_LINK_MINUTES)
      )
    });
  }

  for (const photo of projectPhotos) {
    if (typeof photo.id !== "string" || typeof photo.storage_path !== "string") continue;
    files.push({
      kind: "project_photo",
      label: typeof photo.file_name === "string" ? photo.file_name : "Foto de obra",
      id: photo.id,
      mimeType: typeof photo.mime_type === "string" ? photo.mime_type : null,
      sizeBytes: asNumber(photo.file_size),
      createdAt: asIso(photo.created_at),
      downloadUrl: joinUrl(
        origin,
        await generateSignedPhotoUrl(photo.id, photo.storage_path, EXPORT_FILE_LINK_MINUTES)
      )
    });
  }

  return files;
}

/** Quita las rutas internas del almacenamiento de las filas exportadas. */
function withoutStoragePaths(rows: Row[]): Row[] {
  return rows.map(({ storage_path: _path, photo_storage_path: photoPath, ...row }) =>
    photoPath === undefined ? row : { ...row, has_photo: photoPath !== null }
  );
}

export class AccountNotAvailableError extends Error {}

/**
 * Reúne los datos personales del usuario dentro de una transacción con RLS
 * (rol contractor_api y app.user_id), de modo que solo salen las filas que el
 * usuario puede ver.
 */
export async function buildAccountExport(userId: string, origin: string) {
  return withUserTransaction(userId, async (client: PoolClient) => {
    const accountRes = await client.query(
      `SELECT
         account.id,
         account.email,
         account.email_confirmed_at,
         account.last_sign_in_at,
         account.raw_app_meta_data,
         account.raw_user_meta_data,
         account.created_at,
         account.updated_at,
         account.deleted_at
       FROM app_auth.users AS account
       WHERE account.id = app.current_user_id()`
    );

    const profileRes = await client.query(
      `SELECT profile.*
       FROM public.profiles AS profile
       WHERE profile.id = app.current_user_id()`
    );
    const legalAcceptances = await loadLegalAcceptances(client);

    const identitiesRes = await client.query(
      `SELECT
         identity.id,
         identity.provider_id,
         identity.provider,
         identity.identity_data,
         identity.last_sign_in_at,
         identity.created_at,
         identity.updated_at
       FROM app_auth.identities AS identity
       WHERE identity.user_id = app.current_user_id()
       ORDER BY identity.created_at ASC`
    );

    const sessionsRes = await client.query(
      `SELECT
         session.id,
         session.user_agent,
         session.ip_address::text AS ip_address,
         session.created_at,
         session.last_used_at,
         session.expires_at,
         session.revoked_at
       FROM app_auth.sessions AS session
       WHERE session.user_id = app.current_user_id()
       ORDER BY session.created_at DESC`
    );

    const companiesRes = await client.query(
      `SELECT company.*
       FROM public.companies AS company
       WHERE EXISTS (
         SELECT 1
         FROM public.company_members AS membership
         WHERE membership.company_id = company.id
           AND membership.user_id = app.current_user_id()
       )
       OR EXISTS (
         SELECT 1
         FROM public.clients AS customer
         WHERE customer.company_id = company.id
           AND customer.user_id = app.current_user_id()
       )
       ORDER BY company.created_at ASC`
    );

    const membershipsRes = await client.query(
      `SELECT membership.*
       FROM public.company_members AS membership
       WHERE membership.user_id = app.current_user_id()
       ORDER BY membership.created_at ASC`
    );

    const clientsRes = await client.query(
      `SELECT customer.*
       FROM public.clients AS customer
       WHERE customer.user_id = app.current_user_id()
          OR customer.created_by = app.current_user_id()
       ORDER BY customer.created_at ASC`
    );

    const clientAddressesRes = await client.query(
      `SELECT address.*
       FROM public.client_addresses AS address
       WHERE EXISTS (
         SELECT 1
         FROM public.clients AS customer
         WHERE customer.id = address.client_id
           AND customer.company_id = address.company_id
           AND (
             customer.user_id = app.current_user_id()
             OR customer.created_by = app.current_user_id()
           )
       )
       ORDER BY address.created_at ASC`
    );

    const clientContactsRes = await client.query(
      `SELECT contact.*
       FROM public.client_contacts AS contact
       WHERE EXISTS (
         SELECT 1
         FROM public.clients AS customer
         WHERE customer.id = contact.client_id
           AND customer.company_id = contact.company_id
           AND (
             customer.user_id = app.current_user_id()
             OR customer.created_by = app.current_user_id()
           )
       )
       ORDER BY contact.created_at ASC`
    );

    const projectsRes = await client.query(
      `SELECT project.*
       FROM public.projects AS project
       WHERE project.created_by = app.current_user_id()
          OR project.project_manager_id = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.clients AS customer
            WHERE customer.id = project.client_id
              AND customer.company_id = project.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY project.created_at ASC`
    );

    const projectMembershipsRes = await client.query(
      `SELECT membership.*
       FROM public.project_members AS membership
       WHERE membership.user_id = app.current_user_id()
       ORDER BY membership.created_at ASC`
    );

    const budgetsRes = await client.query(
      `SELECT budget.*
       FROM public.budgets AS budget
       WHERE budget.created_by = app.current_user_id()
          OR budget.approved_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.clients AS customer
            WHERE customer.id = budget.client_id
              AND customer.company_id = budget.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY budget.created_at ASC`
    );

    const budgetHistoryRes = await client.query(
      `SELECT history.*
       FROM public.budget_change_history AS history
       WHERE history.performed_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.budgets AS budget
            JOIN public.clients AS customer
              ON customer.id = budget.client_id
             AND customer.company_id = budget.company_id
            WHERE budget.id = history.budget_id
              AND budget.company_id = history.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY history.created_at ASC`
    );

    const savedCalculationsRes = await client.query(
      `SELECT calculation.*
       FROM public.saved_calculations AS calculation
       WHERE calculation.created_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.clients AS customer
            WHERE customer.id = calculation.client_id
              AND customer.company_id = calculation.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY calculation.created_at ASC`
    );

    const invoicesRes = await client.query(
      `SELECT invoice.*
       FROM public.invoices AS invoice
       WHERE invoice.created_by = app.current_user_id()
          OR invoice.issued_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.clients AS customer
            WHERE customer.id = invoice.client_id
              AND customer.company_id = invoice.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY invoice.created_at ASC`
    );

    const invoiceHistoryRes = await client.query(
      `SELECT history.*
       FROM public.invoice_history AS history
       WHERE history.actor_user_id = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.invoices AS invoice
            JOIN public.clients AS customer
              ON customer.id = invoice.client_id
             AND customer.company_id = invoice.company_id
            WHERE invoice.id = history.invoice_id
              AND invoice.company_id = history.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY history.created_at ASC`
    );

    const invoicePaymentsRes = await client.query(
      `SELECT payment.*
       FROM public.invoice_payments AS payment
       WHERE payment.created_by = app.current_user_id()
          OR payment.reversed_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.invoices AS invoice
            JOIN public.clients AS customer
              ON customer.id = invoice.client_id
             AND customer.company_id = invoice.company_id
            WHERE invoice.id = payment.invoice_id
              AND invoice.company_id = payment.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY payment.created_at ASC`
    );

    const invoiceCreditNotesRes = await client.query(
      `SELECT credit_note.*
       FROM public.invoice_credit_notes AS credit_note
       WHERE credit_note.issued_by = app.current_user_id()
          OR credit_note.cancelled_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.invoices AS invoice
            JOIN public.clients AS customer
              ON customer.id = invoice.client_id
             AND customer.company_id = invoice.company_id
            WHERE invoice.id = credit_note.invoice_id
              AND invoice.company_id = credit_note.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY credit_note.created_at ASC`
    );

    const activitiesRes = await client.query(
      `SELECT activity.*
       FROM public.activities AS activity
       WHERE activity.created_by = app.current_user_id()
          OR activity.assigned_user_id = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.clients AS customer
            WHERE customer.id = activity.client_id
              AND customer.company_id = activity.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY activity.created_at ASC`
    );

    const projectTasksRes = await client.query(
      `SELECT task.*
       FROM public.project_tasks AS task
       WHERE task.created_by = app.current_user_id()
          OR task.assigned_user_id = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.projects AS project
            JOIN public.clients AS customer
              ON customer.id = project.client_id
             AND customer.company_id = project.company_id
            WHERE project.id = task.project_id
              AND project.company_id = task.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY task.created_at ASC`
    );

    const projectProgressRes = await client.query(
      `SELECT progress.*
       FROM public.project_progress_history AS progress
       WHERE progress.created_by = app.current_user_id()
          OR EXISTS (
            SELECT 1
            FROM public.projects AS project
            JOIN public.clients AS customer
              ON customer.id = project.client_id
             AND customer.company_id = project.company_id
            WHERE project.id = progress.project_id
              AND project.company_id = progress.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY progress.created_at ASC`
    );

    // Como cliente solo salen las fotos que la empresa compartió en el portal.
    const projectPhotosRes = await client.query(
      `SELECT photo.*
       FROM public.project_photos AS photo
       WHERE photo.created_by = app.current_user_id()
          OR photo.is_private = false AND EXISTS (
            SELECT 1
            FROM public.projects AS project
            JOIN public.clients AS customer
              ON customer.id = project.client_id
             AND customer.company_id = project.company_id
            WHERE project.id = photo.project_id
              AND project.company_id = photo.company_id
              AND customer.user_id = app.current_user_id()
          )
       ORDER BY photo.created_at ASC`
    );

    const notificationsRes = await client.query(
      `SELECT notification.*
       FROM public.notifications AS notification
       WHERE notification.user_id = app.current_user_id()
       ORDER BY notification.created_at ASC`
    );

    const invitationsRes = await client.query(
      `SELECT
         invitation.id,
         invitation.company_id,
         invitation.email,
         invitation.role,
         invitation.invited_by,
         invitation.status,
         invitation.expires_at,
         invitation.created_at,
         invitation.updated_at
       FROM public.company_invitations AS invitation
       WHERE invitation.invited_by = app.current_user_id()
          OR lower(invitation.email) = lower((
            SELECT account.email
            FROM app_auth.users AS account
            WHERE account.id = app.current_user_id()
          ))
       ORDER BY invitation.created_at ASC`
    );

    const auditLogsRes = await client.query(
      `SELECT audit_log.*
       FROM public.admin_audit_logs AS audit_log
       WHERE audit_log.user_id = app.current_user_id()
       ORDER BY audit_log.created_at ASC`
    );

    const catalogOverridesRes = await client.query(
      `SELECT override.*
       FROM public.user_catalog_price_overrides AS override
       WHERE override.user_id = app.current_user_id()
       ORDER BY override.created_at ASC`
    );

    const jobRequestsRes = await client.query(
      `SELECT request.*
       FROM public.job_requests AS request
       WHERE request.requester_id = app.current_user_id()
       ORDER BY request.created_at ASC`
    );

    const jobRequestDetailsRes = await client.query(
      `SELECT detail.*
       FROM public.job_request_details AS detail
       JOIN public.job_requests AS request ON request.id = detail.request_id
       WHERE request.requester_id = app.current_user_id()
       ORDER BY detail.created_at ASC`
    );

    const jobRequestPhotosRes = await client.query(
      `SELECT photo.*
       FROM public.job_request_photos AS photo
       JOIN public.job_requests AS request ON request.id = photo.request_id
       WHERE request.requester_id = app.current_user_id()
       ORDER BY photo.request_id, photo.sort_order, photo.created_at`
    );

    const jobRequestThreadsRes = await client.query(
      `SELECT
         thread.id,
         thread.request_id,
         thread.company_id,
         thread.company_name,
         thread.last_message_at,
         thread.client_last_read_at,
         thread.created_at
       FROM public.job_request_threads AS thread
       JOIN public.job_requests AS request ON request.id = thread.request_id
       WHERE request.requester_id = app.current_user_id()
       ORDER BY thread.created_at ASC`
    );

    const jobRequestMessagesRes = await client.query(
      `SELECT
         message.id,
         message.thread_id,
         message.request_id,
         message.company_id,
         message.sender_side,
         message.body,
         message.photo_storage_path,
         message.photo_mime_type,
         message.created_at
       FROM public.job_request_messages AS message
       JOIN public.job_requests AS request ON request.id = message.request_id
       WHERE request.requester_id = app.current_user_id()
       ORDER BY message.created_at ASC`
    );

    const connectionRequestsRes = await client.query<{ requests: Row[] | null }>(
      `SELECT private.export_own_connection_requests() AS requests`
    );

    const invoiceRequestsRes = await client.query(
      `SELECT invoice_request.*
       FROM public.invoice_requests AS invoice_request
       WHERE invoice_request.requested_by = app.current_user_id()
       ORDER BY invoice_request.created_at ASC`
    );

    const priceContributionsRes = await client.query(
      `SELECT contribution.*
       FROM public.catalog_price_contributions AS contribution
       WHERE contribution.user_id = app.current_user_id()
       ORDER BY contribution.created_at ASC`
    );

    const priceRegionRes = await client.query(
      `SELECT region.region_code, region.created_at, region.updated_at
       FROM public.user_price_regions AS region
       WHERE region.user_id = app.current_user_id()`
    );

    const appSettingsRes = await client.query(
      `SELECT setting.setting_key, setting.value, setting.created_at, setting.updated_at
       FROM public.user_app_settings AS setting
       WHERE setting.user_id = app.current_user_id()
       ORDER BY setting.setting_key ASC`
    );

    // El token push es una credencial del dispositivo: solo se exporta la
    // plataforma y las fechas.
    const pushDevicesRes = await client.query(
      `SELECT token.id, token.device_platform, token.created_at, token.updated_at
       FROM public.user_push_tokens AS token
       WHERE token.user_id = app.current_user_id()
       ORDER BY token.created_at ASC`
    );

    const account = (accountRes.rows[0] ?? null) as Row | null;
    if (!account || account.deleted_at) {
      throw new AccountNotAvailableError("La cuenta no está disponible.");
    }

    const profile = (profileRes.rows[0] ?? null) as Row | null;
    const files = await buildFileIndex(
      userId,
      origin,
      profile,
      jobRequestPhotosRes.rows,
      jobRequestMessagesRes.rows,
      projectPhotosRes.rows
    );

    const exportedAt = new Date();

    return {
      schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
      exportedAt: exportedAt.toISOString(),
      format: {
        description:
          "Copia de tus datos personales en Leuret App (Ley 81 de 2019, derechos de acceso y portabilidad).",
        filesNote:
          "Los enlaces de «files» descargan tus documentos y fotos. Vencen en 24 horas; genera otra exportación si los necesitas después.",
        filesExpireAt: new Date(
          exportedAt.getTime() + EXPORT_FILE_LINK_MINUTES * 60_000
        ).toISOString(),
        controller: "LEURET TECH — privacidad@leurettech.com"
      },
      account,
      profile,
      legalAcceptances,
      authentication: {
        identities: identitiesRes.rows,
        sessions: sessionsRes.rows
      },
      organizations: {
        companies: companiesRes.rows,
        memberships: membershipsRes.rows,
        invitations: invitationsRes.rows
      },
      commercial: {
        clients: clientsRes.rows,
        clientAddresses: clientAddressesRes.rows,
        clientContacts: clientContactsRes.rows,
        projects: projectsRes.rows,
        projectMemberships: projectMembershipsRes.rows,
        budgets: budgetsRes.rows,
        budgetHistory: budgetHistoryRes.rows,
        savedCalculations: savedCalculationsRes.rows,
        invoices: invoicesRes.rows,
        invoiceHistory: invoiceHistoryRes.rows,
        invoicePayments: invoicePaymentsRes.rows,
        invoiceCreditNotes: invoiceCreditNotesRes.rows,
        invoiceRequests: invoiceRequestsRes.rows
      },
      operations: {
        activities: activitiesRes.rows,
        projectTasks: projectTasksRes.rows,
        projectProgress: projectProgressRes.rows,
        projectPhotos: withoutStoragePaths(projectPhotosRes.rows)
      },
      jobRequests: {
        requests: jobRequestsRes.rows,
        addresses: jobRequestDetailsRes.rows,
        photos: withoutStoragePaths(jobRequestPhotosRes.rows),
        conversations: jobRequestThreadsRes.rows,
        messages: withoutStoragePaths(jobRequestMessagesRes.rows)
      },
      connections: {
        clientConnectionRequests: connectionRequestsRes.rows[0]?.requests ?? []
      },
      communications: {
        notifications: notificationsRes.rows,
        pushDevices: pushDevicesRes.rows
      },
      appSettings: appSettingsRes.rows,
      administrativeAuditLogs: auditLogsRes.rows,
      catalog: {
        personalPrices: catalogOverridesRes.rows,
        priceContributions: priceContributionsRes.rows,
        priceRegion: priceRegionRes.rows[0] ?? null
      },
      files
    };
  });
}
