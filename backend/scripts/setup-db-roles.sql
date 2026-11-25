-- Run once per environment as a database administrator (not as the app).
-- Creates two roles:
--   hosptic_owner : owns the schema and runs migrations (DIRECT_URL)
--   hosptic_app   : restricted runtime role used by the API (DATABASE_URL)
-- hosptic_app is NOT a superuser, has NOBYPASSRLS and does not own any table,
-- so PostgreSQL row-level security always applies to it.
--
-- Usage:
--   psql "$ADMIN_URL" -v owner_password="'...'" -v app_password="'...'" -v db_name=hosptic -f scripts/setup-db-roles.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hosptic_owner') THEN
    CREATE ROLE hosptic_owner LOGIN NOSUPERUSER NOBYPASSRLS CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hosptic_app') THEN
    CREATE ROLE hosptic_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

ALTER ROLE hosptic_owner PASSWORD :owner_password;
ALTER ROLE hosptic_app PASSWORD :app_password;
ALTER ROLE hosptic_app NOSUPERUSER NOBYPASSRLS;

SELECT format('GRANT CONNECT ON DATABASE %I TO hosptic_app', :'db_name') \gexec
SELECT format('ALTER DATABASE %I OWNER TO hosptic_owner', :'db_name') \gexec
