-- CreateEnum
CREATE TYPE "WorkAuthorization" AS ENUM ('us_citizen', 'green_card', 'h1b', 'opt_ead', 'gc_ead', 'other');

-- CreateEnum
CREATE TYPE "DatePosted" AS ENUM ('today', 'last_3_days', 'all');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('contract_c2c', 'fulltime', 'both');

-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('remote', 'hybrid', 'onsite', 'any');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('city', 'state', 'remote');

-- CreateEnum
CREATE TYPE "PortalCode" AS ENUM ('DICE', 'ZIPRECRUITER', 'INDEED', 'MONSTER');

-- CreateEnum
CREATE TYPE "PortalAccountStatus" AS ENUM ('connected', 'disconnected', 'reauth_required', 'error');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('processing', 'applied', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('below_match_threshold', 'already_applied', 'duplicate_job', 'job_unavailable', 'location_mismatch', 'employment_type_mismatch', 'application_not_supported', 'user_filter_mismatch');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('login_failed', 'session_expired_reauth_failed', 'job_unavailable', 'apply_button_unavailable', 'form_changed', 'mandatory_field_unfillable', 'resume_upload_failed', 'website_error', 'timeout', 'unexpected_application_step', 'captcha_interruption', 'network_error', 'unknown_error');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('idle', 'starting', 'logging_in', 'searching', 'analyzing', 'applying', 'waiting', 'paused', 'resuming', 'completed', 'failed', 'stopped');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "workAuthorization" "WorkAuthorization",
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applicationLimit" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeJobRole" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeJobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPreference" (
    "id" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "datePosted" "DatePosted" NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "workArrangement" "WorkArrangement" NOT NULL,
    "matchThresholdPercent" INTEGER NOT NULL,
    "skipCoverLetter" BOOLEAN NOT NULL DEFAULT true,
    "skipOptionalMessage" BOOLEAN NOT NULL DEFAULT true,
    "skipPortfolio" BOOLEAN NOT NULL DEFAULT true,
    "fillLinkedIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRoleLocation" (
    "id" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "locationType" "LocationType" NOT NULL,
    "city" TEXT,
    "state" TEXT,

    CONSTRAINT "JobRoleLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPortal" (
    "id" TEXT NOT NULL,
    "code" "PortalCode" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobPortalId" TEXT NOT NULL,
    "status" "PortalAccountStatus" NOT NULL DEFAULT 'disconnected',
    "accountEmail" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionAuthTag" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "sessionStateEncrypted" TEXT,
    "sessionStateIv" TEXT,
    "sessionStateAuthTag" TEXT,
    "sessionStateKeyVersion" INTEGER,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobPortalId" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "employmentTypeRaw" TEXT,
    "workArrangementRaw" TEXT,
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "resumeId" TEXT,
    "portalAccountId" TEXT NOT NULL,
    "botRunId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'processing',
    "platformMatchScore" INTEGER,
    "internalMatchScore" INTEGER,
    "skipReason" "SkipReason",
    "failureReason" "FailureReason",
    "failureDetail" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'idle',
    "currentBotRunId" TEXT,
    "currentPlatform" "PortalCode",
    "currentJobRoleId" TEXT,
    "currentJobTitle" TEXT,
    "progressApplied" INTEGER NOT NULL DEFAULT 0,
    "progressSkipped" INTEGER NOT NULL DEFAULT 0,
    "progressFailed" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "pacingDelaySeconds" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'starting',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalApplied" INTEGER NOT NULL DEFAULT 0,
    "totalSkipped" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRunRole" (
    "id" TEXT NOT NULL,
    "botRunId" TEXT NOT NULL,
    "jobRoleId" TEXT NOT NULL,
    "applicationLimitSnapshot" INTEGER NOT NULL,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BotRunRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRunPortal" (
    "id" TEXT NOT NULL,
    "botRunId" TEXT NOT NULL,
    "jobPortalId" TEXT NOT NULL,
    "portalAccountId" TEXT NOT NULL,

    CONSTRAINT "BotRunPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "botRunId" TEXT NOT NULL,
    "jobRoleId" TEXT,
    "jobId" TEXT,
    "applicationId" TEXT,
    "level" "LogLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "Resume_userId_idx" ON "Resume"("userId");

-- CreateIndex
CREATE INDEX "JobRole_userId_idx" ON "JobRole"("userId");

-- CreateIndex
CREATE INDEX "ResumeJobRole_jobRoleId_idx" ON "ResumeJobRole"("jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeJobRole_resumeId_jobRoleId_key" ON "ResumeJobRole"("resumeId", "jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPreference_jobRoleId_key" ON "JobPreference"("jobRoleId");

-- CreateIndex
CREATE INDEX "JobRoleLocation_jobRoleId_idx" ON "JobRoleLocation"("jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPortal_code_key" ON "JobPortal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_userId_jobPortalId_key" ON "PortalAccount"("userId", "jobPortalId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobPortalId_externalJobId_key" ON "Job"("jobPortalId", "externalJobId");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_createdAt_idx" ON "Application"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_userId_key" ON "Bot"("userId");

-- CreateIndex
CREATE INDEX "BotRun_userId_status_idx" ON "BotRun"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BotRunRole_botRunId_jobRoleId_key" ON "BotRunRole"("botRunId", "jobRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "BotRunPortal_botRunId_jobPortalId_key" ON "BotRunPortal"("botRunId", "jobPortalId");

-- CreateIndex
CREATE INDEX "BotLog_botRunId_createdAt_idx" ON "BotLog"("botRunId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRole" ADD CONSTRAINT "JobRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeJobRole" ADD CONSTRAINT "ResumeJobRole_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeJobRole" ADD CONSTRAINT "ResumeJobRole_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPreference" ADD CONSTRAINT "JobPreference_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRoleLocation" ADD CONSTRAINT "JobRoleLocation_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_jobPortalId_fkey" FOREIGN KEY ("jobPortalId") REFERENCES "JobPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_jobPortalId_fkey" FOREIGN KEY ("jobPortalId") REFERENCES "JobPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "PortalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRun" ADD CONSTRAINT "BotRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunRole" ADD CONSTRAINT "BotRunRole_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunRole" ADD CONSTRAINT "BotRunRole_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunPortal" ADD CONSTRAINT "BotRunPortal_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunPortal" ADD CONSTRAINT "BotRunPortal_jobPortalId_fkey" FOREIGN KEY ("jobPortalId") REFERENCES "JobPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunPortal" ADD CONSTRAINT "BotRunPortal_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "PortalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotLog" ADD CONSTRAINT "BotLog_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotLog" ADD CONSTRAINT "BotLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes — not expressible in schema.prisma's DSL, added by
-- hand here. See SYSTEM_DESIGN.md §5 and the TODO(partial-index) comments
-- in schema.prisma for why these two specific constraints exist.

-- At most one isPrimary=true resume assignment per job role.
CREATE UNIQUE INDEX "ResumeJobRole_jobRoleId_isPrimary_unique"
  ON "ResumeJobRole" ("jobRoleId")
  WHERE "isPrimary" = true;

-- At most one active BotRun per user (mirrors the app-layer guard in
-- apps/api/src/services/bot.service.ts as a hard DB-level guarantee).
CREATE UNIQUE INDEX "BotRun_userId_active_unique"
  ON "BotRun" ("userId")
  WHERE "status" IN ('starting', 'logging_in', 'searching', 'analyzing', 'applying', 'waiting', 'paused', 'resuming');
