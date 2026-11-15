import { withUserTransaction } from "../db/with-user-transaction.js";

export async function findUserNotificationsRepo(userId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM public.notifications
        WHERE company_id = $1 AND user_id = app.current_user_id()
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [companyId]
    );
    return result.rows;
  });
}

export async function markNotificationAsReadRepo(userId: string, companyId: string, notificationId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        UPDATE public.notifications
        SET read_at = now()
        WHERE id = $1 AND company_id = $2 AND user_id = app.current_user_id()
        RETURNING *
      `,
      [notificationId, companyId]
    );
    return result.rows[0] ?? null;
  });
}

export async function createNotificationRepo(
  userId: string,
  companyId: string,
  targetUserId: string,
  title: string,
  body: string,
  type: string = "info",
  entityType?: string | null,
  entityId?: string | null
) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        INSERT INTO public.notifications (
          company_id, user_id, title, body, type, entity_type, entity_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [companyId, targetUserId, title, body, type, entityType ?? null, entityId ?? null]
    );
    return result.rows[0];
  });
}

export async function upsertPushTokenRepo(
  userId: string,
  expoPushToken: string,
  devicePlatform: string = "unknown"
) {
  return withUserTransaction(userId, async (client) => {
    await client.query(
      `
        SELECT private.register_push_token($1, $2)
      `,
      [expoPushToken, devicePlatform]
    );

    return true;
  });
}

export async function deletePushTokenRepo(userId: string, expoPushToken: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        DELETE FROM public.user_push_tokens
        WHERE user_id = app.current_user_id() AND expo_push_token = $1
      `,
      [expoPushToken]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function findUserPushTokensRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{
      id: string;
      user_id: string;
      expo_push_token: string;
      device_platform: string;
    }>(
      `
        SELECT id, user_id, expo_push_token, device_platform
        FROM public.user_push_tokens
        WHERE user_id = app.current_user_id()
          AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = app.current_user_id() AND notifications_opt_in = true
          )
      `
    );
    return result.rows;
  });
}


/**
 * Propietarios y administradores activos de la empresa. Se consulta con la
 * identidad de un miembro de la empresa (quien creó el presupuesto), porque
 * el cliente que responde no puede leer el equipo.
 */
export async function findCompanyManagerIdsRepo(contextUserId: string, companyId: string): Promise<string[]> {
  return withUserTransaction(contextUserId, async (client) => {
    const result = await client.query<{ user_id: string }>(
      `
        SELECT member.user_id
        FROM public.company_members AS member
        WHERE member.company_id = $1
          AND member.active = true
          AND member.role IN ('owner', 'admin')
      `,
      [companyId]
    );
    return result.rows.map((row) => row.user_id);
  });
}

export type InboxSpace = "client" | "company";

export type UserNotificationInput = {
  companyId: string | null;
  space: InboxSpace | null;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
};

export type UserNotificationRow = {
  id: string;
  company_id: string | null;
  space: InboxSpace | null;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/**
 * Guarda un aviso en la bandeja del destinatario. Se ejecuta con la identidad
 * del destinatario (política notifications_insert_own, migración 047).
 */
export async function recordUserNotificationRepo(
  recipientId: string,
  input: UserNotificationInput
): Promise<string> {
  return withUserTransaction(recipientId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO public.notifications (company_id, user_id, title, body, type, space, data)
        VALUES ($1, app.current_user_id(), left($2, 200), left($3, 1000), $4, $5, $6::jsonb)
        RETURNING id
      `,
      [input.companyId, input.title, input.body, input.type, input.space, JSON.stringify(input.data)]
    );
    const row = result.rows[0];
    if (!row) throw new Error("No se pudo guardar el aviso.");
    return row.id;
  });
}

/** Condición común: avisos del espacio activo (y de la empresa activa). */
const INBOX_SCOPE_SQL = `
  user_id = app.current_user_id()
  AND (space IS NULL OR space = $1::text)
  AND ($1::text <> 'company' OR company_id IS NULL OR company_id = $2::uuid)
`;

export async function listUserInboxRepo(
  userId: string,
  options: { space: InboxSpace; companyId: string | null; limit: number }
): Promise<{ notifications: UserNotificationRow[]; unread: number }> {
  return withUserTransaction(userId, async (client) => {
    // Consultas en serie: un mismo cliente de pg no ejecuta en paralelo.
    const rows = await client.query<UserNotificationRow>(
      `
        SELECT id, company_id, space, title, body, type, data, read_at, created_at
        FROM public.notifications
        WHERE ${INBOX_SCOPE_SQL}
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [options.space, options.companyId, options.limit]
    );
    const unread = await client.query<{ unread: number }>(
      `
        SELECT count(*)::integer AS unread
        FROM public.notifications
        WHERE ${INBOX_SCOPE_SQL} AND read_at IS NULL
      `,
      [options.space, options.companyId]
    );
    return { notifications: rows.rows, unread: unread.rows[0]?.unread ?? 0 };
  });
}

/** Marca como leídos los avisos indicados del usuario, o todos los del espacio si ids es null. */
export async function markUserNotificationsReadRepo(
  userId: string,
  options: { space: InboxSpace; companyId: string | null; ids: string[] | null }
): Promise<number> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        UPDATE public.notifications
        SET read_at = now()
        WHERE user_id = app.current_user_id()
          AND read_at IS NULL
          AND (
            -- Con ids: esos avisos del usuario (p. ej. al tocar el push).
            id = ANY ($3::uuid[])
            -- Sin ids: todos los del espacio activo.
            OR ($3::uuid[] IS NULL AND ${INBOX_SCOPE_SQL})
          )
      `,
      [options.space, options.companyId, options.ids]
    );
    return result.rowCount ?? 0;
  });
}
