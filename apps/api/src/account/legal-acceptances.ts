import type { PoolClient } from "pg";
import { z } from "zod";

import { LEGAL_DOCUMENTS } from "./legal-content.js";

export const legalDocumentTypes = ["terms", "privacy"] as const;
type LegalDocumentType = (typeof legalDocumentTypes)[number];
const documentVersion = z.string().regex(/^[0-9a-f]{64}$/);

export const registrationLegalConfirmations = z.object({
  terms: z.object({ accepted: z.literal(true), version: documentVersion }),
  privacy: z.object({ acknowledged: z.literal(true), version: documentVersion })
});

export const accountLegalConfirmations = registrationLegalConfirmations.partial()
  .refine(({ terms, privacy }) => Boolean(terms || privacy));

type LegalConfirmations = z.infer<typeof accountLegalConfirmations>;

export const staleLegalDocuments = {
  code: "LEGAL_DOCUMENTS_CHANGED",
  message: "Los documentos legales cambiaron. Abre las versiones vigentes y vuelve a confirmar."
} as const;

export function hasCurrentLegalVersions(confirmations: LegalConfirmations): boolean {
  return legalDocumentTypes.every((type) =>
    !confirmations[type] || confirmations[type].version === LEGAL_DOCUMENTS[type].document.version
  );
}

export async function recordLegalConfirmations(
  client: PoolClient,
  confirmations: LegalConfirmations,
  source: "registration" | "account"
): Promise<void> {
  for (const type of legalDocumentTypes) {
    if (!confirmations[type]) continue;
    const { version, updatedAt } = LEGAL_DOCUMENTS[type].document;
    await client.query(
      `INSERT INTO app_auth.legal_acceptances (
         user_id, document_type, document_version, document_updated_at, source
       )
       VALUES (app.current_user_id(), $1, $2, $3, $4)
       ON CONFLICT (user_id, document_type, document_version) DO NOTHING`,
      [type, version, updatedAt, source]
    );
  }
}

export async function loadLegalAcceptances(client: PoolClient) {
  const result = await client.query<{
    documentType: LegalDocumentType;
    version: string;
    updatedAt: string;
    confirmedAt: Date;
    source: "registration" | "account";
  }>(
    `SELECT document_type AS "documentType",
            document_version AS version,
            document_updated_at::text AS "updatedAt",
            confirmed_at AS "confirmedAt",
            source
     FROM app_auth.legal_acceptances
     WHERE user_id = app.current_user_id()
     ORDER BY confirmed_at DESC, document_type`
  );
  return result.rows;
}

export async function loadCurrentLegalStatus(client: PoolClient) {
  const records = await loadLegalAcceptances(client);
  function status(type: LegalDocumentType) {
    const { title, version, updatedAt } = LEGAL_DOCUMENTS[type].document;
    const record = records.find((row) => row.documentType === type && row.version === version);
    return { title, version, updatedAt, confirmedAt: record?.confirmedAt ?? null };
  }
  return { terms: status("terms"), privacy: status("privacy") };
}
