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
  status: "pending" | "accepted" | "rejected" | "cancelled";
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

export async function listClientConnections(userId: string, pendingOnly = false) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<ClientConnectionRow>(
      `SELECT * FROM private.list_client_connection_requests() WHERE NOT $1::boolean OR status = 'pending'`,
      [pendingOnly]
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
