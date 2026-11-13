import { withUserTransaction } from "../db/with-user-transaction.js";
import type { CreateJobRequestInput, FeedQuery } from "./schemas.js";

/**
 * Peticiones de trabajo. Las lecturas pasan por RLS (migración 042) y las
 * escrituras por funciones SECURITY DEFINER con reglas explícitas.
 */

export type JobRequestPhotoRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
};

export type JobRequestMessageRow = {
  id: string;
  sender_side: "client" | "company";
  sender_id: string | null;
  sender_name: string | null;
  body: string | null;
  photo_storage_path: string | null;
  created_at: string;
};

// Estado que ve cada lado. «open» se divide en «full» o «expired» cuando
// ya no recibe presupuestos.
const effectiveStatusSql = `
  CASE
    WHEN job.status <> 'open' THEN job.status
    WHEN job.expires_at <= now() THEN 'expired'
    WHEN job.quotes_sent_count >= job.max_quotes THEN 'full'
    ELSE 'open'
  END
`;

const publicRequestColumns = `
  job.id,
  job.requester_first_name,
  job.title,
  job.description,
  job.category,
  job.province,
  job.district,
  job.corregimiento,
  job.desired_timing,
  job.budget_min::float8 AS budget_min,
  job.budget_max::float8 AS budget_max,
  job.status,
  ${effectiveStatusSql} AS effective_status,
  job.max_quotes,
  job.quotes_sent_count,
  job.expires_at,
  job.closed_at,
  job.created_at,
  (SELECT count(*)::int FROM public.job_request_photos AS photo WHERE photo.request_id = job.id) AS photo_count
`;

const coverPhotoSql = `
  (
    SELECT jsonb_build_object('id', photo.id, 'storage_path', photo.storage_path)
    FROM public.job_request_photos AS photo
    WHERE photo.request_id = job.id
    ORDER BY photo.sort_order, photo.created_at
    LIMIT 1
  ) AS cover_photo
`;

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export async function createJobRequestRepo(userId: string, input: CreateJobRequestInput): Promise<string> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        SELECT public.create_job_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS id
      `,
      [
        input.title,
        input.description,
        input.category,
        input.province,
        input.district ?? null,
        input.corregimiento ?? null,
        input.addressLine,
        input.reference ?? null,
        input.timing,
        input.budgetMin ?? null,
        input.budgetMax ?? null
      ]
    );
    return result.rows[0]!.id;
  });
}

export async function findMyJobRequestsRepo(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        SELECT
          ${publicRequestColumns},
          ${coverPhotoSql},
          (
            SELECT count(*)::int FROM public.job_request_threads AS thread
            WHERE thread.request_id = job.id AND thread.last_message_at IS NOT NULL
          ) AS conversation_count,
          (
            SELECT count(*)::int
            FROM public.job_request_messages AS message
            JOIN public.job_request_threads AS thread ON thread.id = message.thread_id
            WHERE message.request_id = job.id
              AND message.sender_side = 'company'
              AND message.created_at > COALESCE(thread.client_last_read_at, '-infinity'::timestamptz)
          ) AS unread_count
        FROM public.job_requests AS job
        WHERE job.requester_id = app.current_user_id()
        ORDER BY (job.status = 'open') DESC, job.created_at DESC
        LIMIT 100
      `
    );
    return result.rows;
  });
}

