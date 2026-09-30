-- Gesperrte Konten (status = 'blocked' | 'rejected') serverseitig durchsetzen.
--
-- Schichten:
--   1) RLS: gesperrte Konten verlieren sofort den Zugriff auf alle aktuell
--      RLS-geschuetzten Tabellen im public-Schema und auf Storage-Dateien.
--   2) Auth: gesperrte Konten koennen sich nicht mehr anmelden / Tokens erneuern.
--
-- Semantik wie in der App: Konten ohne Approval-Eintrag sowie pending/approved
-- bleiben aktiv. Administratoren werden nie ausgesperrt.

-- 1) Hilfsfunktion --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR NOT EXISTS (
        SELECT 1
          FROM public.account_approvals a
         WHERE a.auth_user_id = auth.uid()
           AND a.status IN ('blocked', 'rejected')
      );
$$;

REVOKE ALL ON FUNCTION public.is_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active() TO authenticated, service_role;

-- 2) RESTRICTIVE-Policies -------------------------------------------------
-- Nicht mit einer statischen Tabellenliste arbeiten: so werden alle aktuell
-- RLS-geschuetzten public-Tabellen erfasst, auch neuere Module.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Gesperrte Konten ausgeschlossen',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.is_account_active())) '
      'WITH CHECK ((SELECT public.is_account_active()))',
      'Gesperrte Konten ausgeschlossen',
      t
    );
  END LOOP;
END
$$;

-- Dateien (Storage) ebenfalls sperren.
DROP POLICY IF EXISTS "Gesperrte Konten ausgeschlossen" ON storage.objects;
CREATE POLICY "Gesperrte Konten ausgeschlossen" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.is_account_active()))
  WITH CHECK ((SELECT public.is_account_active()));

-- 3) Anmeldung sperren: Ban in Supabase Auth mit Approval-Status synchronisieren
CREATE OR REPLACE FUNCTION public.sync_account_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
BEGIN
  -- Beim Loeschen eines zuvor gesperrten Approval-Eintrags den Ban aufheben.
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('blocked', 'rejected')
       AND NOT public.has_role(OLD.auth_user_id, 'admin') THEN
      UPDATE auth.users
         SET banned_until = NULL
       WHERE id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;

  target_user := NEW.auth_user_id;

  -- Falls bei einem Update die Benutzer-ID geaendert wurde, einen alten Ban
  -- nicht versehentlich am vorherigen Konto haengen lassen.
  IF TG_OP = 'UPDATE'
     AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id
     AND OLD.status IN ('blocked', 'rejected')
     AND NOT public.has_role(OLD.auth_user_id, 'admin') THEN
    UPDATE auth.users
       SET banned_until = NULL
     WHERE id = OLD.auth_user_id;
  END IF;

  -- Administratoren niemals aussperren.
  IF public.has_role(target_user, 'admin') THEN
    UPDATE auth.users
       SET banned_until = NULL
     WHERE id = target_user;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('blocked', 'rejected') THEN
    UPDATE auth.users
       SET banned_until = now() + interval '100 years'
     WHERE id = target_user;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('blocked', 'rejected') THEN
    UPDATE auth.users
       SET banned_until = NULL
     WHERE id = target_user;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.sync_account_ban() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_account_approvals_sync_ban ON public.account_approvals;
CREATE TRIGGER t_account_approvals_sync_ban
  AFTER INSERT OR UPDATE OF status, auth_user_id OR DELETE
  ON public.account_approvals
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_ban();

-- Bereits gesperrte Konten einmalig nachziehen.
UPDATE auth.users u
   SET banned_until = now() + interval '100 years'
  FROM public.account_approvals a
 WHERE a.auth_user_id = u.id
   AND a.status IN ('blocked', 'rejected')
   AND NOT public.has_role(u.id, 'admin');
