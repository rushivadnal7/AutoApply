import { describe, expect, it } from "vitest";
import type { CandidateProfileData, FormFieldDescriptor, OptionalFieldPreferences } from "@job-app/shared";
import { findFailingDecision, resolveAllFieldDecisions, resolveFieldDecision } from "./field-policy.js";

const candidate: CandidateProfileData = {
  userId: "u1",
  email: "jane@example.com",
  fullName: "Jane Doe",
  phone: "555-123-4567",
  city: "Dallas",
  state: "TX",
  linkedinUrl: "https://linkedin.com/in/janedoe",
  portfolioUrl: null,
};

const permissivePrefs: OptionalFieldPreferences = {
  skipCoverLetter: true,
  skipOptionalMessage: true,
  skipPortfolio: true,
  fillLinkedIn: false,
};

function field(overrides: Partial<FormFieldDescriptor>): FormFieldDescriptor {
  return { fieldId: "f1", label: "Field", kind: "text", required: false, ...overrides };
}

describe("resolveFieldDecision — the core required/optional rule", () => {
  it("fills a required field the candidate has data for", () => {
    const decision = resolveFieldDecision(
      field({ required: true, candidateAttribute: "email" }),
      candidate,
      permissivePrefs,
    );
    expect(decision).toEqual({ action: "fill", value: "jane@example.com", source: "candidate_profile" });
  });

  it("fails the application when a required field has no candidate data — never submits incomplete", () => {
    const decision = resolveFieldDecision(
      field({ required: true, candidateAttribute: "portfolioUrl", label: "Portfolio URL" }),
      candidate,
      permissivePrefs,
    );
    expect(decision).toEqual({
      action: "fail_application",
      reason: "mandatory_field_unfillable",
      fieldLabel: "Portfolio URL",
    });
  });

  it("skips an optional field when the user preference says to skip it", () => {
    const decision = resolveFieldDecision(
      field({ required: false, candidateAttribute: "coverLetter" }),
      candidate,
      { ...permissivePrefs, skipCoverLetter: true },
    );
    expect(decision).toEqual({ action: "skip", reason: "optional_user_preference" });
  });

  it("fills an optional field when the user preference says to fill it and data exists", () => {
    const decision = resolveFieldDecision(
      field({ required: false, candidateAttribute: "linkedinUrl" }),
      candidate,
      { ...permissivePrefs, fillLinkedIn: true },
    );
    expect(decision).toEqual({
      action: "fill",
      value: "https://linkedin.com/in/janedoe",
      source: "candidate_profile",
    });
  });

  it(
    "STRUCTURAL GUARANTEE: never reads optional-field preferences when resolving a required field — " +
      "a user's skip-everything configuration can never cause a mandatory field to be skipped",
    () => {
      const trapPrefs = new Proxy({} as OptionalFieldPreferences, {
        get() {
          throw new Error("prefs were read while resolving a REQUIRED field — this must never happen");
        },
      });

      expect(() =>
        resolveFieldDecision(field({ required: true, candidateAttribute: "email" }), candidate, trapPrefs),
      ).not.toThrow();

      expect(() =>
        resolveFieldDecision(
          field({ required: true, candidateAttribute: "portfolioUrl" }),
          candidate,
          trapPrefs,
        ),
      ).not.toThrow();
    },
  );
});

describe("resolveAllFieldDecisions / findFailingDecision", () => {
  it("surfaces the first mandatory-unfillable field across a whole form", () => {
    const fields: FormFieldDescriptor[] = [
      field({ fieldId: "f-name", required: true, candidateAttribute: "fullName", label: "Full Name" }),
      field({ fieldId: "f-portfolio", required: true, candidateAttribute: "portfolioUrl", label: "Portfolio" }),
      field({ fieldId: "f-cover", required: false, candidateAttribute: "coverLetter", label: "Cover Letter" }),
    ];
    const decisions = resolveAllFieldDecisions(fields, candidate, permissivePrefs);
    const failing = findFailingDecision(decisions);
    expect(failing?.fieldLabel).toBe("Portfolio");
  });

  it("reports no failing decision when every required field is fillable", () => {
    const fields: FormFieldDescriptor[] = [
      field({ fieldId: "f-name", required: true, candidateAttribute: "fullName" }),
      field({ fieldId: "f-email", required: true, candidateAttribute: "email" }),
    ];
    const decisions = resolveAllFieldDecisions(fields, candidate, permissivePrefs);
    expect(findFailingDecision(decisions)).toBeUndefined();
  });
});