export async function getMyJobRequestRepo(userId: string, requestId: string) {
  return withUserTransaction(userId, async (client) => {
    const requestResult = await client.query(
      `
        SELECT
          ${publicRequestColumns},
          job.closed_reason,
          job.awarded_company_id,
          job.awarded_budget_id,
          detail.address_line,
          detail.reference
        FROM public.job_requests AS job
        LEFT JOIN public.job_request_details AS detail ON detail.request_id = job.id
        WHERE job.id = $1
          AND job.requester_id = app.current_user_id()
        LIMIT 1
      `,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) return null;

    const photos = await client.query<JobRequestPhotoRow>(
      `
        SELECT id, storage_path, mime_type, sort_order, created_at
        FROM public.job_request_photos
        WHERE request_id = $1
        ORDER BY sort_order, created_at
      `,
      [requestId]
    );

    // Conversaciones con la última línea y los no leídos por empresa.
    const conversations = await client.query(
      `
        SELECT
          thread.company_id,
          thread.company_name,
          thread.last_message_at,
          thread.created_at,
          (
            SELECT jsonb_build_object(
              'body', message.body,
              'has_photo', message.photo_storage_path IS NOT NULL,
              'sender_side', message.sender_side,
              'created_at', message.created_at
            )
            FROM public.job_request_messages AS message
            WHERE message.thread_id = thread.id
            ORDER BY message.created_at DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT count(*)::int
            FROM public.job_request_messages AS message
            WHERE message.thread_id = thread.id
              AND message.sender_side = 'company'
              AND message.created_at > COALESCE(thread.client_last_read_at, '-infinity'::timestamptz)
          ) AS unread_count,
          quote.status AS quote_status,
          quote.sent_at AS quote_sent_at,
          budget.id AS budget_id,
          budget.budget_number,
          budget.total::float8 AS budget_total,
          budget.currency_code,
          budget.status AS budget_status,
          budget.valid_until
        FROM public.job_request_threads AS thread
        LEFT JOIN public.job_request_quotes AS quote
          ON quote.request_id = thread.request_id
         AND quote.company_id = thread.company_id
         AND quote.sent_at IS NOT NULL
        LEFT JOIN public.budgets AS budget ON budget.id = quote.budget_id
        WHERE thread.request_id = $1
        ORDER BY (quote.sent_at IS NOT NULL) DESC, thread.last_message_at DESC NULLS LAST, thread.created_at DESC
      `,
      [requestId]
    );

    return { request, photos: photos.rows, conversations: conversations.rows };
  });
}

export async function closeJobRequestRepo(userId: string, requestId: string, reason: string | null) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ closed: boolean }>(
      "SELECT public.close_job_request($1, $2) AS closed",
      [requestId, reason]
    );
    return result.rows[0]?.closed === true;
  });
}

export async function addJobRequestPhotoRepo(
  userId: string,
  requestId: string,
  storagePath: string,
  mimeType: string,
  fileSize: number
) {
  return withUserTransaction(userId, async (client) => {
    const added = await client.query<{ id: string }>(
      "SELECT public.add_job_request_photo($1, $2, $3, $4) AS id",
      [requestId, storagePath, mimeType, fileSize]
    );
    // Consulta aparte: la misma sentencia no ve la fila que insertó la función.
    const result = await client.query<JobRequestPhotoRow>(
      `
        SELECT id, storage_path, mime_type, sort_order, created_at
        FROM public.job_request_photos
        WHERE id = $1
      `,
      [added.rows[0]!.id]
    );
    return result.rows[0]!;
  });
}

export async function deleteJobRequestPhotoRepo(userId: string, requestId: string, photoId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ storage_path: string | null }>(
      "SELECT public.delete_job_request_photo($1, $2) AS storage_path",
      [requestId, photoId]
    );
    return result.rows[0]?.storage_path ?? null;
  });
}

export async function findMatchingRecipientsRepo(userId: string, requestId: string): Promise<string[]> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ user_id: string }>(
      "SELECT recipient AS user_id FROM public.job_request_matching_recipients($1, 100) AS recipient",
      [requestId]
    );
    return result.rows.map((row) => row.user_id);
  });
}

// ---------------------------------------------------------------------------
// Contratista
// ---------------------------------------------------------------------------

const matchSql = `
  private.job_request_matches_profile(
    job.category, job.province, job.district,
    me.primary_category, me.specialties, me.province, me.work_areas
  )
`;

const acceptingSql = `
  (job.status = 'open' AND job.expires_at > now() AND job.quotes_sent_count < job.max_quotes)
`;

