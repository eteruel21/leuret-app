import { withUserTransaction } from "../db/with-user-transaction.js";

export type UserSettingRow = {
  setting_key: string;
  value: unknown;
  updated_at: string;
};

/** Ajustes del usuario autenticado; con prefijo, solo los que empiezan así. */
export async function listUserSettingsRepo(userId: string, prefix: string | null): Promise<UserSettingRow[]> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<UserSettingRow>(
      `
        SELECT setting_key, value, updated_at
        FROM public.user_app_settings
        WHERE user_id = app.current_user_id()
          AND ($1::text IS NULL OR starts_with(setting_key, $1::text))
        ORDER BY setting_key
        LIMIT 200
      `,
      [prefix]
    );
    return result.rows;
  });
}

export async function upsertUserSettingRepo(userId: string, key: string, value: unknown): Promise<UserSettingRow> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<UserSettingRow>(
      `
        INSERT INTO public.user_app_settings (user_id, setting_key, value)
        VALUES (app.current_user_id(), $1, $2::jsonb)
        ON CONFLICT (user_id, setting_key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        RETURNING setting_key, value, updated_at
      `,
      [key, JSON.stringify(value)]
    );
    return result.rows[0];
  });
}

export async function deleteUserSettingRepo(userId: string, key: string): Promise<boolean> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `
        DELETE FROM public.user_app_settings
        WHERE user_id = app.current_user_id() AND setting_key = $1
      `,
      [key]
    );
    return (result.rowCount ?? 0) > 0;
  });
}
