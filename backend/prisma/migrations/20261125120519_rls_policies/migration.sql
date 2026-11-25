-- Row-Level Security for tenant isolation.
-- Tenant context is set per transaction with set_config(..., true) by the application.
-- The runtime role must NOT own these tables and must NOT have BYPASSRLS.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Organization: the row is the tenant itself.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_select ON "Organization" FOR SELECT USING (id = app_current_org());
CREATE POLICY organization_insert ON "Organization" FOR INSERT WITH CHECK (id = app_current_org());
CREATE POLICY organization_update ON "Organization" FOR UPDATE USING (id = app_current_org()) WITH CHECK (id = app_current_org());
CREATE POLICY organization_delete ON "Organization" FOR DELETE USING (false);

-- Membership: members of the current org, plus a user's own memberships (login and org resolution).
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_select ON "Membership" FOR SELECT USING ("organizationId" = app_current_org() OR "userId" = app_current_user());
CREATE POLICY membership_insert ON "Membership" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY membership_update ON "Membership" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY membership_delete ON "Membership" FOR DELETE USING ("organizationId" = app_current_org());

-- RefreshToken: belongs to a user, visible only in that user's context.
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_select ON "RefreshToken" FOR SELECT USING ("userId" = app_current_user());
CREATE POLICY refresh_token_insert ON "RefreshToken" FOR INSERT WITH CHECK ("userId" = app_current_user());
CREATE POLICY refresh_token_update ON "RefreshToken" FOR UPDATE USING ("userId" = app_current_user()) WITH CHECK ("userId" = app_current_user());
CREATE POLICY refresh_token_delete ON "RefreshToken" FOR DELETE USING ("userId" = app_current_user());

-- Standard tenant tables: every command is restricted to the current organization.
ALTER TABLE "Dataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dataset" FORCE ROW LEVEL SECURITY;
CREATE POLICY dataset_select ON "Dataset" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY dataset_insert ON "Dataset" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY dataset_update ON "Dataset" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY dataset_delete ON "Dataset" FOR DELETE USING ("organizationId" = app_current_org());

ALTER TABLE "DatasetColumn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetColumn" FORCE ROW LEVEL SECURITY;
CREATE POLICY dataset_column_select ON "DatasetColumn" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY dataset_column_insert ON "DatasetColumn" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY dataset_column_update ON "DatasetColumn" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY dataset_column_delete ON "DatasetColumn" FOR DELETE USING ("organizationId" = app_current_org());

-- Analyses are historical records: they cannot be deleted by the application role.
ALTER TABLE "Analysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Analysis" FORCE ROW LEVEL SECURITY;
CREATE POLICY analysis_select ON "Analysis" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY analysis_insert ON "Analysis" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY analysis_update ON "Analysis" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY analysis_delete ON "Analysis" FOR DELETE USING (false);

ALTER TABLE "AnalysisResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalysisResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY analysis_result_select ON "AnalysisResult" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY analysis_result_insert ON "AnalysisResult" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY analysis_result_update ON "AnalysisResult" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY analysis_result_delete ON "AnalysisResult" FOR DELETE USING ("organizationId" = app_current_org());

ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" FORCE ROW LEVEL SECURITY;
CREATE POLICY report_select ON "Report" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY report_insert ON "Report" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY report_update ON "Report" FOR UPDATE USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY report_delete ON "Report" FOR DELETE USING (false);

-- Audit logs are append-only for the application role.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_select ON "AuditLog" FOR SELECT USING ("organizationId" = app_current_org());
CREATE POLICY audit_log_insert ON "AuditLog" FOR INSERT WITH CHECK ("organizationId" = app_current_org());
CREATE POLICY audit_log_update ON "AuditLog" FOR UPDATE USING (false);
CREATE POLICY audit_log_delete ON "AuditLog" FOR DELETE USING (false);