export async function findJobRequestFeedRepo(userId: string, companyId: string, query: FeedQuery) {
  return withUserTransaction(userId, async (client) => {
    const filters = `
      job.requester_id <> app.current_user_id()
      AND ($2::text IS NULL OR job.title ILIKE '%' || $2 || '%' OR job.description ILIKE '%' || $2 || '%')
      AND ($3::text IS NULL OR private.normalize_match_text(job.category) = private.normalize_match_text($3))
      AND ($4::text IS NULL OR private.normalize_match_text(job.province) = private.normalize_match_text($4))
    `;

    const rows = await client.query(
      `
        WITH me AS (
          SELECT primary_category, specialties, province, work_areas
          FROM public.profiles
          WHERE id = app.current_user_id()
        )
        SELECT
          ${publicRequestColumns},
          ${coverPhotoSql},
          ${matchSql} AS matches_profile,
          ${acceptingSql} AS accepting_quotes,
          thread.last_message_at,
          (
            SELECT count(*)::int
            FROM public.job_request_messages AS message
            WHERE message.thread_id = thread.id
              AND message.sender_side = 'client'
              AND message.created_at > COALESCE(thread.company_last_read_at, '-infinity'::timestamptz)
          ) AS unread_count,
          quote.status AS quote_status,
          quote.budget_id AS quote_budget_id
        FROM public.job_requests AS job
        CROSS JOIN me
        LEFT JOIN public.job_request_threads AS thread
          ON thread.request_id = job.id AND thread.company_id = $1
        LEFT JOIN public.job_request_quotes AS quote
          ON quote.request_id = job.id AND quote.company_id = $1
        WHERE ${filters}
          AND CASE $5::text
            WHEN 'engaged' THEN thread.id IS NOT NULL OR quote.id IS NOT NULL
            WHEN 'matching' THEN ${acceptingSql} AND ${matchSql}
            ELSE ${acceptingSql}
          END
        ORDER BY
          CASE WHEN $5::text = 'engaged' THEN COALESCE(thread.last_message_at, quote.updated_at, job.created_at) END DESC NULLS LAST,
          ${matchSql} DESC,
          (job.desired_timing = 'urgent') DESC,
          job.created_at DESC
        LIMIT $6 OFFSET $7
      `,
      [companyId, query.search, query.category, query.province, query.scope, query.limit, query.offset]
    );

    const counts = await client.query<{ matching: number; all: number; engaged: number }>(
      `
        WITH me AS (
          SELECT primary_category, specialties, province, work_areas
          FROM public.profiles
          WHERE id = app.current_user_id()
        )
        SELECT
          count(*) FILTER (WHERE ${acceptingSql} AND ${matchSql})::int AS matching,
          count(*) FILTER (WHERE ${acceptingSql})::int AS "all",
          count(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM public.job_request_threads AS thread WHERE thread.request_id = job.id AND thread.company_id = $1)
               OR EXISTS (SELECT 1 FROM public.job_request_quotes AS quote WHERE quote.request_id = job.id AND quote.company_id = $1)
          )::int AS engaged
        FROM public.job_requests AS job
        CROSS JOIN me
        WHERE ${filters}
      `,
      [companyId, query.search, query.category, query.province]
    );

    return {
      requests: rows.rows,
      counts: counts.rows[0] ?? { matching: 0, all: 0, engaged: 0 }
    };
  });
}

export async function getContractorJobRequestRepo(userId: string, companyId: string, requestId: string) {
  return withUserTransaction(userId, async (client) => {
    const requestResult = await client.query(
      `
        WITH me AS (
          SELECT primary_category, specialties, province, work_areas
          FROM public.profiles
          WHERE id = app.current_user_id()
        )
        SELECT
          ${publicRequestColumns},
          ${matchSql} AS matches_profile,
          ${acceptingSql} AS accepting_quotes,
          GREATEST(job.max_quotes - job.quotes_sent_count, 0) AS slots_left,
          (job.awarded_company_id = $2) AS awarded_to_me,
          detail.address_line,
          detail.reference
        FROM public.job_requests AS job
        CROSS JOIN me
        -- Además de RLS: la dirección solo sale si la empresa ya envió su presupuesto.
        LEFT JOIN public.job_request_details AS detail
          ON detail.request_id = job.id
         AND private.job_request_contact_revealed(job.id)
        WHERE job.id = $1
          AND job.requester_id <> app.current_user_id()
        LIMIT 1
      `,
      [requestId, companyId]
    );

    const request = requestResult.rows[0];
    if (!request) return null;

    const photos = await client.query<JobRequestPhotoRow>(
      `
        SELECT id, storage_path, mime_type, sort_order, created_at
        FROM public.job_request_photos
        WHERE request_id = $1
        ORDER BY sort_order, created_at
      `,
      [requestId]
    );

    const quote = await client.query(
      `
        SELECT
          quote.status,
          quote.sent_at,
          quote.budget_id,
          quote.client_id,
          quote.project_id,
          budget.budget_number,
          budget.status AS budget_status,
          budget.total::float8 AS budget_total,
          budget.currency_code
        FROM public.job_request_quotes AS quote
        JOIN public.budgets AS budget ON budget.id = quote.budget_id
        WHERE quote.request_id = $1 AND quote.company_id = $2
        LIMIT 1
      `,
      [requestId, companyId]
    );

    return { request, photos: photos.rows, quote: quote.rows[0] ?? null };
  });
}

