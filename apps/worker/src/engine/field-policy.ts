import {
  lookupCandidateValue,
  shouldFillOptionalAttribute,
  type CandidateProfileData,
  type OptionalFieldPreferences,
} from "@job-app/shared";
import type { FormFieldDescriptor } from "@job-app/shared";

/**
 * THE CORE RULE (requirements §18/§40): mandatory fields must always be
 * filled from the candidate profile and can NEVER be skipped by user
 * configuration; optional fields are filled or skipped per user preference.
 * A mandatory field the candidate has no data for fails the application
 * rather than submitting incomplete information.
 *
 * This module is deliberately standalone and Playwright-free — it's pure
 * decision logic, unit-testable without a browser, and reused by every
 * adapter (Dice today, others later) so the required/optional POLICY can
 * never drift per-portal.
 */

export type FieldDecision =
  | { action: "fill"; value: string; source: "candidate_profile" }
  | { action: "skip"; reason: "optional_user_preference" }
  | { action: "fail_application"; reason: "mandatory_field_unfillable"; fieldLabel: string };

export function resolveFieldDecision(
  field: FormFieldDescriptor,
  candidate: CandidateProfileData,
  prefs: OptionalFieldPreferences,
): FieldDecision {
  if (field.required) {
    // NOTE: `prefs` is intentionally never read in this branch. This is the
    // structural guarantee that a candidate's optional-field configuration
    // can never cause a mandatory field to be skipped — enforced by a unit
    // test that makes `prefs` throw if touched here (see field-policy.test.ts).
    const value = lookupCandidateValue(field.candidateAttribute, candidate);
    return value
      ? { action: "fill", value, source: "candidate_profile" }
      : { action: "fail_application", reason: "mandatory_field_unfillable", fieldLabel: field.label };
  }

  const wantsFill = field.candidateAttribute ? shouldFillOptionalAttribute(field.candidateAttribute, prefs) : false;
  const value = wantsFill ? lookupCandidateValue(field.candidateAttribute, candidate) : undefined;

  return value ? { action: "fill", value, source: "candidate_profile" } : { action: "skip", reason: "optional_user_preference" };
}

export function resolveAllFieldDecisions(
  fields: FormFieldDescriptor[],
  candidate: CandidateProfileData,
  prefs: OptionalFieldPreferences,
): Map<string, FieldDecision> {
  const decisions = new Map<string, FieldDecision>();
  for (const field of fields) {
    decisions.set(field.fieldId, resolveFieldDecision(field, candidate, prefs));
  }
  return decisions;
}

/** First fail_application decision among a resolved set, if any — used by the engine to abort an application. */
export function findFailingDecision(
  decisions: Map<string, FieldDecision>,
): Extract<FieldDecision, { action: "fail_application" }> | undefined {
  for (const decision of decisions.values()) {
    if (decision.action === "fail_application") return decision;
  }
  return undefined;
}
