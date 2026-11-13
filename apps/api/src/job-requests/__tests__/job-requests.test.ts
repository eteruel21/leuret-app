import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPool } from "../../db/test-db.js";
import { respondToBudgetAsClientRepo, sendBudgetRepo } from "../../budgets/repository.js";
import {
  addJobRequestPhotoRepo,
  closeJobRequestRepo,
  createJobRequestRepo,
  findJobRequestFeedRepo,
  findMatchingRecipientsRepo,
  findMyJobRequestsRepo,
  getContractorJobRequestRepo,
  getConversationRepo,
  getMyJobRequestRepo,
  sendJobRequestMessageRepo,
  startJobRequestQuoteRepo
} from "../repository.js";

type ProfileExtras = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  category?: string;
  province?: string;
  workAreas?: string[];
};

async function createActiveUser(email: string, role: "contractor" | "client", extras: ProfileExtras = {}) {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO app_auth.users (email, email_confirmed_at) VALUES ($1, now()) RETURNING id`,
    [email]
  );
  const id = result.rows[0]!.id;
  await adminPool.query(
    `
      UPDATE public.profiles
      SET active = true, approved_at = now(), role = $2::public.global_user_role,
          first_name = $3, last_name = $4, phone = $5,
          primary_category = $6, province = $7, work_areas = $8
      WHERE id = $1
    `,
    [
      id,
      role,
      extras.firstName ?? null,
      extras.lastName ?? null,
      extras.phone ?? null,
      extras.category ?? null,
      extras.province ?? null,
      extras.workAreas ?? null
    ]
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

async function addItem(companyId: string, budgetId: string) {
  await adminPool.query(
    `
      INSERT INTO public.budget_items (company_id, budget_id, item_type, description, quantity, unit_cost, unit_price, discount_percentage, taxable)
      VALUES ($1, $2, 'manual', 'Tomacorriente doble', 6, 10, 25, 0, true)
    `,
    [companyId, budgetId]
  );
}

/** Cuenta filas visibles con RLS real (los repositorios en CI usan superusuario). */
async function visibleRowsAs(userId: string, table: string, requestId: string) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE contractor_api");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM public.${table} WHERE request_id = $1`,
      [requestId]
    );
    await client.query("ROLLBACK");
    return result.rows[0]!.total;
  } finally {
    client.release();
  }
}

const feed = { search: null, category: null, province: null, limit: 20, offset: 0 } as const;

