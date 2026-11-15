import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { authenticateRequest, requireActiveUser } from "../auth/authenticate.js";
import { deleteUserSettingRepo, listUserSettingsRepo, upsertUserSettingRepo, type UserSettingRow } from "./repository.js";

/**
 * Ajustes por usuario guardados en PostgreSQL (public.user_app_settings).
 * Claves con espacio de nombres: calculator.<calculadora>, onboarding.<…>, ui.<…>.
 */
export const SETTING_KEY_PATTERN = /^(calculator|onboarding|ui)\.[a-z0-9][a-z0-9._-]{0,59}$/;
export const MAX_SETTING_BYTES = 16_000;

const keyParamsSchema = z.object({
  key: z.string().regex(SETTING_KEY_PATTERN)
});

const listQuerySchema = z.object({
  prefix: z.string().regex(/^(calculator|onboarding|ui)\.[a-z0-9._-]{0,60}$/).optional()
});

const putBodySchema = z.object({
  value: z.record(z.string(), z.unknown())
});

export function settingByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function serialize(row: UserSettingRow) {
  return { key: row.setting_key, value: row.value, updatedAt: row.updated_at };
}

function userIdOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    reply.status(401).send({ message: "Se requiere autenticación." });
    return null;
  }
  return userId;
}

export async function registerUserSettingsRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [authenticateRequest, requireActiveUser];

  app.get("/me/settings", { preHandler }, async (request, reply) => {
    const userId = userIdOf(request, reply);
    if (!userId) return;
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ message: "Prefijo de ajustes no válido." });
    const rows = await listUserSettingsRepo(userId, parsed.data.prefix ?? null);
    return { settings: rows.map(serialize) };
  });

  app.put("/me/settings/:key", { preHandler }, async (request, reply) => {
    const userId = userIdOf(request, reply);
    if (!userId) return;
    const params = keyParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ message: "Clave de ajuste no válida." });
    const body = putBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ message: "El ajuste debe ser un objeto." });
    if (settingByteSize(body.data.value) > MAX_SETTING_BYTES) {
      return reply.status(413).send({ message: "El ajuste es demasiado grande." });
    }
    const row = await upsertUserSettingRepo(userId, params.data.key, body.data.value);
    return { setting: serialize(row) };
  });

  app.delete("/me/settings/:key", { preHandler }, async (request, reply) => {
    const userId = userIdOf(request, reply);
    if (!userId) return;
    const params = keyParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ message: "Clave de ajuste no válida." });
    const deleted = await deleteUserSettingRepo(userId, params.data.key);
    return { deleted };
  });
}
