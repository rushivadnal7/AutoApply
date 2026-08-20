import type { CandidateAttributeKey, CandidateProfileData, OptionalFieldPreferences } from "./candidate.js";
import type { DatePosted, EmploymentType, FailureReason, LogLevel, PortalCode, WorkArrangement } from "./enums.js";

/**
 * The portal-agnostic contract every job portal integration implements.
 * This file is the architectural spine of the whole platform: the generic
 * Automation Engine (apps/worker/src/engine) only ever calls through this
 * interface, never through portal-specific code. Adding a new portal is
 * implementing this interface once — it is deliberately the thing that
 * proves (or disproves) "adapter task, not a rewrite."
 *
 * `page` / `browserContext` are typed as `unknown` here on purpose: this
 * package is imported by apps/web too, and we don't want the frontend's
 * dependency tree to pull in Playwright. Each concrete adapter (e.g.
 * apps/worker/src/adapters/dice) narrows these with a local cast at the
 * point of use — see dice-adapter.ts for the pattern.
 */

export interface PortalCredentials {
  email: string;
  /** Decrypted, in-memory only for the duration of a run. Never persisted by an adapter. */
  password: string;
  cachedSessionState?: unknown;
}

export interface SearchLocation {
  type: "city" | "state" | "remote";
  city?: string;
  state?: string;
}

export interface SearchCriteria {
  keyword: string;
  locations: SearchLocation[];
  datePosted: DatePosted;
  employmentType: EmploymentType;
  workArrangement: WorkArrangement;
}

export interface NormalizedJob {
  externalJobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  employmentTypeRaw?: string;
  workArrangementRaw?: string;
  postedAt?: string; // ISO date
}

export type FormFieldKind = "text" | "email" | "phone" | "select" | "radio" | "checkbox" | "file" | "textarea";

export interface FormFieldDescriptor {
  /** Adapter-internal handle (selector, test-id, etc.) — opaque to the engine. */
  fieldId: string;
  /** As read from the live DOM/label — used for logging and debugging, not matching. */
  label: string;
  kind: FormFieldKind;
  /** MUST be derived from the form's live DOM/validation state, never hardcoded. */
  required: boolean;
  candidateAttribute?: CandidateAttributeKey | null;
  /** True ONLY for the actual resume file input — never a cover-letter or "other document" upload. */
  isResumeUpload?: boolean;
}

/**
 * Either a local filesystem path (dev fallback storage) or an in-memory
 * buffer (downloaded once from Supabase Storage) — Playwright's
 * `setInputFiles()` accepts both natively, so the adapter never needs to
 * know which storage backend is active.
 */
export interface ResumeFilePayload {
  fileName: string;
  mimeType: string;
  path?: string;
  buffer?: Buffer;
}

export type FillResult =
  | { fieldId: string; action: "filled" }
  | { fieldId: string; action: "skipped"; reason: string }
  | { fieldId: string; action: "failed"; reason: string };

export interface ApplicationSubmissionResult {
  status: "applied" | "failed";
  /** e.g. "text:Application submitted" — what indicator proved success/failure. Never assume success from a click alone. */
  verifiedBy?: string;
  failureReason?: FailureReason;
  failureDetail?: string;
}

export interface BotLogger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface AdapterRunContext {
  /** Playwright `Page`, typed opaque here — see file header. */
  page: unknown;
  /** Playwright `BrowserContext`, typed opaque here — see file header. */
  browserContext: unknown;
  botRunId: string;
  userId: string;
  logger: BotLogger;
  /** Cooperative cancellation for Pause/Stop — adapters should check this between steps. */
  signal: AbortSignal;
}

export interface JobPortalAdapter {
  readonly portalCode: PortalCode;

  authenticate(
    creds: PortalCredentials,
    ctx: AdapterRunContext,
  ): Promise<{ success: boolean; sessionState?: unknown; reason?: string }>;

  searchJobs(criteria: SearchCriteria, ctx: AdapterRunContext): AsyncIterable<NormalizedJob>;

  getJobDetails(job: NormalizedJob, ctx: AdapterRunContext): Promise<NormalizedJob>;

  getMatchScore(
    job: NormalizedJob,
    ctx: AdapterRunContext,
  ): Promise<{ score: number | null; source: "platform" }>;

  checkApplicationStatus(
    job: NormalizedJob,
    ctx: AdapterRunContext,
  ): Promise<"open" | "closed" | "already_applied" | "unknown">;

  startApplication(job: NormalizedJob, ctx: AdapterRunContext): Promise<{ started: boolean; reason?: string }>;

  detectFormFields(ctx: AdapterRunContext): Promise<FormFieldDescriptor[]>;

  fillRequiredFields(
    fields: FormFieldDescriptor[],
    candidate: CandidateProfileData,
    ctx: AdapterRunContext,
  ): Promise<FillResult[]>;

  skipOptionalFields(
    fields: FormFieldDescriptor[],
    prefs: OptionalFieldPreferences,
    ctx: AdapterRunContext,
  ): Promise<FillResult[]>;

  uploadResume(resumeFile: ResumeFilePayload, fields: FormFieldDescriptor[], ctx: AdapterRunContext): Promise<FillResult>;

  submitApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult>;

  verifyApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult>;

  /**
   * Beyond the literal adapter method list in the requirements doc — needed
   * to drive multi-step forms (Continue/Next/Review/Submit/Confirm/Done)
   * while keeping the required/optional POLICY decision in the engine, not
   * the adapter. The adapter only reports whether another step follows.
   */
  proceedToNextStep(ctx: AdapterRunContext): Promise<{ isFinalStep: boolean }>;
}
