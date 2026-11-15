BEGIN;

SET ROLE contractor_owner;

-- Relaciones entre usuarios y equipos.
--
-- 1. Los cambios de rol, la desactivación y la salida de un miembro pasan por
--    funciones con reglas explícitas. Antes la API ejecutaba UPDATE/DELETE
--    directos: cuando la política RLS no dejaba tocar la fila (por ejemplo,
--    un administrador que quitaba a alguien) no cambiaba nada y la API
--    respondía «Listo».
-- 2. Solo un propietario gestiona administradores y propietarios, e invita
--    administradores.
-- 3. Quien pierde el rol de gestión deja de tener invitaciones y solicitudes
--    de vinculación pendientes a su nombre (ya no se podían aceptar).
-- 4. La persona invitada puede rechazar la invitación, y cualquier miembro
--    puede salir de una empresa (salvo el último propietario).
-- 5. Cliente y empresa pueden terminar una vinculación aceptada.

-- Último cambio de un miembro que deja de poder gestionar el equipo o las
-- vinculaciones: sus invitaciones y solicitudes pendientes ya no son válidas.
CREATE FUNCTION private.release_member_pending_requests(
  p_company_id uuid, p_user_id uuid, p_new_role public.company_role, p_still_member boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked record;
BEGIN
  IF NOT p_still_member OR p_new_role NOT IN ('owner', 'admin') THEN
    FOR revoked IN
      UPDATE public.company_invitations AS invitation
      SET status = 'revoked', updated_at = now()
      WHERE invitation.company_id = p_company_id AND invitation.invited_by = p_user_id
        AND invitation.status = 'pending'
      RETURNING invitation.id, invitation.email
    LOOP
      INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
      VALUES (p_company_id, coalesce(app.current_user_id(), p_user_id), 'INVITATION_REVOKED', 'company_invitation',
        revoked.id::text, jsonb_build_object('email', revoked.email, 'reason', 'inviter_access_changed'));
    END LOOP;
  END IF;

  IF NOT p_still_member OR p_new_role NOT IN ('owner', 'admin', 'sales') THEN
    UPDATE private.client_connection_requests AS request
    SET status = 'cancelled', phone_code = NULL, phone_to_confirm = NULL, updated_at = now()
    WHERE request.company_id = p_company_id AND request.requested_by = p_user_id
      AND NOT request.requested_by_client AND request.status = 'pending';
  END IF;
END;
$$;

-- Cambiar rol, desactivar, reactivar o quitar a un miembro.
-- Resultados: ok, unchanged, forbidden, not_found, self, last_owner,
-- owner_required, inactive, unavailable.
CREATE FUNCTION private.manage_company_member(
  p_company_id uuid, p_member_id uuid, p_action text, p_role public.company_role DEFAULT NULL
)
RETURNS TABLE (outcome text, target_user_id uuid, previous_role public.company_role, assigned_role public.company_role)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  actor public.company_members%ROWTYPE;
  target public.company_members%ROWTYPE;
  target_email text;
  removes_owner boolean;
  new_role public.company_role;
BEGIN
  IF actor_id IS NULL OR NOT private.is_active_platform_user()
     OR p_action NOT IN ('set_role', 'deactivate', 'activate', 'remove')
     OR (p_action = 'set_role') <> (p_role IS NOT NULL) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::public.company_role, NULL::public.company_role;
    RETURN;
  END IF;

  -- Serializa los cambios del equipo de una empresa (conteo de propietarios).
  PERFORM 1 FROM public.companies AS company WHERE company.id = p_company_id AND company.active FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::public.company_role, NULL::public.company_role;
    RETURN;
  END IF;

  SELECT member.* INTO actor FROM public.company_members AS member
  WHERE member.company_id = p_company_id AND member.user_id = actor_id AND member.active
    AND member.role IN ('owner', 'admin');
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::public.company_role, NULL::public.company_role;
    RETURN;
  END IF;

  SELECT member.* INTO target FROM public.company_members AS member
  WHERE member.id = p_member_id AND member.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::public.company_role, NULL::public.company_role;
    RETURN;
  END IF;

  IF target.user_id = actor_id AND p_action <> 'set_role' THEN
    RETURN QUERY SELECT 'self'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  -- Solo un propietario gestiona propietarios y administradores.
  IF actor.role <> 'owner' AND (target.role IN ('owner', 'admin') OR p_role IN ('owner', 'admin'))
     AND NOT (target.user_id = actor_id AND p_role NOT IN ('owner', 'admin')) THEN
    RETURN QUERY SELECT 'owner_required'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  new_role := coalesce(p_role, target.role);
  IF (p_action = 'set_role' AND new_role = target.role)
     OR (p_action = 'activate' AND target.active)
     OR (p_action = 'deactivate' AND NOT target.active) THEN
    RETURN QUERY SELECT 'unchanged'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  removes_owner := target.role = 'owner' AND target.active
    AND (p_action IN ('deactivate', 'remove') OR new_role <> 'owner');
  IF removes_owner AND NOT EXISTS (
    SELECT 1 FROM public.company_members AS other
    WHERE other.company_id = p_company_id AND other.id <> target.id AND other.role = 'owner' AND other.active
  ) THEN
    RETURN QUERY SELECT 'last_owner'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  IF (p_action = 'set_role' AND new_role = 'owner' AND NOT target.active) THEN
    RETURN QUERY SELECT 'inactive'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  SELECT lower(account.email) INTO target_email FROM app_auth.users AS account WHERE account.id = target.user_id;

  IF p_action = 'activate' AND NOT EXISTS (
    SELECT 1 FROM app_auth.users AS account
    JOIN public.profiles AS profile ON profile.id = account.id
    WHERE account.id = target.user_id AND account.deleted_at IS NULL AND profile.active
  ) THEN
    RETURN QUERY SELECT 'unavailable'::text, target.user_id, target.role, target.role;
    RETURN;
  END IF;

  IF p_action = 'remove' THEN
    DELETE FROM public.company_members AS member WHERE member.id = target.id;
  ELSE
    UPDATE public.company_members AS member
    SET role = new_role,
        active = CASE p_action WHEN 'activate' THEN true WHEN 'deactivate' THEN false ELSE member.active END,
        updated_at = now()
    WHERE member.id = target.id;
  END IF;

  PERFORM private.release_member_pending_requests(
    p_company_id, target.user_id, new_role,
    p_action NOT IN ('remove', 'deactivate') AND (target.active OR p_action = 'activate')
  );

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    p_company_id, actor_id,
    CASE p_action WHEN 'set_role' THEN 'MEMBER_ROLE_UPDATED' WHEN 'activate' THEN 'MEMBER_ACTIVATED'
      WHEN 'deactivate' THEN 'MEMBER_DEACTIVATED' ELSE 'MEMBER_REMOVED' END,
    'company_member', target.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'targetUserId', target.user_id, 'email', target_email,
      'oldRole', CASE WHEN p_action = 'set_role' THEN target.role END,
      'newRole', CASE WHEN p_action = 'set_role' THEN new_role END,
      'role', CASE WHEN p_action <> 'set_role' THEN target.role END
    ))
  );

  RETURN QUERY SELECT 'ok'::text, target.user_id, target.role, new_role;