describe("Peticiones de trabajo: publicación, privacidad y presupuestos", () => {
  const suffix = Math.floor(Math.random() * 1_000_000);
  const clientEmail = `jr_client_${suffix}@example.com`;
  let clientUserId: string;
  let outsiderClientId: string;
  let electricianId: string;
  let plumberId: string;
  let electricCompanyId: string;
  let plumbingCompanyId: string;
  let requestId: string;
  let budgetId: string;

  beforeAll(async () => {
    clientUserId = await createActiveUser(clientEmail, "client", {
      firstName: "María",
      lastName: "Pérez",
      phone: "6000-0000"
    });
    outsiderClientId = await createActiveUser(`jr_outsider_${suffix}@example.com`, "client");
    electricianId = await createActiveUser(`jr_electric_${suffix}@example.com`, "contractor", {
      category: "Electricidad",
      province: "Panamá",
      workAreas: ["Panamá Centro", "San Miguelito"]
    });
    plumberId = await createActiveUser(`jr_plumber_${suffix}@example.com`, "contractor", {
      category: "Plomería",
      province: "Chiriquí"
    });
    electricCompanyId = await createCompany(`Electro ${suffix}`, electricianId);
    plumbingCompanyId = await createCompany(`Plomeros ${suffix}`, plumberId);

    requestId = await createJobRequestRepo(clientUserId, {
      title: "Instalar 6 tomacorrientes",
      description: "Necesito instalar seis tomacorrientes nuevos en la sala y la cocina.",
      category: "Electricidad",
      province: "Panamá",
      district: "San Miguelito",
      corregimiento: "Belisario Porras",
      addressLine: "Calle 5, casa 22",
      reference: "Frente al parque",
      timing: "this_week",
      budgetMin: 100,
      budgetMax: 400
    });
    await addJobRequestPhotoRepo(clientUserId, requestId, `job-requests/${requestId}/test.jpg`, "image/jpeg", 1024);
  });

  afterAll(async () => {
    await adminPool.query("DELETE FROM public.companies WHERE id = ANY($1::uuid[])", [[electricCompanyId, plumbingCompanyId]]);
    await adminPool.query("DELETE FROM app_auth.users WHERE id = ANY($1::uuid[])", [
      [clientUserId, outsiderClientId, electricianId, plumberId]
    ]);
  });

  it("solo los clientes publican", async () => {
    await expect(
      createJobRequestRepo(electricianId, {
        title: "Petición de contratista",
        description: "Un contratista no debería poder publicar esta petición.",
        category: "General",
        province: "Panamá",
        district: null,
        corregimiento: null,
        addressLine: "Calle 1",
        reference: null,
        timing: "flexible",
        budgetMin: null,
        budgetMax: null
      })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("avisa y prioriza a los contratistas de la categoría y zona", async () => {
    const recipients = await findMatchingRecipientsRepo(clientUserId, requestId);
    expect(recipients).toContain(electricianId);
    expect(recipients).not.toContain(plumberId);

    const electric = await findJobRequestFeedRepo(electricianId, electricCompanyId, { ...feed, scope: "matching" });
    expect(electric.requests.map((row) => row.id)).toContain(requestId);

    // El plomero de Chiriquí no la tiene en «Para ti», pero sí puede buscarla.
    const plumberMatching = await findJobRequestFeedRepo(plumberId, plumbingCompanyId, { ...feed, scope: "matching" });
    expect(plumberMatching.requests.map((row) => row.id)).not.toContain(requestId);
    const plumberAll = await findJobRequestFeedRepo(plumberId, plumbingCompanyId, { ...feed, scope: "all" });
    expect(plumberAll.requests.map((row) => row.id)).toContain(requestId);
  });

  it("oculta la dirección y el contacto antes del presupuesto", async () => {
    const detail = await getContractorJobRequestRepo(electricianId, electricCompanyId, requestId);
    expect(detail?.request.requester_first_name).toBe("María");
    expect(detail?.request.address_line).toBeNull();
    expect(detail?.photos).toHaveLength(1);

    // Con RLS: la dirección privada solo la ve quien publicó.
    expect(await visibleRowsAs(clientUserId, "job_request_details", requestId)).toBe(1);
    expect(await visibleRowsAs(electricianId, "job_request_details", requestId)).toBe(0);
    expect(await visibleRowsAs(outsiderClientId, "job_request_photos", requestId)).toBe(0);

    // Otro cliente no ve peticiones ajenas.
    expect(await findMyJobRequestsRepo(outsiderClientId)).toHaveLength(0);
    expect(await getMyJobRequestRepo(outsiderClientId, requestId)).toBeNull();
  });

  it("mantiene cada conversación privada entre el cliente y una empresa", async () => {
    const sent = await sendJobRequestMessageRepo(
      electricianId, requestId, electricCompanyId, "¿Las paredes son de bloque?", null, null
    );
    expect(sent.recipientIds).toEqual([clientUserId]);

    const reply = await sendJobRequestMessageRepo(clientUserId, requestId, electricCompanyId, "Sí, con repello.", null, null);
    expect(reply.recipientIds).toEqual([electricianId]);

    const fromCompany = await getConversationRepo(electricianId, requestId, electricCompanyId);
    expect(fromCompany?.messages.map((message) => message.body)).toEqual([
      "¿Las paredes son de bloque?",
      "Sí, con repello."
    ]);

    // La otra empresa no puede leer esa conversación.
    expect(await visibleRowsAs(plumberId, "job_request_messages", requestId)).toBe(0);
    expect(await visibleRowsAs(electricianId, "job_request_messages", requestId)).toBe(2);
    expect(await getConversationRepo(plumberId, requestId, electricCompanyId)).toBeNull();
    // El cliente no puede iniciar una conversación con una empresa que no le escribió.
    await expect(
      sendJobRequestMessageRepo(clientUserId, requestId, plumbingCompanyId, "Hola", null, null)
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("crea el presupuesto en borrador y revela el contacto al enviarlo", async () => {
    budgetId = await startJobRequestQuoteRepo(electricianId, electricCompanyId, requestId);
    expect(await startJobRequestQuoteRepo(electricianId, electricCompanyId, requestId)).toBe(budgetId);

    const beforeSend = await adminPool.query(
      `SELECT first_name, last_name, phone, email, user_id FROM public.clients WHERE company_id = $1`,
      [electricCompanyId]
    );
    expect(beforeSend.rows[0]).toMatchObject({ first_name: "María", last_name: null, phone: null, email: null, user_id: clientUserId });

    // El cliente todavía no ve el borrador.
    expect((await getMyJobRequestRepo(clientUserId, requestId))?.conversations[0]?.budget_id).toBeNull();

    await addItem(electricCompanyId, budgetId);
    await sendBudgetRepo(electricianId, budgetId, electricCompanyId);

    const afterSend = await adminPool.query(
      `SELECT last_name, phone, email FROM public.clients WHERE company_id = $1`,
      [electricCompanyId]
    );
    expect(afterSend.rows[0]).toMatchObject({ last_name: "Pérez", phone: "6000-0000", email: clientEmail });

    const detail = await getContractorJobRequestRepo(electricianId, electricCompanyId, requestId);
    expect(detail?.request.address_line).toBe("Calle 5, casa 22");
    expect(detail?.request.quotes_sent_count).toBe(1);
    expect(await visibleRowsAs(electricianId, "job_request_details", requestId)).toBe(1);
    expect(await visibleRowsAs(plumberId, "job_request_details", requestId)).toBe(0);

    const mine = await getMyJobRequestRepo(clientUserId, requestId);
    expect(mine?.conversations[0]?.budget_id).toBe(budgetId);
  });

  it("no acepta presupuestos cuando la petición llegó al máximo", async () => {
    await adminPool.query("UPDATE public.job_requests SET max_quotes = 2 WHERE id = $1", [requestId]);
    const plumberBudget = await startJobRequestQuoteRepo(plumberId, plumbingCompanyId, requestId);
    await addItem(plumbingCompanyId, plumberBudget);
    await adminPool.query("UPDATE public.job_requests SET max_quotes = 1 WHERE id = $1", [requestId]);

    await expect(sendBudgetRepo(plumberId, plumberBudget, plumbingCompanyId)).rejects.toMatchObject({
      code: "55000",
      hint: "job_request_not_accepting"
    });
    await adminPool.query("UPDATE public.job_requests SET max_quotes = 5 WHERE id = $1", [requestId]);
  });

  it("se adjudica cuando el cliente aprueba y deja de aparecer", async () => {
    await respondToBudgetAsClientRepo(clientUserId, budgetId, "approved");

    const mine = await getMyJobRequestRepo(clientUserId, requestId);
    expect(mine?.request.effective_status).toBe("awarded");
    expect(mine?.request.awarded_company_id).toBe(electricCompanyId);

    const otherFeed = await findJobRequestFeedRepo(plumberId, plumbingCompanyId, { ...feed, scope: "all" });
    expect(otherFeed.requests.map((row) => row.id)).not.toContain(requestId);
    // Quien ya participó la sigue viendo en «Mis conversaciones».
    const engaged = await findJobRequestFeedRepo(plumberId, plumbingCompanyId, { ...feed, scope: "engaged" });
    expect(engaged.requests.map((row) => row.id)).toContain(requestId);

    // Ya no se puede cerrar: no está abierta.
    expect(await closeJobRequestRepo(clientUserId, requestId, null)).toBe(false);
  });
});
