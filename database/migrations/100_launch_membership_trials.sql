CREATE TABLE private.launch_membership_campaign (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  starts_at timestamptz,
  assigned integer NOT NULL DEFAULT 0 CHECK (assigned BETWEEN 0 AND 50)
);

INSERT INTO private.launch_membership_campaign (starts_at)
VALUES (TIMESTAMPTZ '2027-01-02 00:00:00 America/Panama');

CREATE TABLE private.membership_trials (
  user_id uuid PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('standard', 'founder')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at)
);

REVOKE ALL ON private.launch_membership_campaign, private.membership_trials
  FROM PUBLIC, contractor_api;

CREATE FUNCTION private.assign_founder_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  verified_at timestamptz := NEW.email_confirmed_at;
BEGIN
  IF verified_at IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.email_confirmed_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  UPDATE private.launch_membership_campaign
  SET assigned = assigned + 1
  WHERE singleton AND starts_at <= verified_at AND assigned < 50;
  IF FOUND THEN
    INSERT INTO private.membership_trials (user_id, kind, starts_at, ends_at)
    VALUES (
      NEW.id, 'founder', verified_at,
      ((verified_at AT TIME ZONE 'America/Panama') + interval '3 months') AT TIME ZONE 'America/Panama'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_founder_membership() FROM PUBLIC;

CREATE TRIGGER assign_founder_membership
AFTER INSERT OR UPDATE OF email_confirmed_at ON app_auth.users
FOR EACH ROW EXECUTE FUNCTION private.assign_founder_membership();

CREATE FUNCTION private.membership_trial(activate boolean)
RETURNS TABLE (kind text, ends_at timestamptz, active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  account_id uuid := app.current_user_id();
  current_time_at_request timestamptz := statement_timestamp();
BEGIN
  IF account_id IS NULL THEN
    RETURN;
  END IF;

  IF activate AND EXISTS (
    SELECT 1 FROM app_auth.users AS account
    JOIN public.profiles AS profile ON profile.id = account.id
    WHERE account.id = account_id AND account.email_confirmed_at IS NOT NULL
      AND account.deleted_at IS NULL AND profile.active AND profile.approved_at IS NOT NULL
  ) THEN
    INSERT INTO private.membership_trials (user_id, kind, starts_at, ends_at)
    VALUES (account_id, 'standard', current_time_at_request, current_time_at_request + interval '168 hours')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT trial.kind, trial.ends_at, trial.ends_at > current_time_at_request
  FROM private.membership_trials AS trial
  WHERE trial.user_id = account_id;
END;
$$;

REVOKE ALL ON FUNCTION private.membership_trial(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.membership_trial(boolean) TO contractor_api;