END;
$$;

-- Salir de una empresa. Resultados: ok, not_member, last_owner.
CREATE FUNCTION private.leave_company(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  membership public.company_members%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR NOT private.is_active_platform_user() THEN RETURN 'not_member'; END IF;

  PERFORM 1 FROM public.companies AS company WHERE company.id = p_company_id FOR UPDATE;
  SELECT member.* INTO membership FROM public.company_members AS member
  WHERE member.company_id = p_company_id AND member.user_id = actor_id AND member.active FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_member'; END IF;

  IF membership.role = 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.company_members AS other
    WHERE other.company_id = p_company_id AND other.id <> membership.id AND other.role = 'owner' AND other.active
  ) THEN
    RETURN 'last_owner';
  END IF;

  DELETE FROM public.company_members AS member WHERE member.id = membership.id;
  PERFORM private.release_member_pending_requests(p_company_id, actor_id, membership.role, false);

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  SELECT p_company_id, actor_id, 'MEMBER_LEFT', 'company_member', membership.id::text,
    jsonb_build_object('targetUserId', actor_id, 'email', lower(account.email), 'role', membership.role)
  FROM app_auth.users AS account WHERE account.id = actor_id;

  RETURN 'ok';
END;
$$;

-- La persona invitada rechaza una invitación dirigida a su correo verificado.
CREATE FUNCTION private.decline_company_invitation(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  actor_email text;
  invitation public.company_invitations%ROWTYPE;
BEGIN
  SELECT lower(account.email) INTO actor_email
  FROM app_auth.users AS account
  JOIN public.profiles AS profile ON profile.id = account.id
  WHERE account.id = actor_id AND account.email_confirmed_at IS NOT NULL AND account.deleted_at IS NULL
    AND profile.role IN ('contractor', 'client')
    AND ((profile.active AND profile.approved_at IS NOT NULL)
         OR (profile.role = 'contractor' AND NOT profile.active AND profile.approved_at IS NULL));
  IF actor_email IS NULL THEN RETURN NULL; END IF;

  SELECT existing.* INTO invitation FROM public.company_invitations AS existing
  WHERE existing.id = p_invitation_id AND lower(existing.email) = actor_email AND existing.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.company_invitations SET status = 'revoked', updated_at = now() WHERE id = invitation.id;
  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (invitation.company_id, actor_id, 'INVITATION_DECLINED', 'company_invitation', invitation.id::text,
    jsonb_build_object('email', invitation.email, 'role', invitation.role));
  RETURN invitation.company_id;
END;
$$;

-- Motivo por el que no se puede invitar a un correo (NULL si se puede).
CREATE FUNCTION private.company_invitation_conflict(p_company_id uuid, p_email text, p_role public.company_role)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT private.is_active_platform_user() OR NOT public.is_company_admin(p_company_id) THEN 'forbidden'
    WHEN p_role = 'owner' THEN 'forbidden'
    WHEN p_role = 'admin' AND NOT public.is_company_owner(p_company_id) THEN 'owner_required'
    WHEN EXISTS (
      SELECT 1 FROM public.company_members AS member
      JOIN app_auth.users AS account ON account.id = member.user_id
      WHERE member.company_id = p_company_id AND member.active
        AND lower(account.email) = lower(btrim(p_email))
    ) THEN 'already_member'
  END;
$$;

CREATE OR REPLACE FUNCTION private.create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_role public.company_role,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  created_invitation_id uuid,
  created_company_id uuid,
  created_email text,
  created_role public.company_role,
  created_invited_by uuid,
  created_status text,
  created_expires_at timestamptz,
  created_created_at timestamptz,
  created_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := app.current_user_id();
  v_email text := lower(btrim(p_email));
  v_invitation public.company_invitations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL
    OR v_email IS NULL
    OR char_length(v_email) > 320
    OR position('@' IN v_email) <= 1
    OR p_role IS NULL
    OR private.company_invitation_conflict(p_company_id, v_email, p_role) IS NOT NULL
    OR p_token_hash IS NULL
    OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= now()
    OR p_expires_at > now() + interval '30 days'
  THEN
    RETURN;
  END IF;

  UPDATE public.company_invitations AS invitation
  SET status = 'expired', updated_at = now()
  WHERE invitation.company_id = p_company_id
    AND lower(invitation.email) = v_email
    AND invitation.status = 'pending'
    AND invitation.expires_at <= now();

  INSERT INTO public.company_invitations AS invitation (
    company_id, email, role, token_hash, invited_by, status, expires_at
  )
  VALUES (p_company_id, v_email, p_role, p_token_hash, v_user_id, 'pending', p_expires_at)
  ON CONFLICT (company_id, lower(email)) WHERE status = 'pending'
  DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    token_hash = EXCLUDED.token_hash,
    invited_by = EXCLUDED.invited_by,
    expires_at = EXCLUDED.expires_at,
    updated_at = now()
  RETURNING invitation.*
  INTO v_invitation;

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    v_invitation.company_id, v_user_id, 'INVITATION_CREATED', 'company_invitation', v_invitation.id::text,
    jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role)
  );

  RETURN QUERY
  SELECT v_invitation.id, v_invitation.company_id, v_invitation.email, v_invitation.role,
    v_invitation.invited_by, v_invitation.status, v_invitation.expires_at,
    v_invitation.created_at, v_invitation.updated_at;