export async function startJobRequestQuoteRepo(userId: string, companyId: string, requestId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ budget_id: string }>(
      "SELECT public.start_job_request_quote($1, $2) AS budget_id",
      [requestId, companyId]
    );
    return result.rows[0]!.budget_id;
  });
}

// ---------------------------------------------------------------------------
// Conversación (cliente y empresa)
// ---------------------------------------------------------------------------

/**
 * Devuelve la conversación y la marca como leída para quien la abre.
 * Si la empresa aún no escribió, `thread` es null y `messages` está vacío.
 */
export async function getConversationRepo(userId: string, requestId: string, companyId: string) {
  return withUserTransaction(userId, async (client) => {
    const header = await client.query<{
      request_id: string;
      title: string;
      requester_first_name: string;
      is_requester: boolean;
      effective_status: string;
      thread_id: string | null;
      company_name: string | null;
    }>(
      `
        SELECT
          job.id AS request_id,
          job.title,
          job.requester_first_name,
          (job.requester_id = app.current_user_id()) AS is_requester,
          ${effectiveStatusSql} AS effective_status,
          thread.id AS thread_id,
          thread.company_name
        FROM public.job_requests AS job
        LEFT JOIN public.job_request_threads AS thread
          ON thread.request_id = job.id AND thread.company_id = $2
        WHERE job.id = $1
        LIMIT 1
      `,
      [requestId, companyId]
    );

    const row = header.rows[0];
    if (!row) return null;
    // El cliente solo abre conversaciones que existen; la empresa, la suya.
    if (row.is_requester && !row.thread_id) return null;
    if (!row.is_requester) {
      const member = await client.query("SELECT public.is_company_member($1) AS ok", [companyId]);
      if (member.rows[0]?.ok !== true) return null;
    }

    let messages: JobRequestMessageRow[] = [];
    if (row.thread_id) {
      const result = await client.query<JobRequestMessageRow>(
        `
          SELECT
            message.id,
            message.sender_side,
            message.sender_id,
            CASE
              WHEN message.sender_side = 'client' THEN $2::text
              ELSE NULLIF(btrim(concat_ws(' ', sender.first_name, sender.last_name)), '')
            END AS sender_name,
            message.body,
            message.photo_storage_path,
            message.created_at
          FROM public.job_request_messages AS message
          LEFT JOIN public.profiles AS sender
            ON sender.id = message.sender_id
           AND message.sender_side = 'company'
          WHERE message.thread_id = $1
          ORDER BY message.created_at ASC
          LIMIT 500
        `,
        [row.thread_id, row.requester_first_name]
      );
      messages = result.rows;

      await client.query("SELECT public.mark_job_request_thread_read($1, $2)", [requestId, companyId]);
    }

    return {
      request: {
        id: row.request_id,
        title: row.title,
        requester_first_name: row.requester_first_name,
        effective_status: row.effective_status
      },
      side: row.is_requester ? ("client" as const) : ("company" as const),
      companyName: row.company_name,
      messages
    };
  });
}

export async function sendJobRequestMessageRepo(
  userId: string,
  requestId: string,
  companyId: string,
  body: string | null,
  photoPath: string | null,
  photoMime: string | null
) {
  return withUserTransaction(userId, async (client) => {
    const sent = await client.query<{ message_id: string; thread_id: string; recipient_ids: string[] }>(
      "SELECT message_id, thread_id, recipient_ids FROM public.send_job_request_message($1, $2, $3, $4, $5)",
      [requestId, companyId, body, photoPath, photoMime]
    );
    const info = sent.rows[0]!;

    const message = await client.query<JobRequestMessageRow & {
      company_name: string;
      title: string;
      requester_first_name: string;
    }>(
      `
        SELECT
          message.id,
          message.sender_side,
          message.sender_id,
          CASE
            WHEN message.sender_side = 'client' THEN job.requester_first_name
            ELSE NULLIF(btrim(concat_ws(' ', sender.first_name, sender.last_name)), '')
          END AS sender_name,
          message.body,
          message.photo_storage_path,
          message.created_at,
          thread.company_name,
          job.title,
          job.requester_first_name
        FROM public.job_request_messages AS message
        JOIN public.job_request_threads AS thread ON thread.id = message.thread_id
        JOIN public.job_requests AS job ON job.id = message.request_id
        LEFT JOIN public.profiles AS sender
          ON sender.id = message.sender_id
         AND message.sender_side = 'company'
        WHERE message.id = $1
      `,
      [info.message_id]
    );

    return { message: message.rows[0]!, recipientIds: info.recipient_ids ?? [] };
  });
}

