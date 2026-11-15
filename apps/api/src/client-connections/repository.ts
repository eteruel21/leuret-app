import type { PoolClient } from "pg";

import { withUserTransaction } from "../db/with-user-transaction.js";

type ConnectionInput = {
  companyId?: string | undefined;
  clientId?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
};

type ConnectionRequestResult = {
  outcome: "sent" | "pending" | "linked" | "not_found" | "ambiguous" | "ambiguous_company" | "ambiguous_record"
    | "unavailable_record" | "forbidden";
  request_id: string | null;
  notify_user_ids: string[] | null;
};

export type ConnectionAction = "accept" | "reject" | "cancel";
export type ConnectionDecision = "accepted" | "rejected" | "cancelled" | "not_found" | "forbidden"
  | "resolved" | "invalid_code" | "unavailable_record";

type ClientConnectionRow = {
  id: string;
  company_id: string;
  client_id: string | null;
  name: string;
  incoming: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "ended";
  requires_phone_code: boolean;
  phone_code: string | null;
  phone_to_confirm: string | null;
  created_at: Date;
};

export async function createConnectionRequest(client: PoolClient, input: ConnectionInput) {
  const result = await client.query<ConnectionRequestResult>(
    `SELECT * FROM private.create_client_connection_request($1, $2, $3, $4)`,
    [input.companyId ?? null, input.clientId ?? null, input.email ?? null, input.phone ?? null]
  );
  return result.rows[0]!;
}

export function requestClientConnection(userId: string, input: ConnectionInput) {
  return withUserTransaction(userId, (client) => createConnectionRequest(client, input));
}

export async function listClientConnections(userId: string, pendingOnly = false, asClient?: boolean) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<ClientConnectionRow>(
      `SELECT * FROM private.list_client_connection_requests($2::boolean) WHERE NOT $1::boolean OR status = 'pending'`,
      [pendingOnly, asClient ?? null]
    );
    return result.rows;
  });
}

export async function respondToClientConnection(userId: string, id: string, action: ConnectionAction, phoneCode?: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ outcome: ConnectionDecision }>(
      `SELECT private.respond_to_client_connection_request($1, $2, $3) AS outcome`,
      [id, action, phoneCode ?? null]
    );
    return result.rows[0]!.outcome;
  });
}

export type EndConnectionOutcome = "ended" | "not_linked" | "forbidden";

/** Termina la vinculación: desde el cliente (sin clientId) o desde la empresa (con la ficha). */
export async function endClientConnection(userId: string, companyId: string, clientId: string | null) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ outcome: EndConnectionOutcome; notify_user_ids: string[] | null }>(
      "SELECT * FROM private.end_client_connection($1, $2)",
      [companyId, clientId]
    );
    return result.rows[0]!;
  });
}

/** Quien envió la solicitud que el usuario acaba de aceptar. */
export async function findClientConnectionRequester(userId: string, requestId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{ requester: string | null }>(
      "SELECT private.client_connection_requester($1) AS requester",
      [requestId]
    );
    return result.rows[0]?.requester ?? null;
  });
}
