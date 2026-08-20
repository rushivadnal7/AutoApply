import type { WorkAuthorization } from "./enums.js";

/**
 * The set of candidate attributes an adapter's `detectFormFields()` can
 * point a form field at. This is the vocabulary the required/optional field
 * policy (see field-policy in apps/worker) resolves against — it is
 * intentionally small and closed, matching the "standard candidate
 * information required by supported job portals" scope from the spec rather
 * than trying to model arbitrary custom questions.
 */
export const CANDIDATE_ATTRIBUTE_KEYS = [
  "fullName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "state",
  "workAuthorization",
  "linkedinUrl",
  "portfolioUrl",
  "coverLetter",
  "optionalMessage",
] as const;
export type CandidateAttributeKey = (typeof CANDIDATE_ATTRIBUTE_KEYS)[number];

export interface CandidateProfileData {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  city?: string | null;
  state?: string | null;
  workAuthorization?: WorkAuthorization | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}

/**
 * Per-role user preferences for OPTIONAL fields only. Mandatory fields never
 * consult this — see apps/worker/src/engine/field-policy.ts for the
 * structural guarantee.
 */
export interface OptionalFieldPreferences {
  skipCoverLetter: boolean;
  skipOptionalMessage: boolean;
  skipPortfolio: boolean;
  fillLinkedIn: boolean;
}

export function shouldFillOptionalAttribute(
  attribute: CandidateAttributeKey,
  prefs: OptionalFieldPreferences,
): boolean {
  switch (attribute) {
    case "coverLetter":
      return !prefs.skipCoverLetter;
    case "optionalMessage":
      return !prefs.skipOptionalMessage;
    case "portfolioUrl":
      return !prefs.skipPortfolio;
    case "linkedinUrl":
      return prefs.fillLinkedIn;
    default:
      // Any other optional attribute (rare) defaults to "fill if we have data" —
      // there's no dedicated toggle for it yet.
      return true;
  }
}

export function lookupCandidateValue(
  attribute: CandidateAttributeKey | null | undefined,
  candidate: CandidateProfileData,
): string | undefined {
  if (!attribute) return undefined;
  switch (attribute) {
    case "fullName":
      return candidate.fullName || undefined;
    case "firstName":
      return candidate.fullName?.split(" ")[0] || undefined;
    case "lastName": {
      const parts = candidate.fullName?.split(" ") ?? [];
      return parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    }
    case "email":
      return candidate.email || undefined;
    case "phone":
      return candidate.phone || undefined;
    case "city":
      return candidate.city ?? undefined;
    case "state":
      return candidate.state ?? undefined;
    case "workAuthorization":
      return candidate.workAuthorization ?? undefined;
    case "linkedinUrl":
      return candidate.linkedinUrl ?? undefined;
    case "portfolioUrl":
      return candidate.portfolioUrl ?? undefined;
    case "coverLetter":
    case "optionalMessage":
      // No stored value for these yet (free-text, not part of the profile) —
      // the resolver treats "no value" as skip, never as a mandatory failure
      // (these attributes are never marked required by any adapter).
      return undefined;
    default:
      return undefined;
  }
}
