-- Row-level security for tenant isolation.
--
-- The API runs every tenant-scoped query inside a transaction that first calls
--   SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)
-- The third argument (true) makes the setting transaction-local, so it is
-- cleared on COMMIT/ROLLBACK and never leaks to the next user of a pooled
-- connection. With no context set, every policy below matches zero rows.
--
-- Requires the roles from scripts/setup-db-roles.sql (hosptic_app).

-- ---------------------------------------------------------------------------
-- Context helpers
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- Grants for the restricted runtime role
GRANT USAGE ON SCHEMA public TO hosptic_app;
GRANT SELECT, INSERT, UPDATE ON "organizations" TO hosptic_app;
GRANT SELECT, INSERT, UPDATE ON "users" TO hosptic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships", "sessions", "datasets", "dataset_columns",
  "dataset_transformations", "analyses", "analysis_results", "reports" TO hosptic_app;
-- Audit log is append-only for the application.
GRANT SELECT, INSERT ON "audit_logs" TO hosptic_app;
GRANT EXECUTE ON FUNCTION app_current_org(), app_current_user() TO hosptic_app;

-- ---------------------------------------------------------------------------
-- Enable RLS
ALTER TABLE "organizations"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "datasets"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dataset_columns"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dataset_transformations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analyses"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_results"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"              ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- organizations: a tenant sees and edits only itself. No DELETE policy.
CREATE POLICY org_select ON "organizations" FOR SELECT TO hosptic_app USING ("id" = app_current_org());
CREATE POLICY org_insert ON "organizations" FOR INSERT TO hosptic_app WITH CHECK ("id" = app_current_org());
CREATE POLICY org_update ON "organizations" FOR UPDATE TO hosptic_app
  USING ("id" = app_current_org()) WITH CHECK ("id" = app_current_org());

-- users: visible to themselves, or to an organisation they are a member of.
CREATE POLICY users_select ON "users" FOR SELECT TO hosptic_app USING (
  "id" = app_current_user()
  OR EXISTS (
    SELECT 1 FROM "memberships" m
    WHERE m."userId" = "users"."id" AND m."organizationId" = app_current_org()
  )
);
CREATE POLICY users_insert ON "users" FOR INSERT TO hosptic_app WITH CHECK ("id" = app_current_user());
CREATE POLICY users_update ON "users" FOR UPDATE TO hosptic_app
  USING ("id" = app_current_user()) WITH CHECK ("id" = app_current_user());

-- memberships: the organisation's rows, plus the current user's own rows
-- (needed to resolve which organisation a signed-in user belongs to).
-- Writes are limited to the current organisation.
CREATE POLICY memberships_select ON "memberships" FOR SELECT TO hosptic_app
  USING ("organizationId" = app_current_org() OR "userId" = app_current_user());
CREATE POLICY memberships_insert ON "memberships" FOR INSERT TO hosptic_app
  WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY memberships_update ON "memberships" FOR UPDATE TO hosptic_app
  USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY memberships_delete ON "memberships" FOR DELETE TO hosptic_app
  USING ("organizationId" = app_current_org());

-- sessions: owned by the user.
CREATE POLICY sessions_all ON "sessions" FOR ALL TO hosptic_app
  USING ("userId" = app_current_user()) WITH CHECK ("userId" = app_current_user());

-- Organisation-owned tables: one policy per command.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['datasets','dataset_columns','dataset_transformations','analyses','analysis_results','reports']
  LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO hosptic_app USING ("organizationId" = app_current_org())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO hosptic_app WITH CHECK ("organizationId" = app_current_org())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO hosptic_app USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO hosptic_app USING ("organizationId" = app_current_org())', t || '_delete', t);
  END LOOP;
END $$;

-- audit_logs: read and append within the organisation only.
CREATE POLICY audit_select ON "audit_logs" FOR SELECT TO hosptic_app USING ("organizationId" = app_current_org());
CREATE POLICY audit_insert ON "audit_logs" FOR INSERT TO hosptic_app WITH CHECK ("organizationId" = app_current_org());

-- ---------------------------------------------------------------------------
-- Narrow lookups that must run before a tenant context exists.
-- SECURITY DEFINER functions owned by the schema owner. Each returns the
-- minimum needed and nothing else.

-- Login: find a user by exact email.
CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email text)
  RETURNS TABLE (id uuid, "passwordHash" text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT u."id", u."passwordHash" FROM "users" u WHERE u."email" = lower(p_email) LIMIT 1 $$;

-- Invite acceptance: resolve a pending invitation by token hash.
CREATE OR REPLACE FUNCTION auth_find_invitation(p_token_hash text)
  RETURNS TABLE (id uuid, "organizationId" uuid, "userId" uuid, "inviteExpiresAt" timestamp(3))
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT m."id", m."organizationId", m."userId", m."inviteExpiresAt"
    FROM "memberships" m
    WHERE m."inviteTokenHash" = p_token_hash AND m."status" = 'INVITED'
    LIMIT 1
  $$;

-- Invites: create a passwordless user for an email if none exists, return its id.
CREATE OR REPLACE FUNCTION auth_ensure_invited_user(p_id uuid, p_email text, p_full_name text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE v_id uuid;
  BEGIN
    IF app_current_org() IS NULL THEN
      RAISE EXCEPTION 'organisation context required';
    END IF;
    SELECT u."id" INTO v_id FROM "users" u WHERE u."email" = lower(p_email);
    IF v_id IS NULL THEN
      INSERT INTO "users" ("id", "fullName", "email", "passwordHash", "createdAt", "updatedAt")
      VALUES (p_id, p_full_name, lower(p_email), NULL, now(), now())
      RETURNING "id" INTO v_id;
    END IF;
    RETURN v_id;
  END $$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text), auth_find_invitation(text),
  auth_ensure_invited_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text), auth_find_invitation(text),
  auth_ensure_invited_user(uuid, text, text) TO hosptic_app;
