-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ORGANIZATION_ADMIN', 'RESEARCHER', 'ANALYST', 'VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "DatasetStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "aiProcessingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessingUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "datasets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "uploadedById" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "processedStorageKey" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rowCount" INTEGER,
    "columnCount" INTEGER,
    "status" "DatasetStatus" NOT NULL DEFAULT 'UPLOADED',
    "qualityReport" JSONB,
    "errorMessage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dataset_columns" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "columnName" TEXT NOT NULL,
    "inferredType" TEXT NOT NULL,
    "missingCount" INTEGER NOT NULL,
    "uniqueCount" INTEGER NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    CONSTRAINT "dataset_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dataset_transformations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "appliedById" UUID,
    "operations" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "inputStorageKey" TEXT NOT NULL,
    "outputStorageKey" TEXT NOT NULL,
    "rowCountBefore" INTEGER NOT NULL,
    "rowCountAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_transformations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "userId" UUID,
    "question" TEXT NOT NULL,
    "analysisType" TEXT,
    "plan" JSONB,
    "planSource" TEXT,
    "sourceStorageKey" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analysis_results" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "methodology" JSONB NOT NULL,
    "statisticalResults" JSONB NOT NULL,
    "interpretation" TEXT NOT NULL,
    "interpretationSource" TEXT NOT NULL,
    "visualizationData" JSONB,
    "assumptions" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "generatedById" UUID,
    "title" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "memberships_inviteTokenHash_key" ON "memberships"("inviteTokenHash");
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE UNIQUE INDEX "datasets_id_organizationId_key" ON "datasets"("id", "organizationId");
CREATE INDEX "datasets_organizationId_createdAt_idx" ON "datasets"("organizationId", "createdAt");
CREATE INDEX "dataset_columns_organizationId_idx" ON "dataset_columns"("organizationId");
CREATE UNIQUE INDEX "dataset_columns_datasetId_columnName_key" ON "dataset_columns"("datasetId", "columnName");
CREATE INDEX "dataset_transformations_organizationId_datasetId_idx" ON "dataset_transformations"("organizationId", "datasetId");
CREATE UNIQUE INDEX "analyses_id_organizationId_key" ON "analyses"("id", "organizationId");
CREATE INDEX "analyses_organizationId_createdAt_idx" ON "analyses"("organizationId", "createdAt");
CREATE INDEX "analyses_datasetId_idx" ON "analyses"("datasetId");
CREATE UNIQUE INDEX "analysis_results_analysisId_key" ON "analysis_results"("analysisId");
CREATE UNIQUE INDEX "analysis_results_analysisId_organizationId_key" ON "analysis_results"("analysisId", "organizationId");
CREATE INDEX "analysis_results_organizationId_idx" ON "analysis_results"("organizationId");
CREATE INDEX "reports_organizationId_createdAt_idx" ON "reports"("organizationId", "createdAt");
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dataset_columns" ADD CONSTRAINT "dataset_columns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_columns" ADD CONSTRAINT "dataset_columns_datasetId_organizationId_fkey" FOREIGN KEY ("datasetId", "organizationId") REFERENCES "datasets"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_transformations" ADD CONSTRAINT "dataset_transformations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_transformations" ADD CONSTRAINT "dataset_transformations_datasetId_organizationId_fkey" FOREIGN KEY ("datasetId", "organizationId") REFERENCES "datasets"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_transformations" ADD CONSTRAINT "dataset_transformations_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_datasetId_organizationId_fkey" FOREIGN KEY ("datasetId", "organizationId") REFERENCES "datasets"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_analysisId_organizationId_fkey" FOREIGN KEY ("analysisId", "organizationId") REFERENCES "analyses"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_analysisId_organizationId_fkey" FOREIGN KEY ("analysisId", "organizationId") REFERENCES "analyses"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
