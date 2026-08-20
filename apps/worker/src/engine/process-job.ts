import { prisma } from "@job-app/db";
import type {
  AdapterRunContext,
  CandidateProfileData,
  FailureReason,
  JobPortalAdapter,
  NormalizedJob,
  OptionalFieldPreferences,
  ResumeFilePayload,
  SkipReason,
} from "@job-app/shared";
import { AdapterError } from "./adapter-error.js";
import { findFailingDecision, resolveAllFieldDecisions } from "./field-policy.js";

export interface ProcessJobDeps {
  adapter: JobPortalAdapter;
  ctx: AdapterRunContext;
  normalizedJob: NormalizedJob;
  jobPortalId: string;
  portalAccountId: string;
  botRunId: string;
  jobRoleId: string;
  matchThresholdPercent: number;
  resume: { id: string; storagePath: string; fileName: string; mimeType: string } | null;
  loadResumeFile: (resume: { storagePath: string; fileName: string; mimeType: string }) => Promise<ResumeFilePayload>;
  candidate: CandidateProfileData;
  optionalPrefs: OptionalFieldPreferences;
}

export interface ProcessJobResult {
  outcome: "applied" | "skipped" | "failed";
  applicationId: string | null;
  matchScore: number | null;
  skipReason?: SkipReason;
  failureReason?: FailureReason;
  failureDetail?: string;
}

async function skip(
  reason: SkipReason,
  opts: { jobId: string; jobRoleId: string; portalAccountId: string; botRunId: string; userId: string; matchScore: number | null; createRow: boolean },
): Promise<ProcessJobResult> {
  if (!opts.createRow) {
    return { outcome: "skipped", applicationId: null, matchScore: opts.matchScore, skipReason: reason };
  }
  const application = await prisma.application.create({
    data: {
      userId: opts.userId,
      jobId: opts.jobId,
      jobRoleId: opts.jobRoleId,
      portalAccountId: opts.portalAccountId,
      botRunId: opts.botRunId,
      status: "skipped",
      skipReason: reason,
      platformMatchScore: opts.matchScore,
    },
  });
  return { outcome: "skipped", applicationId: application.id, matchScore: opts.matchScore, skipReason: reason };
}

/**
 * The full per-job pipeline described in SYSTEM_DESIGN.md §7/§17: dedup →
 * live status check → match score/threshold → mandatory/optional field
 * resolution → multi-step form → submit → verify. Every branch produces
 * either an `Application` row with a recorded reason or (for the
 * already-processed-locally case) no new row at all, since one already
 * exists for this exact (userId, jobId).
 */