END;
$function$;

-- Terminar una vinculación cliente ↔ empresa.
-- Desde el cliente: p_client_id NULL. Desde la empresa: la ficha vinculada.
-- Resultados: ended, not_linked, forbidden.
CREATE FUNCTION private.end_client_connection(p_company_id uuid, p_client_id uuid)
RETURNS TABLE (outcome text, notify_user_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := app.current_user_id();
  from_client boolean := p_client_id IS NULL;
  customer_user_id uuid;
  ended_ids uuid[];
BEGIN
  IF actor_id IS NULL OR NOT private.is_active_platform_user() THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid[];
    RETURN;
  END IF;
  IF NOT from_client AND NOT private.can_manage_client_connections(p_company_id) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::uuid[];
    RETURN;
  END IF;

  IF from_client THEN
    customer_user_id := actor_id;
  ELSE
    SELECT customer.user_id INTO customer_user_id FROM public.clients AS customer
    WHERE customer.id = p_client_id AND customer.company_id = p_company_id;
  END IF;
  IF customer_user_id IS NULL THEN
    RETURN QUERY SELECT 'not_linked'::text, NULL::uuid[];
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text || '/' || customer_user_id::text, 41));

  -- Desde el cliente se terminan todas sus fichas en la empresa.
  WITH ended AS (
    UPDATE public.clients AS customer SET user_id = NULL, updated_at = now()
    WHERE customer.company_id = p_company_id AND customer.user_id = customer_user_id
      AND (from_client OR customer.id = p_client_id)
    RETURNING customer.id
  )
  SELECT array_agg(ended.id) INTO ended_ids FROM ended;

  IF ended_ids IS NULL THEN
    RETURN QUERY SELECT 'not_linked'::text, NULL::uuid[];
    RETURN;
  END IF;

  UPDATE private.client_connection_requests AS request
  SET status = 'cancelled', phone_code = NULL, phone_to_confirm = NULL, updated_at = now()
  WHERE request.company_id = p_company_id AND request.client_user_id = customer_user_id AND request.status = 'pending';

  INSERT INTO public.admin_audit_logs (company_id, user_id, action, target_type, target_id, metadata)
  SELECT p_company_id, actor_id, 'CLIENT_CONNECTION_ENDED', 'client', ended_id::text,
    jsonb_build_object('endedBy', CASE WHEN from_client THEN 'client' ELSE 'company' END)
  FROM unnest(ended_ids) AS ended_id;

  RETURN QUERY SELECT 'ended'::text,
    CASE WHEN from_client THEN ARRAY(
      SELECT DISTINCT member.user_id FROM public.company_members AS member
      JOIN public.profiles AS profile ON profile.id = member.user_id
      JOIN app_auth.users AS account ON account.id = member.user_id
      WHERE member.company_id = p_company_id AND member.active AND member.role IN ('owner', 'admin', 'sales')
        AND member.user_id <> actor_id AND profile.active AND account.deleted_at IS NULL
    ) ELSE ARRAY[customer_user_id] END;
