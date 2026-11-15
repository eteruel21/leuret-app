import { beforeAll, describe, expect, it } from "vitest";

import { adminPool } from "../../db/test-db.js";

/**
 * Prueba la migración 045 con el rol real de la API (contractor_api + RLS).
 * Antes, DELETE /account fallaba aquí: el disparador de aprobación impedía
 * que el propio usuario cambiara profiles.active.
 */

type Json = Record<string, any>;

async function asUser<T>(userId: string, sql: string): Promise<T> {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE contractor_api");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await client.query<{ value: T }>(sql);
    await client.query("COMMIT");
    return result.rows[0]!.value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createActiveUser(email: string, role: "contractor" | "client") {
  const id = (
    await adminPool.query<{ id: string }>(
      `INSERT INTO app_auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id`,
      [email]
    )
  ).rows[0]!.id;
  await adminPool.query(
    `UPDATE public.profiles
     SET active = true, approved_at = now(), role = $2::public.global_user_role,
         first_name = 'Nombre', last_name = 'Apellido', full_name = 'Nombre Apellido',
         phone = '6000-0000', registration_ip = '10.0.0.1'
     WHERE id = $1`,
    [id, role]
  );
  return id;
}

async function createCompany(name: string, ownerId: string) {
  const companyId = (
    await adminPool.query<{ id: string }>(
      `INSERT INTO public.companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      [name, ownerId]
    )
  ).rows[0]!.id;
  await adminPool.query(
    `INSERT INTO public.company_members (company_id, user_id, role, active) VALUES ($1, $2, 'owner', true)`,
    [companyId, ownerId]
  );
  return companyId;
}

async function addMember(companyId: string, userId: string, role: string) {
  await adminPool.query(
    `INSERT INTO public.company_members (company_id, user_id, role, active)
     VALUES ($1, $2, $3::public.company_role, true)`,
    [companyId, userId, role]
  );
}

async function createClientWithProject(companyId: string, createdBy: string, userId: string | null) {
  const clientId = (
    await adminPool.query<{ id: string }>(
      `INSERT INTO public.clients (company_id, first_name, user_id, created_by)
       VALUES ($1, 'Cliente', $2, $3) RETURNING id`,
      [companyId, userId, createdBy]
    )
  ).rows[0]!.id;
  const projectId = (
    await adminPool.query<{ id: string }>(
      `INSERT INTO public.projects (company_id, client_id, name, created_by)
       VALUES ($1, $2, 'Obra', $3) RETURNING id`,
      [companyId, clientId, createdBy]
    )
  ).rows[0]!.id;
  return { clientId, projectId };
}

async function issueInvoice(companyId: string, clientId: string, createdBy: string, issueDate: string) {
  await adminPool.query(
    `INSERT INTO public.invoices (
       company_id, client_id, invoice_number, status, issue_date,
       snapshot_schema_version, snapshot_data, issued_at, created_by
     )
     VALUES ($1, $2, 'FAC-' || substr(md5(random()::text), 1, 8), 'issued', $3::date, 1, '{}'::jsonb, now(), $4)`,
    [companyId, clientId, issueDate, createdBy]
  );
}

describe("Eliminación de cuenta (migración 045)", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  const clientEmail = `del_client_${suffix}@example.com`;
  let clientId: string;
  let ownerId: string;
  let soloContractorId: string;
  let blockedOwnerId: string;
  let teamCompanyId: string;
  let soloCompanyId: string;
  let blockedCompanyId: string;
  let linkedClientId: string;
  let requestId: string;

  beforeAll(async () => {
    clientId = await createActiveUser(clientEmail, "client");
    ownerId = await createActiveUser(`del_owner_${suffix}@example.com`, "contractor");
    soloContractorId = await createActiveUser(`del_solo_${suffix}@example.com`, "contractor");
    blockedOwnerId = await createActiveUser(`del_blocked_${suffix}@example.com`, "contractor");
    const memberId = await createActiveUser(`del_member_${suffix}@example.com`, "contractor");
    await adminPool.query(
      `INSERT INTO app_auth.legal_acceptances (user_id, document_type, document_version, document_updated_at, source)
       VALUES ($1, 'terms', $2, '2026-11-15', 'registration')`,
      [clientId, "1".repeat(64)]
    );

    teamCompanyId = await createCompany(`Equipo ${suffix}`, ownerId);
    await addMember(teamCompanyId, soloContractorId, "estimator");
    soloCompanyId = await createCompany(`Solo ${suffix}`, soloContractorId);
    blockedCompanyId = await createCompany(`Bloqueada ${suffix}`, blockedOwnerId);
    await addMember(blockedCompanyId, memberId, "member");

    await adminPool.query(
      `UPDATE public.profiles SET doc_id_url = 'profile-documents/' || id::text || '/identification' WHERE id = $1`,
      [clientId]
    );

    const linked = await createClientWithProject(teamCompanyId, ownerId, clientId);
    linkedClientId = linked.clientId;
    await issueInvoice(teamCompanyId, linked.clientId, ownerId, "2025-03-10");
    await adminPool.query(
      `INSERT INTO public.project_photos (company_id, project_id, storage_path, file_name, created_by)
       VALUES ($1, $2, $3, 'equipo.jpg', $4)`,
      [teamCompanyId, linked.projectId, `companies/${teamCompanyId}/equipo-${suffix}.jpg`, soloContractorId]
    );

    const soloClient = await createClientWithProject(soloCompanyId, soloContractorId, null);
    await issueInvoice(soloCompanyId, soloClient.clientId, soloContractorId, "2026-06-01");
    await adminPool.query(
      `INSERT INTO public.project_photos (company_id, project_id, storage_path, file_name, created_by)
       VALUES ($1, $2, $3, 'obra.jpg', $4)`,
      [soloCompanyId, soloClient.projectId, `companies/${soloCompanyId}/obra-${suffix}.jpg`, soloContractorId]
    );

    requestId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO public.job_requests (requester_id, requester_first_name, title, description, category, province)
         VALUES ($1, 'Nombre', 'Pintar la sala', 'Necesito pintar la sala y el comedor de la casa', 'Pintura', 'Panamá')
         RETURNING id`,
        [clientId]
      )
    ).rows[0]!.id;
    await adminPool.query(
      `INSERT INTO public.job_request_details (request_id, address_line) VALUES ($1, 'Calle 50, casa 12')`,
      [requestId]
    );
    await adminPool.query(
      `INSERT INTO public.job_request_photos (request_id, storage_path, mime_type, file_size)
       VALUES ($1, $2, 'image/jpeg', 1000)`,
      [requestId, `job-requests/${requestId}/foto.jpg`]
    );
    const threadId = (
      await adminPool.query<{ id: string }>(
        `INSERT INTO public.job_request_threads (request_id, company_id, company_name, started_by)
         VALUES ($1, $2, 'Equipo', $3) RETURNING id`,
        [requestId, teamCompanyId, ownerId]
      )
    ).rows[0]!.id;
    await adminPool.query(
      `INSERT INTO public.job_request_messages (thread_id, request_id, company_id, sender_id, sender_side, body, photo_storage_path, photo_mime_type)
       VALUES ($1, $2, $3, $4, 'client', 'Foto', $5, 'image/jpeg')`,
      [threadId, requestId, teamCompanyId, clientId, `job-requests/${requestId}/messages/m.jpg`]
    );

    await adminPool.query(
      `INSERT INTO public.notifications (company_id, user_id, title, body, type) VALUES ($1, $2, 'Aviso', 'x', 'info')`,
      [teamCompanyId, clientId]
    );
    await adminPool.query(
      `INSERT INTO public.user_push_tokens (user_id, expo_push_token, device_platform) VALUES ($1, $2, 'ios')`,
      [clientId, `ExponentPushToken[${suffix}]`]
    );
    await adminPool.query(
      `INSERT INTO public.company_invitations (company_id, email, role, invited_by, status, expires_at, token_hash)
       VALUES ($1, $2, 'member', $3, 'pending', now() + interval '7 days', $4)`,
      [blockedCompanyId, clientEmail, blockedOwnerId, suffix.toString(16).padStart(64, "a").slice(0, 64)]
    );
    await adminPool.query(
      `INSERT INTO private.client_connection_requests (company_id, client_user_id, requested_by, requested_by_client, status)
       VALUES ($1, $2, $3, false, 'pending')`,
      [blockedCompanyId, clientId, blockedOwnerId]
    );
  });

  it("bloquea al único propietario de una empresa con otros miembros", async () => {
    const preview = await asUser<Json>(blockedOwnerId, "SELECT private.account_deletion_preview() AS value");
    expect(preview.blockers).toEqual([
      expect.objectContaining({ companyId: blockedCompanyId, activeMembers: 1 })
    ]);

    await expect(
      asUser(blockedOwnerId, "SELECT private.delete_own_account() AS value")
    ).rejects.toMatchObject({
      code: "55000",
      hint: "account_deletion_blocked_by_company_ownership"
    });

    const account = await adminPool.query(
      `SELECT deleted_at, email FROM app_auth.users WHERE id = $1`,
      [blockedOwnerId]
    );
    expect(account.rows[0].deleted_at).toBeNull();
    expect(account.rows[0].email).not.toBeNull();
  });

  it("la vista previa del cliente cuenta lo que se elimina y lo que se conserva", async () => {
    const preview = await asUser<Json>(clientId, "SELECT private.account_deletion_preview() AS value");

    expect(preview.blockers).toEqual([]);
    expect(preview.toDelete).toMatchObject({
      jobRequests: 1,
      jobRequestPhotos: 1,
      jobRequestMessages: 1,
      profileDocuments: 1,
      notifications: 1,
      pushDevices: 1,
      pendingInvitations: 1,
      pendingConnectionRequests: 1
    });
    expect(preview.retained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "client_fiscal_documents",
          invoices: 1,
          retainUntil: "2030-12-31"
        })
      ])
    );
  });

  it("elimina la cuenta del cliente con el rol de la API", async () => {
    const result = await asUser<Json>(clientId, "SELECT private.delete_own_account() AS value");

    expect(result.deleted).toMatchObject({
      jobRequests: 1,
      notifications: 1,
      pushDevices: 1,
      clientLinksRemoved: 1,
      invitationsRevoked: 1,
      connectionRequestsCancelled: 1
    });
    expect(result.retentionUntil).toBe("2030-12-31");
    // Documento de identidad, foto de perfil, logo del perfil, foto de la
    // petición y foto del mensaje.
    expect(result.storageObjectsQueued).toBe(5);

    const state = await adminPool.query(
      `SELECT
         (SELECT row_to_json(u) FROM (SELECT email, password_hash, deleted_at FROM app_auth.users WHERE id = $1) u) AS account,
         (SELECT row_to_json(p) FROM (SELECT full_name, phone, active, registration_ip, doc_id_url FROM public.profiles WHERE id = $1) p) AS profile,
         (SELECT count(*)::int FROM public.job_requests WHERE id = $2) AS requests,
         (SELECT count(*)::int FROM app_auth.legal_acceptances WHERE user_id = $1) AS legal_acceptances,
         (SELECT count(*)::int FROM public.job_request_details WHERE request_id = $2) AS addresses,
         (SELECT user_id FROM public.clients WHERE id = $3) AS client_link,
         (SELECT count(*)::int FROM public.invoices WHERE client_id = $3) AS invoices,
         (SELECT array_agg(object_kind ORDER BY object_kind) FROM private.account_deletion_storage_queue WHERE user_id = $1) AS queue,
         (SELECT retention_until::text FROM private.account_deletion_records WHERE user_id = $1) AS retention_until`,
      [clientId, requestId, linkedClientId]
    );
    const row = state.rows[0];

    expect(row.account.email).toBeNull();
    expect(row.account.password_hash).toBeNull();
    expect(row.account.deleted_at).not.toBeNull();
    expect(row.legal_acceptances).toBe(0);
    expect(row.profile).toEqual({
      full_name: null,
      phone: null,
      active: false,
      registration_ip: null,
      doc_id_url: null
    });
    expect(row.requests).toBe(0);
    expect(row.addresses).toBe(0);
    expect(row.client_link).toBeNull();
    // La factura emitida se conserva para la empresa.
    expect(row.invoices).toBe(1);
    expect(row.queue).toEqual([
      "job_request_message_photo",
      "job_request_photo",
      "profile_document",
      "profile_media",
      "profile_media"
    ]);
    expect(row.retention_until).toBe("2030-12-31");

    await expect(
      asUser(clientId, "SELECT private.delete_own_account() AS value")
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("cierra la empresa de un solo miembro y deja el trabajo hecho en otros equipos", async () => {
    const result = await asUser<Json>(soloContractorId, "SELECT private.delete_own_account() AS value");

    expect(result.deleted).toMatchObject({
      companiesClosed: 1,
      membershipsEnded: 1,
      closedCompanyProjectPhotos: 1
    });
    expect(result.retentionUntil).toBe("2031-12-31");

    const state = await adminPool.query(
      `SELECT
         (SELECT active FROM public.companies WHERE id = $2) AS solo_active,
         (SELECT active FROM public.company_members WHERE company_id = $3 AND user_id = $1) AS team_membership,
         (SELECT count(*)::int FROM public.project_photos WHERE company_id = $2) AS solo_photos,
         (SELECT count(*)::int FROM public.project_photos WHERE company_id = $3 AND created_by = $1) AS team_photos,
         (SELECT count(*)::int FROM public.invoices WHERE company_id = $2) AS solo_invoices,
         (SELECT array_agg(object_kind ORDER BY object_kind) FROM private.account_deletion_storage_queue WHERE user_id = $1) AS queue`,
      [soloContractorId, soloCompanyId, teamCompanyId]
    );
    const row = state.rows[0];

    expect(row.solo_active).toBe(false);
    expect(row.team_membership).toBe(false);
    expect(row.solo_photos).toBe(0);
    expect(row.team_photos).toBe(1);
    expect(row.solo_invoices).toBe(1);
    expect(row.queue).toEqual([
      "company_logo",
      "profile_media",
      "profile_media",
      "project_photo"
    ]);
  });

  it("la API no puede leer la constancia de eliminación ni la función interna", async () => {
    await expect(
      asUser(ownerId, "SELECT count(*) AS value FROM private.account_deletion_records")
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(ownerId, `SELECT private.account_deletion_scope('${clientId}'::uuid) AS value`)
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("un usuario no puede desactivarse fuera de la función de eliminación", async () => {
    await expect(
      asUser(ownerId, "UPDATE public.profiles SET active = false WHERE id = app.current_user_id() RETURNING true AS value")
    ).rejects.toMatchObject({ code: "42501" });

    // La marca de la transacción no basta: también hace falta el rol propietario.
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE contractor_api");
      await client.query("SELECT set_config('app.user_id', $1, true)", [ownerId]);
      await client.query("SELECT set_config('app.account_deletion_user_id', $1, true)", [ownerId]);
      await expect(
        client.query("UPDATE public.profiles SET active = false WHERE id = app.current_user_id()")
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const profile = await adminPool.query(`SELECT active FROM public.profiles WHERE id = $1`, [ownerId]);
    expect(profile.rows[0].active).toBe(true);
  });
});