// ---------------------------------------------------------------------------
// Bandeja de mensajes (campana de notificaciones)
// ---------------------------------------------------------------------------

export type JobRequestInboxRow = {
  request_id: string;
  company_id: string;
  side: "client" | "company";
  title: string;
  counterpart_name: string;
  company_name: string;
  last_message_at: string;
  unread_count: number;
  last_sender_side: "client" | "company" | null;
  last_body: string | null;
  last_has_photo: boolean;
  total_unread: number;
  unread_conversations: number;
};

/**
 * Conversaciones del usuario, con las no leídas primero.
 *
 * - Cliente: las conversaciones de sus peticiones (mensajes de la empresa).
 * - Contratista: las de sus empresas que él inició o, si es dueño o
 *   administrador, todas las de la empresa (los mismos destinatarios del push).
 *
 * Se filtra de forma explícita y no solo con RLS, porque el superadministrador
 * puede leer todas las conversaciones.
 */
export async function findJobRequestInboxRepo(
  userId: string,
  limit: number,
  space: "client" | "company" | null = null
) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<JobRequestInboxRow>(
      `
        WITH mine AS (
          SELECT
            thread.id AS thread_id,
            thread.request_id,
            thread.company_id,
            thread.company_name,
            thread.last_message_at,
            'client'::text AS side,
            thread.client_last_read_at AS last_read_at,
            job.title,
            job.requester_first_name
          FROM public.job_request_threads AS thread
          JOIN public.job_requests AS job ON job.id = thread.request_id
          WHERE job.requester_id = app.current_user_id()
            AND thread.last_message_at IS NOT NULL

          UNION ALL

          SELECT
            thread.id,
            thread.request_id,
            thread.company_id,
            thread.company_name,
            thread.last_message_at,
            'company'::text,
            thread.company_last_read_at,
            job.title,
            job.requester_first_name
          FROM public.job_request_threads AS thread
          JOIN public.job_requests AS job ON job.id = thread.request_id
          JOIN public.company_members AS member
            ON member.company_id = thread.company_id
           AND member.user_id = app.current_user_id()
           AND member.active = true
          WHERE thread.last_message_at IS NOT NULL
            AND job.requester_id <> app.current_user_id()
            AND (thread.started_by = app.current_user_id() OR member.role IN ('owner', 'admin'))
        ),
        scored AS (
          SELECT
            mine.*,
            (
              SELECT count(*)::int
              FROM public.job_request_messages AS message
              WHERE message.thread_id = mine.thread_id
                AND message.sender_side <> mine.side
                AND message.created_at > COALESCE(mine.last_read_at, '-infinity'::timestamptz)
            ) AS unread_count
          FROM mine
          WHERE $2::text IS NULL OR mine.side = $2::text
        )
        SELECT
          scored.request_id,
          scored.company_id,
          scored.side,
          scored.title,
          CASE WHEN scored.side = 'client' THEN scored.company_name ELSE scored.requester_first_name END AS counterpart_name,
          scored.company_name,
          scored.last_message_at,
          scored.unread_count,
          last_message.sender_side AS last_sender_side,
          left(last_message.body, 140) AS last_body,
          COALESCE(last_message.photo_storage_path IS NOT NULL, false) AS last_has_photo,
          (sum(scored.unread_count) OVER ())::int AS total_unread,
          (count(*) FILTER (WHERE scored.unread_count > 0) OVER ())::int AS unread_conversations
        FROM scored
        LEFT JOIN LATERAL (
          SELECT message.sender_side, message.body, message.photo_storage_path
          FROM public.job_request_messages AS message
          WHERE message.thread_id = scored.thread_id
          ORDER BY message.created_at DESC
          LIMIT 1
        ) AS last_message ON true
        ORDER BY (scored.unread_count > 0) DESC, scored.last_message_at DESC
        LIMIT $1
      `,
      [limit, space]
    );

    const first = result.rows[0];
    return {
      unreadMessages: first?.total_unread ?? 0,
      unreadConversations: first?.unread_conversations ?? 0,
      conversations: result.rows.map(({ total_unread: _total, unread_conversations: _count, ...row }) => row)
    };
  });
}