END;
$$;

-- Quien envió una solicitud aceptada, para avisarle. Solo la parte que la aceptó lo obtiene.
CREATE FUNCTION private.client_connection_requester(p_request_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT request.requested_by
  FROM private.client_connection_requests AS request
  WHERE request.id = p_request_id AND request.status = 'accepted'
    AND request.requested_by IS NOT NULL AND request.requested_by <> app.current_user_id()
    AND private.is_active_platform_user()
    AND CASE WHEN request.requested_by_client
      THEN private.can_manage_client_connections(request.company_id)
      ELSE request.client_user_id = app.current_user_id() END;
$$;

-- Una solicitud aceptada cuya vinculación ya terminó se muestra como «ended».
CREATE OR REPLACE FUNCTION private.list_client_connection_requests(p_as_client boolean)
RETURNS TABLE (
  id uuid, company_id uuid, client_id uuid, name text, incoming boolean, status text,
  requires_phone_code boolean, phone_code text, phone_to_confirm text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT request.id, request.company_id, CASE WHEN NOT viewer.is_client THEN request.client_id END,
    CASE WHEN viewer.is_client THEN company.name ELSE coalesce(
      nullif(btrim(customer.business_name), ''),
      nullif(btrim(concat_ws(' ', customer.first_name, customer.last_name)), ''),
      CASE WHEN request.requested_by_client OR request.status = 'accepted'
        THEN nullif(btrim(profile.full_name), '') END,
      'Cliente Leuret'
    ) END,
    viewer.is_client <> request.requested_by_client,
    CASE WHEN request.status = 'accepted' AND NOT EXISTS (
      SELECT 1 FROM public.clients AS linked
      WHERE linked.company_id = request.company_id AND linked.user_id = request.client_user_id AND linked.active
    ) THEN 'ended' ELSE request.status END,
    request.phone_code IS NOT NULL,
    CASE WHEN NOT viewer.is_client THEN request.phone_code END,
    CASE WHEN NOT viewer.is_client THEN request.phone_to_confirm END,
    request.created_at
  FROM private.client_connection_requests AS request
  JOIN public.companies AS company ON company.id = request.company_id AND company.active
  JOIN public.profiles AS profile ON profile.id = request.client_user_id AND profile.role = 'client'
    AND profile.active AND profile.approved_at IS NOT NULL
  JOIN app_auth.users AS account ON account.id = request.client_user_id AND account.deleted_at IS NULL
    AND account.email_confirmed_at IS NOT NULL
  LEFT JOIN public.clients AS customer ON customer.id = request.client_id AND customer.company_id = request.company_id
  CROSS JOIN LATERAL (SELECT request.client_user_id = app.current_user_id() AS is_client) AS viewer
  WHERE (SELECT private.is_active_platform_user())
    AND (p_as_client IS NULL OR p_as_client = viewer.is_client)
    AND (viewer.is_client OR private.can_manage_client_connections(request.company_id))
  ORDER BY (request.status = 'pending') DESC, request.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION private.release_member_pending_requests(uuid, uuid, public.company_role, boolean),
  private.manage_company_member(uuid, uuid, text, public.company_role),
  private.leave_company(uuid),
  private.decline_company_invitation(uuid),
  private.company_invitation_conflict(uuid, text, public.company_role),
  private.end_client_connection(uuid, uuid),
  private.client_connection_requester(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.manage_company_member(uuid, uuid, text, public.company_role),
  private.leave_company(uuid),
  private.decline_company_invitation(uuid),
  private.company_invitation_conflict(uuid, text, public.company_role),
  private.end_client_connection(uuid, uuid),
  private.client_connection_requester(uuid) TO contractor_api, contractor_migrator;

-- Los miembros ya no se modifican con UPDATE/DELETE directos desde la API.
DROP POLICY IF EXISTS "Admins can update company members" ON public.company_members;
DROP POLICY IF EXISTS "Owners can delete company members" ON public.company_members;
REVOKE UPDATE, DELETE ON public.company_members FROM contractor_api;

RESET ROLE;

COMMIT;