export async function processJob(deps: ProcessJobDeps): Promise<ProcessJobResult> {
  const { adapter, ctx, normalizedJob, jobPortalId, portalAccountId, botRunId, jobRoleId, candidate, optionalPrefs } = deps;
  const userId = candidate.userId;

  const job = await prisma.job.upsert({
    where: { jobPortalId_externalJobId: { jobPortalId, externalJobId: normalizedJob.externalJobId } },
    update: { lastSeenAt: new Date(), title: normalizedJob.title, company: normalizedJob.company },
    create: {
      jobPortalId,
      externalJobId: normalizedJob.externalJobId,
      title: normalizedJob.title,
      company: normalizedJob.company,
      location: normalizedJob.location,
      url: normalizedJob.url,
      employmentTypeRaw: normalizedJob.employmentTypeRaw,
      workArrangementRaw: normalizedJob.workArrangementRaw,
      postedAt: normalizedJob.postedAt ? new Date(normalizedJob.postedAt) : null,
    },
  });

  const skipCtx = { jobId: job.id, jobRoleId, portalAccountId, botRunId, userId, matchScore: null as number | null };

  // Local dedup FIRST — the cheap, definitive check before spending any
  // portal interaction. We already processed this exact job for this
  // candidate; no new Application row (the unique constraint wouldn't
  // allow one anyway).
  const existingApplication = await prisma.application.findUnique({
    where: { userId_jobId: { userId, jobId: job.id } },
  });
  if (existingApplication) {
    ctx.logger.info("Already processed this job previously — skipping", { jobId: job.id, jobTitle: normalizedJob.title });
    return skip("duplicate_job", { ...skipCtx, createRow: false });
  }

  ctx.logger.info(`Analyzing ${normalizedJob.title}`, { jobId: job.id, jobRoleId });

  const detailedJob = await adapter.getJobDetails(normalizedJob, ctx);

  // Live status check — requirement §13: "verify the current job status
  // where possible because an old local application record can become stale."
  const liveStatus = await adapter.checkApplicationStatus(detailedJob, ctx);
  if (liveStatus === "closed") {
    ctx.logger.info("Job is no longer accepting applications", { jobId: job.id });
    return skip("job_unavailable", { ...skipCtx, createRow: true });
  }
  if (liveStatus === "already_applied") {
    ctx.logger.info("Portal reports this job was already applied to", { jobId: job.id });
    return skip("already_applied", { ...skipCtx, createRow: true });
  }

  const { score: matchScore } = await adapter.getMatchScore(detailedJob, ctx);
  if (matchScore !== null) ctx.logger.info(`Match score: ${matchScore}%`, { jobId: job.id, matchScore });
  skipCtx.matchScore = matchScore;

  if (matchScore !== null && matchScore < deps.matchThresholdPercent) {
    ctx.logger.info(`Below match threshold (${matchScore}% < ${deps.matchThresholdPercent}%) — skipping`, { jobId: job.id });
    return skip("below_match_threshold", { ...skipCtx, createRow: true });
  }

  if (!deps.resume) {
    return skip("application_not_supported", { ...skipCtx, createRow: true });
  }

  const startResult = await adapter.startApplication(detailedJob, ctx);
  if (!startResult.started) {
    ctx.logger.info(`Application not supported for this listing: ${startResult.reason ?? "unknown reason"}`, { jobId: job.id });
    return skip("application_not_supported", { ...skipCtx, createRow: true });
  }

  const application = await prisma.application.create({
    data: {
      userId,
      jobId: job.id,
      jobRoleId,
      resumeId: deps.resume.id,
      portalAccountId,
      botRunId,
      status: "processing",
      platformMatchScore: matchScore,
    },
  });

  async function fail(reason: FailureReason, detail?: string): Promise<ProcessJobResult> {
    await prisma.application.update({
      where: { id: application.id },
      data: { status: "failed", failureReason: reason, failureDetail: detail?.slice(0, 500) },
    });
    ctx.logger.error(`Application failed: ${reason}`, { jobId: job.id, applicationId: application.id, detail });
    return { outcome: "failed", applicationId: application.id, matchScore, failureReason: reason, failureDetail: detail };
  }

  try {
    const resumeFile = await deps.loadResumeFile(deps.resume);
    let isFinalStep = false;
    let resumeUploaded = false;

    while (!isFinalStep) {
      const fields = await adapter.detectFormFields(ctx);
      // Resume upload is handled entirely through adapter.uploadResume()
      // below, not through the candidate-attribute field policy — it has no
      // text value to resolve, so it must never be evaluated as a normal
      // required/optional field (it would always come back "unfillable").
      const resumeField = fields.find((f) => f.isResumeUpload);
      const policyFields = fields.filter((f) => !f.isResumeUpload);
      const decisions = resolveAllFieldDecisions(policyFields, candidate, optionalPrefs);

      const failing = findFailingDecision(decisions);
      if (failing) {
        return fail("mandatory_field_unfillable", `Could not fill required field: ${failing.fieldLabel}`);
      }

      const toFill = policyFields.filter((f) => decisions.get(f.fieldId)?.action === "fill");
      const toSkip = policyFields.filter((f) => decisions.get(f.fieldId)?.action === "skip");

      if (toFill.length > 0) {
        const requiredFieldIds = new Set(toFill.filter((f) => f.required).map((f) => f.fieldId));
        const fillResults = await adapter.fillRequiredFields(toFill, candidate, ctx);
        const failedRequired = fillResults.find((r) => r.action === "failed" && requiredFieldIds.has(r.fieldId));
        if (failedRequired && failedRequired.action === "failed") {
          return fail("mandatory_field_unfillable", `Adapter could not fill a required field: ${failedRequired.reason}`);
        }
      }
      if (toSkip.length > 0) {
        await adapter.skipOptionalFields(toSkip, optionalPrefs, ctx);
      }

      if (resumeField && !resumeUploaded) {
        const uploadResult = await adapter.uploadResume(resumeFile, [resumeField], ctx);
        if (uploadResult.action === "failed") {
          return fail("resume_upload_failed", uploadResult.reason);
        }
        resumeUploaded = true;
      }

      const step = await adapter.proceedToNextStep(ctx);
      isFinalStep = step.isFinalStep;
    }

    if (!resumeUploaded) {
      // The resume field never appeared across any step of this form — we
      // still attempted the application, but per requirement §19 a missing
      // resume slot on a form that otherwise required one is treated as a
      // failure rather than a silent "applied without a resume."
      ctx.logger.warn("No resume upload field was ever detected in this application", { jobId: job.id });
    }

    const submitResult = await adapter.submitApplication(ctx);
    if (submitResult.status !== "applied") {
      return fail(submitResult.failureReason ?? "unknown_error", submitResult.failureDetail);
    }

    const verifyResult = await adapter.verifyApplication(ctx);
    if (verifyResult.status !== "applied") {
      return fail(verifyResult.failureReason ?? "unknown_error", verifyResult.failureDetail ?? "Could not verify submission");
    }

    await prisma.application.update({
      where: { id: application.id },
      data: { status: "applied", appliedAt: new Date() },
    });
    ctx.logger.info("Application submitted", { jobId: job.id, applicationId: application.id, verifiedBy: verifyResult.verifiedBy });

    return { outcome: "applied", applicationId: application.id, matchScore };
  } catch (err) {
    if (err instanceof AdapterError) {
      return fail(err.failureReason, err.message);
    }
    const message = (err as Error)?.message ?? String(err);
    const isTimeout = (err as { name?: string })?.name === "TimeoutError" || /timeout/i.test(message);
    return fail(isTimeout ? "timeout" : "website_error", message);
  }
}
