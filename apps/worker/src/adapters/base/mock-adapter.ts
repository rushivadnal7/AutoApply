import type {
  AdapterRunContext,
  ApplicationSubmissionResult,
  FillResult,
  FormFieldDescriptor,
  JobPortalAdapter,
  NormalizedJob,
  PortalCredentials,
  ResumeFilePayload,
  SearchCriteria,
} from "@job-app/shared";

/**
 * Pure-TS, Playwright-free adapter used to prove the Automation Engine
 * works portal-agnostically (Phase 5) before any real browser automation
 * exists. Registered into the DICE slot by default in this environment
 * (WORKER_ADAPTER_MODE=mock) since there's no real Dice test account
 * available here — see apps/worker/src/adapters/registry.ts.
 *
 * Deterministic-but-varied behavior is keyed off `externalJobId`, so the
 * same seed always produces the same simulated outcome — useful for
 * demoing every skip/failure path on demand rather than only on random luck.
 */
export class MockAdapter implements JobPortalAdapter {
  readonly portalCode = "DICE" as const;

  private jobCounter = 0;
  private currentStep = 0;
  private currentJobId: string | null = null;

  async authenticate(creds: PortalCredentials, ctx: AdapterRunContext) {
    ctx.logger.info("Mock: authenticating", { email: creds.email });
    if (creds.password === "mock-fail-login") {
      return { success: false, reason: "Invalid credentials (simulated)" };
    }
    return { success: true, sessionState: { mock: true, loggedInAs: creds.email } };
  }

  async *searchJobs(criteria: SearchCriteria, ctx: AdapterRunContext): AsyncIterable<NormalizedJob> {
    ctx.logger.info("Mock: searching jobs", { keyword: criteria.keyword });
    const count = 12;
    for (let i = 0; i < count; i++) {
      this.jobCounter += 1;
      const externalJobId = `mock-${criteria.keyword.replace(/\s+/g, "-").toLowerCase()}-${this.jobCounter}`;
      yield {
        externalJobId,
        title: `${criteria.keyword} (Mock Listing #${this.jobCounter})`,
        company: `Mock Company ${((this.jobCounter - 1) % 5) + 1}`,
        location: criteria.locations[0]?.city ?? "Remote",
        url: `https://example-mock-portal.test/jobs/${externalJobId}`,
        employmentTypeRaw: criteria.employmentType,
        workArrangementRaw: criteria.workArrangement,
        postedAt: new Date().toISOString(),
      };
    }
  }

  async getJobDetails(job: NormalizedJob, _ctx: AdapterRunContext): Promise<NormalizedJob> {
    return { ...job, description: `Mock job description for ${job.title}.` };
  }

  async getMatchScore(job: NormalizedJob, _ctx: AdapterRunContext) {
    // Deterministic pseudo-random score in [40, 99] from the job id's hash.
    const hash = [...job.externalJobId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const score = 40 + (hash % 60);
    return { score, source: "platform" as const };
  }

  async checkApplicationStatus(job: NormalizedJob, _ctx: AdapterRunContext) {
    const n = Number(job.externalJobId.split("-").pop());
    if (n % 11 === 0) return "closed" as const;
    if (n % 13 === 0) return "already_applied" as const;
    return "open" as const;
  }

  async startApplication(job: NormalizedJob, ctx: AdapterRunContext) {
    const n = Number(job.externalJobId.split("-").pop());
    this.currentJobId = job.externalJobId;
    this.currentStep = 0;
    if (n % 9 === 0) {
      ctx.logger.info("Mock: this listing is external-apply-only", { jobId: job.externalJobId });
      return { started: false, reason: "Application handled on an external site (simulated)" };
    }
    return { started: true };
  }

  async detectFormFields(_ctx: AdapterRunContext): Promise<FormFieldDescriptor[]> {
    const n = Number(this.currentJobId?.split("-").pop() ?? 0);
    const simulateUnfillableMandatory = n % 17 === 0;

    const fields: FormFieldDescriptor[] = [
      { fieldId: "fullName", label: "Full Name", kind: "text", required: true, candidateAttribute: "fullName" },
      { fieldId: "email", label: "Email Address", kind: "email", required: true, candidateAttribute: "email" },
      { fieldId: "phone", label: "Phone Number", kind: "phone", required: true, candidateAttribute: "phone" },
      { fieldId: "resume", label: "Resume", kind: "file", required: true, isResumeUpload: true },
      {
        fieldId: "coverLetter",
        label: "Cover Letter",
        kind: "textarea",
        required: false,
        candidateAttribute: "coverLetter",
      },
      {
        fieldId: "linkedin",
        label: "LinkedIn Profile URL",
        kind: "text",
        required: false,
        candidateAttribute: "linkedinUrl",
      },
      {
        fieldId: "portfolio",
        label: "Portfolio URL",
        kind: "text",
        required: false,
        candidateAttribute: "portfolioUrl",
      },
    ];

    if (simulateUnfillableMandatory) {
      fields.push({
        fieldId: "workAuthQuestion",
        label: "Are you eligible to work for any employer in the US without sponsorship? (simulated custom question)",
        kind: "radio",
        required: true,
        candidateAttribute: null, // no candidate data maps to this — should fail the application
      });
    }

    // Two-step form on step 0, final on step 1+.
    return this.currentStep === 0 ? fields : fields.filter((f) => f.fieldId === "fullName" || f.fieldId === "email");
  }

  async fillRequiredFields(fields: FormFieldDescriptor[], _candidate: unknown, ctx: AdapterRunContext): Promise<FillResult[]> {
    ctx.logger.debug("Mock: filling fields", { fieldIds: fields.map((f) => f.fieldId) });
    return fields.map((f) => ({ fieldId: f.fieldId, action: "filled" as const }));
  }

  async skipOptionalFields(fields: FormFieldDescriptor[], _prefs: unknown, ctx: AdapterRunContext): Promise<FillResult[]> {
    ctx.logger.debug("Mock: skipping optional fields", { fieldIds: fields.map((f) => f.fieldId) });
    return fields.map((f) => ({ fieldId: f.fieldId, action: "skipped" as const, reason: "optional_user_preference" }));
  }

  async uploadResume(resumeFile: ResumeFilePayload, fields: FormFieldDescriptor[], ctx: AdapterRunContext): Promise<FillResult> {
    ctx.logger.debug("Mock: uploading resume", { fileName: resumeFile.fileName });
    const field = fields[0];
    return { fieldId: field?.fieldId ?? "resume", action: "filled" };
  }

  async proceedToNextStep(_ctx: AdapterRunContext): Promise<{ isFinalStep: boolean }> {
    this.currentStep += 1;
    return { isFinalStep: this.currentStep >= 1 };
  }

  async submitApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult> {
    ctx.logger.info("Mock: submitting application", { jobId: this.currentJobId });
    return { status: "applied", verifiedBy: "text:Application submitted (mock)" };
  }

  async verifyApplication(_ctx: AdapterRunContext): Promise<ApplicationSubmissionResult> {
    return { status: "applied", verifiedBy: "text:Application submitted (mock)" };
  }
}
