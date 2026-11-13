export type RelationshipProcess = {
  id: string;
  kind: "project" | "task" | "budget" | "invoice" | "payment" | "credit_note" | "activity";
  title: string;
  status: string;
  date: string | null;
  detail: string | null;
  parent_id: string | null;
  amount: number | null;
  currency_code: string | null;
  valid_until: string | null;
};
