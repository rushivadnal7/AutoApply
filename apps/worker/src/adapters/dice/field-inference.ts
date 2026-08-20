import type { CandidateAttributeKey } from "@job-app/shared";

/**
 * Dice's "additional questions" step varies per employer, so form fields
 * can't be hardcoded by selector — we infer meaning from the label text
 * (and input name/id as a fallback) with simple keyword matching. A field
 * that matches nothing gets `candidateAttribute: null`, which the field
 * policy correctly treats as unfillable if the field turns out to be
 * required (see engine/field-policy.ts) — a conservative default that fails
 * the application rather than guessing.
 */
const KEYWORD_RULES: Array<{ attribute: CandidateAttributeKey; patterns: RegExp[] }> = [
  { attribute: "email", patterns: [/e-?mail/i] },
  { attribute: "phone", patterns: [/phone|mobile|cell/i] },
  { attribute: "fullName", patterns: [/full name|your name|^name$/i] },
  { attribute: "firstName", patterns: [/first name/i] },
  { attribute: "lastName", patterns: [/last name|surname/i] },
  { attribute: "linkedinUrl", patterns: [/linkedin/i] },
  { attribute: "portfolioUrl", patterns: [/portfolio|personal website|github/i] },
  { attribute: "coverLetter", patterns: [/cover letter/i] },
  { attribute: "optionalMessage", patterns: [/message to (the )?(recruiter|employer)|additional (info|comments|message)/i] },
  { attribute: "city", patterns: [/^city$/i] },
  { attribute: "state", patterns: [/^state$/i] },
  { attribute: "workAuthorization", patterns: [/work authorization|sponsorship|eligible to work/i] },
];

export function inferCandidateAttribute(labelText: string, nameAttr: string): CandidateAttributeKey | null {
  const haystack = `${labelText} ${nameAttr}`.trim();
  if (!haystack) return null;
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return rule.attribute;
    }
  }
  return null;
}
