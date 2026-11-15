BEGIN;

SET ROLE contractor_owner;

-- Datos del usuario que hasta ahora solo vivían en el teléfono o se perdían.
--
-- 1. public.user_app_settings: ajustes por usuario (parámetros técnicos de las
--    10 calculadoras, guía de inicio oculta…). Antes solo estaban en el
--    AsyncStorage del dispositivo: al cambiar de teléfono o entrar por la web
--    se perdían. Cada usuario lee y escribe solo sus filas.
--
-- 2. public.notifications pasa a ser la bandeja de avisos del usuario. Hasta
--    ahora ningún aviso se guardaba (0 filas en producción): presupuesto
--    aprobado, factura emitida, solicitud de factura, etc. solo existían como
--    push, y sin dispositivo registrado se perdían. Ahora la API guarda cada
--    aviso (con la identidad del destinatario) antes de enviar el push.
--      * company_id es opcional: hay avisos sin empresa (petición de trabajo
--        nueva, vinculación aceptada).
--      * space indica en qué espacio se muestra: 'client', 'company' o NULL
--        (ambos).
--      * data guarda los identificadores para abrir la pantalla del aviso.

-- 1. Ajustes por usuario ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_app_settings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, setting_key),
  CONSTRAINT user_app_settings_key_format
    CHECK (setting_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  CONSTRAINT user_app_settings_value_size
    CHECK (pg_column_size(value) <= 16384)
);

COMMENT ON TABLE public.user_app_settings IS
  'Ajustes de la app por usuario (calculadoras, guía de inicio). Sincronizados entre dispositivos.';

ALTER TABLE public.user_app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_app_settings_select ON public.user_app_settings;
CREATE POLICY user_app_settings_select ON public.user_app_settings
  FOR SELECT TO contractor_api
  USING (user_id = app.current_user_id());

DROP POLICY IF EXISTS user_app_settings_insert ON public.user_app_settings;
CREATE POLICY user_app_settings_insert ON public.user_app_settings
  FOR INSERT TO contractor_api
  WITH CHECK (user_id = app.current_user_id());

DROP POLICY IF EXISTS user_app_settings_update ON public.user_app_settings;
CREATE POLICY user_app_settings_update ON public.user_app_settings
  FOR UPDATE TO contractor_api
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

DROP POLICY IF EXISTS user_app_settings_delete ON public.user_app_settings;
CREATE POLICY user_app_settings_delete ON public.user_app_settings
  FOR DELETE TO contractor_api
  USING (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_app_settings TO contractor_api;

-- Al eliminar la cuenta (private.delete_own_account deja la constancia en
-- private.account_deletion_records) se borran también sus ajustes.
CREATE OR REPLACE FUNCTION private.purge_deleted_account_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.user_app_settings WHERE user_id = NEW.user_id;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.purge_deleted_account_settings() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_purge_settings ON private.account_deletion_records;
CREATE TRIGGER account_deletion_purge_settings
  AFTER INSERT ON private.account_deletion_records
  FOR EACH ROW
  EXECUTE FUNCTION private.purge_deleted_account_settings();

-- 2. Bandeja de avisos --------------------------------------------------------

ALTER TABLE public.notifications ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS space text,
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_space_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_space_check
  CHECK (space IS NULL OR space IN ('client', 'company'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_data_object;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_data_object
  CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 4096);

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_text_length;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_text_length
  CHECK (char_length(title) BETWEEN 1 AND 200 AND char_length(body) <= 1000 AND char_length(type) <= 80);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- La API guarda el aviso con la identidad del destinatario (igual que lee sus
-- dispositivos push). La política anterior solo dejaba insertar a miembros de
-- la empresa, y los clientes no lo son.
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications
  FOR INSERT TO contractor_api
  WITH CHECK (user_id = app.current_user_id());

RESET ROLE;

COMMIT;
