/**
 * Enums shared end-to-end (Prisma schema string unions, API payloads, worker
 * engine, and frontend). Keeping these here — not duplicated per-app — is
 * what lets the frontend, API, and worker agree on the same vocabulary
 * without a runtime dependency on Prisma's generated client.
 */

export const DATE_POSTED_VALUES = ["today", "last_3_days", "all"] as const;
export type DatePosted = (typeof DATE_POSTED_VALUES)[number];

export const EMPLOYMENT_TYPE_VALUES = ["contract_c2c", "fulltime", "both"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE_VALUES)[number];

export const WORK_ARRANGEMENT_VALUES = ["remote", "hybrid", "onsite", "any"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENT_VALUES)[number];

export const LOCATION_TYPE_VALUES = ["city", "state", "remote"] as const;
export type LocationType = (typeof LOCATION_TYPE_VALUES)[number];

export const WORK_AUTHORIZATION_VALUES = [
  "us_citizen",
  "green_card",
  "h1b",
  "opt_ead",
  "gc_ead",
  "other",
] as const;
export type WorkAuthorization = (typeof WORK_AUTHORIZATION_VALUES)[number];

export const PORTAL_CODE_VALUES = ["DICE", "ZIPRECRUITER", "INDEED", "MONSTER"] as const;
export type PortalCode = (typeof PORTAL_CODE_VALUES)[number];

export const PORTAL_ACCOUNT_STATUS_VALUES = [
  "connected",
  "disconnected",
  "reauth_required",
  "error",
] as const;
export type PortalAccountStatus = (typeof PORTAL_ACCOUNT_STATUS_VALUES)[number];

export const APPLICATION_STATUS_VALUES = ["processing", "applied", "failed", "skipped"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS_VALUES)[number];

export const SKIP_REASON_VALUES = [
  "below_match_threshold",
  "already_applied",
  "duplicate_job",
  "job_unavailable",
  "location_mismatch",
  "employment_type_mismatch",
  "application_not_supported",
  "user_filter_mismatch",
] as const;
export type SkipReason = (typeof SKIP_REASON_VALUES)[number];

export const FAILURE_REASON_VALUES = [
  "login_failed",
  "session_expired_reauth_failed",
  "job_unavailable",
  "apply_button_unavailable",
  "form_changed",
  "mandatory_field_unfillable",
  "resume_upload_failed",
  "website_error",
  "timeout",
  "unexpected_application_step",
  "captcha_interruption",
  "network_error",
  "unknown_error",
] as const;
export type FailureReason = (typeof FAILURE_REASON_VALUES)[number];

export const BOT_STATUS_VALUES = [
  "idle",
  "starting",
  "logging_in",
  "searching",
  "analyzing",
  "applying",
  "waiting",
  "paused",
  "resuming",
  "completed",
  "failed",
  "stopped",
] as const;
export type BotStatus = (typeof BOT_STATUS_VALUES)[number];

/** States in which a BotRun is considered "active" — used for the one-active-run-per-user guard. */
export const ACTIVE_BOT_STATUSES: readonly BotStatus[] = [
  "starting",
  "logging_in",
  "searching",
  "analyzing",
  "applying",
  "waiting",
  "paused",
  "resuming",
];

export const LOG_LEVEL_VALUES = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

export const BOT_CONTROL_ACTION_VALUES = ["pause", "resume", "stop"] as const;
export type BotControlAction = (typeof BOT_CONTROL_ACTION_VALUES)[number];
