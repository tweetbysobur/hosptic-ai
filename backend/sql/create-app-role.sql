-- Run once as a database owner, for example:
--   psql "$DIRECT_URL" -v app_password="'<strong-password>'" -f sql/create-app-role.sql
-- The application connects as hosptic_app. It owns no tables and has no BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hosptic_app') THEN
    CREATE ROLE hosptic_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE hosptic_app WITH PASSWORD :app_password;
GRANT USAGE ON SCHEMA public TO hosptic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hosptic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hosptic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hosptic_app;
