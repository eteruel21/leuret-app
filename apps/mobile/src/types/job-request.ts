export type JobRequestTiming = "urgent" | "this_week" | "this_month" | "flexible";

/** Estado guardado en la base de datos. */
export type JobRequestStatus = "open" | "awarded" | "closed" | "expired";

/** Estado que se muestra: «open» se divide en «full» o «expired» cuando ya no recibe presupuestos. */
export type JobRequestEffectiveStatus = JobRequestStatus | "full";

export type JobRequestQuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "cancelled";

export type JobRequestSummary = {
  id: string;
  requester_first_name: string;
  title: string;
  description: string;
  category: string;
  province: string;
  district: string | null;
  corregimiento: string | null;
  desired_timing: JobRequestTiming;
  budget_min: number | null;
  budget_max: number | null;
  status: JobRequestStatus;
  effective_status: JobRequestEffectiveStatus;
  max_quotes: number;
  quotes_sent_count: number;
  expires_at: string;
  closed_at: string | null;
  created_at: string;
  photo_count: number;
  cover_photo_url?: string | null;
};

export type ClientJobRequestSummary = JobRequestSummary & {
  conversation_count: number;
  unread_count: number;
};

export type ContractorJobRequestSummary = JobRequestSummary & {
  matches_profile: boolean;
  accepting_quotes: boolean;
  last_message_at: string | null;
  unread_count: number;
  quote_status: JobRequestQuoteStatus | null;
  quote_budget_id: string | null;
};

export type JobRequestPhoto = {
  id: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
  signedUrl: string;
};

export type JobRequestConversationSummary = {
  company_id: string;
  company_name: string;
  last_message_at: string | null;
  created_at: string;
  last_message: {
    body: string | null;
    has_photo: boolean;
    sender_side: "client" | "company";
    created_at: string;
  } | null;
  unread_count: number;
  quote_status: JobRequestQuoteStatus | null;
  quote_sent_at: string | null;
  budget_id: string | null;
  budget_number: string | null;
  budget_total: number | null;
  currency_code: string | null;
  budget_status: string | null;
  valid_until: string | null;
};

export type ClientJobRequestDetail = {
  request: JobRequestSummary & {
    closed_reason: string | null;
    awarded_company_id: string | null;
    awarded_budget_id: string | null;
    address_line: string | null;
    reference: string | null;
  };
  photos: JobRequestPhoto[];
  conversations: JobRequestConversationSummary[];
};

export type ContractorJobRequestDetail = {
  request: JobRequestSummary & {
    matches_profile: boolean;
    accepting_quotes: boolean;
    slots_left: number;
    awarded_to_me: boolean | null;
    /** Solo llega cuando la empresa ya envió su presupuesto. */
    address_line: string | null;
    reference: string | null;
  };
  photos: JobRequestPhoto[];
  quote: {
    status: JobRequestQuoteStatus;
    sent_at: string | null;
    budget_id: string;
    client_id: string;
    project_id: string;
    budget_number: string;
    budget_status: string;
    budget_total: number;
    currency_code: string;
  } | null;
};

export type JobRequestFeedScope = "matching" | "all" | "engaged";

export type JobRequestFeed = {
  requests: ContractorJobRequestSummary[];
  counts: Record<JobRequestFeedScope, number>;
  limit: number;
  offset: number;
};

export type JobRequestMessage = {
  id: string;
  sender_side: "client" | "company";
  sender_id: string | null;
  sender_name: string | null;
  body: string | null;
  created_at: string;
  photoUrl: string | null;
};

export type JobRequestConversation = {
  request: {
    id: string;
    title: string;
    requester_first_name: string;
    effective_status: JobRequestEffectiveStatus;
  };
  side: "client" | "company";
  companyName: string | null;
  messages: JobRequestMessage[];
};

export type CreateJobRequestInput = {
  title: string;
  description: string;
  category: string;
  province: string;
  district: string | null;
  corregimiento: string | null;
  addressLine: string;
  reference: string | null;
  timing: JobRequestTiming;
  budgetMin: number | null;
  budgetMax: number | null;
};

/** Conversación en la campana de notificaciones (cliente o contratista). */
export type JobRequestInboxConversation = {
  request_id: string;
  company_id: string;
  /** Lado del usuario en la conversación. */
  side: "client" | "company";
  title: string;
  /** Empresa (para el cliente) o nombre de pila del cliente (para la empresa). */
  counterpart_name: string;
  company_name: string;
  last_message_at: string;
  unread_count: number;
  last_sender_side: "client" | "company" | null;
  last_body: string | null;
  last_has_photo: boolean;
};

export type JobRequestInbox = {
  unreadMessages: number;
  unreadConversations: number;
  conversations: JobRequestInboxConversation[];
};
