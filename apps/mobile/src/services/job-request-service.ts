import { authenticatedRequest } from "@/services/api";
import type {
  ClientJobRequestDetail,
  ClientJobRequestSummary,
  ContractorJobRequestDetail,
  CreateJobRequestInput,
  JobRequestConversation,
  JobRequestFeed,
  JobRequestFeedScope,
  JobRequestMessage,
  JobRequestPhoto,
} from "@/types/job-request";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// --- Cliente ----------------------------------------------------------------

export async function createJobRequest(input: CreateJobRequestInput): Promise<string> {
  const res = await authenticatedRequest<{ requestId: string }>("/job-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.requestId;
}

export async function listMyJobRequests(): Promise<{ requests: ClientJobRequestSummary[]; error: string | null }> {
  try {
    const res = await authenticatedRequest<{ requests: ClientJobRequestSummary[] }>("/job-requests/mine");
    return { requests: res.requests, error: null };
  } catch (error) {
    return { requests: [], error: errorMessage(error, "No fue posible cargar tus peticiones.") };
  }
}

export async function getMyJobRequest(
  requestId: string,
): Promise<{ detail: ClientJobRequestDetail | null; error: string | null }> {
  try {
    const detail = await authenticatedRequest<ClientJobRequestDetail>(`/job-requests/mine/${requestId}`);
    return { detail, error: null };
  } catch (error) {
    return { detail: null, error: errorMessage(error, "No fue posible cargar la petición.") };
  }
}

export async function closeJobRequest(requestId: string, reason: string | null): Promise<void> {
  await authenticatedRequest(`/job-requests/${requestId}/close`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function uploadJobRequestPhoto(
  requestId: string,
  photo: { fileData: string; mimeType: string },
): Promise<JobRequestPhoto> {
  const res = await authenticatedRequest<{ photo: JobRequestPhoto }>(`/job-requests/${requestId}/photos`, {
    method: "POST",
    body: JSON.stringify(photo),
  });
  return res.photo;
}

export async function deleteJobRequestPhoto(requestId: string, photoId: string): Promise<void> {
  await authenticatedRequest(`/job-requests/${requestId}/photos/${photoId}`, { method: "DELETE" });
}

// --- Contratista --------------------------------------------------------------

export async function listJobRequestFeed(
  companyId: string,
  options: { scope: JobRequestFeedScope; search?: string; category?: string | null; province?: string | null; limit?: number; offset?: number },
): Promise<{ feed: JobRequestFeed | null; error: string | null }> {
  const params = new URLSearchParams({ scope: options.scope });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.category) params.set("category", options.category);
  if (options.province) params.set("province", options.province);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  try {
    const feed = await authenticatedRequest<JobRequestFeed>(`/companies/${companyId}/job-requests?${params.toString()}`);
    return { feed, error: null };
  } catch (error) {
    return { feed: null, error: errorMessage(error, "No fue posible cargar las peticiones.") };
  }
}

export async function getContractorJobRequest(
  companyId: string,
  requestId: string,
): Promise<{ detail: ContractorJobRequestDetail | null; error: string | null }> {
  try {
    const detail = await authenticatedRequest<ContractorJobRequestDetail>(
      `/companies/${companyId}/job-requests/${requestId}`,
    );
    return { detail, error: null };
  } catch (error) {
    return { detail: null, error: errorMessage(error, "No fue posible cargar la petición.") };
  }
}

/** Crea (o devuelve) el presupuesto en borrador de la empresa para la petición. */
export async function startJobRequestQuote(companyId: string, requestId: string): Promise<string> {
  const res = await authenticatedRequest<{ budgetId: string }>(
    `/companies/${companyId}/job-requests/${requestId}/quote`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.budgetId;
}

// --- Conversación ---------------------------------------------------------------

export async function getJobRequestConversation(
  requestId: string,
  companyId: string,
): Promise<{ conversation: JobRequestConversation | null; error: string | null }> {
  try {
    const conversation = await authenticatedRequest<JobRequestConversation>(
      `/job-requests/${requestId}/conversations/${companyId}`,
    );
    return { conversation, error: null };
  } catch (error) {
    return { conversation: null, error: errorMessage(error, "No fue posible cargar la conversación.") };
  }
}

export async function sendJobRequestMessage(
  requestId: string,
  companyId: string,
  input: { body?: string | null; fileData?: string | null; mimeType?: string | null },
): Promise<JobRequestMessage> {
  const res = await authenticatedRequest<{ message: JobRequestMessage }>(
    `/job-requests/${requestId}/conversations/${companyId}/messages`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return res.message;
}
