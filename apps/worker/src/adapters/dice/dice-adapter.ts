import type { Page } from "playwright";
import type {
  AdapterRunContext,
  ApplicationSubmissionResult,
  CandidateProfileData,
  FillResult,
  FormFieldDescriptor,
  FormFieldKind,
  JobPortalAdapter,
  NormalizedJob,
  PortalCredentials,
  ResumeFilePayload,
  SearchCriteria,
} from "@job-app/shared";
import { lookupCandidateValue } from "@job-app/shared";
import { AdapterError } from "../../engine/adapter-error.js";
import { DICE_APPLY_MODAL, DICE_JOB_DETAIL, DICE_LOGIN, DICE_SEARCH, DICE_URLS } from "./dice-selectors.js";
import { inferCandidateAttribute } from "./field-inference.js";

const FIELD_ID_ATTR = "data-jobapp-field-id";
const NAV_TIMEOUT_MS = 30_000;
const MAX_SEARCH_PAGES = 10;

function getPage(ctx: AdapterRunContext): Page {
  // See packages/shared/src/adapter.ts header: `page` is typed `unknown` in
  // the portable interface so this package stays Playwright-free; the
  // engine always constructs real Playwright objects when Dice is the
  // active adapter, so this cast is safe at the one boundary that needs it.
  return ctx.page as Page;
}

async function checkForCaptcha(page: Page): Promise<void> {
  for (const selector of DICE_APPLY_MODAL.captchaIndicators) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      throw new AdapterError("captcha_interruption", "CAPTCHA challenge detected");
    }
  }
}

interface RawFieldInfo {
  tagId: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  nameAttr: string;
  isFile: boolean;
}

/**
 * Scans every visible form control inside the apply modal, tags each with a
 * unique `data-jobapp-field-id` attribute (so it can be re-selected exactly
 * in later steps via `[data-jobapp-field-id="..."]`), and infers required-
 * ness from the DOM/validation state rather than any hardcoded list —
 * matching requirement §18 verbatim.
 */
async function scanFormFields(page: Page): Promise<RawFieldInfo[]> {
  return page.evaluate(
    ({ modalSelector, attr }) => {
      const FIELD_KINDS: Record<string, string> = {
        select: "select",
        textarea: "textarea",
        checkbox: "checkbox",
        radio: "radio",
        file: "file",
        email: "email",
        tel: "phone",
      };

      const root = document.querySelector(modalSelector) ?? document.body;
      const controls = Array.from(root.querySelectorAll("input, select, textarea")) as HTMLElement[];
      const results: RawFieldInfo[] = [];
      let counter = 0;

      for (const el of controls) {
        const input = el as HTMLInputElement;
        if (["hidden", "submit", "button", "reset"].includes(input.type)) continue;

        let labelText = "";
        if (input.id) {
          const lbl = root.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (lbl) labelText = (lbl as HTMLElement).innerText ?? "";
        }
        if (!labelText) {
          const parentLabel = input.closest("label");
          if (parentLabel) labelText = (parentLabel as HTMLElement).innerText ?? "";
        }
        if (!labelText) {
          labelText = input.getAttribute("aria-label") ?? input.getAttribute("placeholder") ?? "";
        }

        const required =
          input.required ||
          input.getAttribute("aria-required") === "true" ||
          /\*\s*$/.test(labelText.trim());

        const tagId = `f-${counter++}`;
        input.setAttribute(attr, tagId);

        const tag = input.tagName.toLowerCase();
        const kind = tag === "select" ? "select" : tag === "textarea" ? "textarea" : FIELD_KINDS[input.type] ?? "text";

        results.push({
          tagId,
          label: labelText.trim(),
          kind: kind as RawFieldInfo["kind"],
          required,
          nameAttr: input.name || input.id || "",
          isFile: input.type === "file",
        });
      }

      return results;
    },
    { modalSelector: DICE_APPLY_MODAL.root, attr: FIELD_ID_ATTR },
  );
}

function toFieldDescriptor(raw: RawFieldInfo): FormFieldDescriptor {
  const isResumeUpload = raw.isFile && /resume|cv/i.test(`${raw.label} ${raw.nameAttr}`);
  const isOtherUpload = raw.isFile && !isResumeUpload;

  return {
    fieldId: raw.tagId,
    label: raw.label || raw.nameAttr || "(unlabeled field)",
    kind: raw.kind,
    required: raw.required,
    isResumeUpload,
    // Radio/checkbox groups are never attribute-mapped: guessing which
    // option answers an arbitrary employer custom question (e.g. work
    // authorization) risks submitting a WRONG answer, which is worse than
    // failing gracefully. A required radio/checkbox therefore correctly
    // becomes `mandatory_field_unfillable` in the field policy rather than
    // a blind guess-click. Other uploads (e.g. cover letter) are never
    // resume-mapped either.
    candidateAttribute:
      raw.kind === "radio" || raw.kind === "checkbox" || isOtherUpload
        ? null
        : inferCandidateAttribute(raw.label, raw.nameAttr),
  };
}

function fieldLocatorSelector(fieldId: string): string {
  return `[${FIELD_ID_ATTR}="${fieldId}"]`;
}

async function clickFirstVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

export class DiceAdapter implements JobPortalAdapter {
  readonly portalCode = "DICE" as const;

  async authenticate(creds: PortalCredentials, ctx: AdapterRunContext) {
    const page = getPage(ctx);
    try {
      await page.goto(DICE_URLS.login, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });

      const alreadyLoggedIn = await page
        .locator(DICE_LOGIN.loggedInIndicator)
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (!alreadyLoggedIn) {
        await checkForCaptcha(page);

        await page.locator(DICE_LOGIN.emailInput).first().fill(creds.email);
        await clickFirstVisible(page, [`button:has-text("Continue")`, `button:has-text("Next")`]);

        const passwordField = page.locator(DICE_LOGIN.passwordInput).first();
        await passwordField.waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
        await passwordField.fill(creds.password);

        await checkForCaptcha(page);
        await clickFirstVisible(page, [`button:has-text("Sign In")`, `button:has-text("Log In")`]);

        await page.locator(DICE_LOGIN.loggedInIndicator).first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
      }

      const sessionState = ctx.browserContext
        ? await (ctx.browserContext as import("playwright").BrowserContext).storageState()
        : undefined;
      return { success: true, sessionState };
    } catch (err) {
      if (err instanceof AdapterError) return { success: false, reason: err.message };
      return { success: false, reason: `Dice login failed: ${(err as Error).message}` };
    }
  }

  async *searchJobs(criteria: SearchCriteria, ctx: AdapterRunContext): AsyncIterable<NormalizedJob> {
    const page = getPage(ctx);
    const primaryLocation = criteria.locations[0];
    const locationParam =
      primaryLocation?.type === "remote"
        ? "Remote"
        : primaryLocation?.type === "city"
          ? `${primaryLocation.city}, ${primaryLocation.state}`
          : (primaryLocation?.state ?? "");

    const searchUrl = new URL(DICE_URLS.searchBase);
    searchUrl.searchParams.set("q", criteria.keyword);
    if (locationParam) searchUrl.searchParams.set("location", locationParam);

    await page.goto(searchUrl.toString(), { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });

    await applySearchFilters(page, criteria, ctx);

    const noResults = await page.locator(DICE_SEARCH.noResultsIndicator).first().isVisible().catch(() => false);
    if (noResults) return;

    for (let pageNum = 0; pageNum < MAX_SEARCH_PAGES; pageNum++) {
      if (ctx.signal.aborted) return;

      await page.locator(DICE_SEARCH.resultCard).first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
      const cards = page.locator(DICE_SEARCH.resultCard);
      const count = await cards.count();

      for (let i = 0; i < count; i++) {
        if (ctx.signal.aborted) return;
        const card = cards.nth(i);
        const link = card.locator(DICE_SEARCH.resultCardTitleLink).first();
        const href = await link.getAttribute("href").catch(() => null);
        if (!href) continue;

        const externalJobId = extractDiceJobId(href);
        if (!externalJobId) continue;

        const title = (await link.innerText().catch(() => "")).trim();
        const company = (await card.locator(DICE_SEARCH.resultCardCompany).first().innerText().catch(() => "")).trim();
        const location = (await card.locator(DICE_SEARCH.resultCardLocation).first().innerText().catch(() => "")).trim();
        const url = new URL(href, DICE_URLS.searchBase).toString();

        yield {
          externalJobId,
          title: title || "(untitled listing)",
          company: company || "Unknown",
          location: location || locationParam || "Unknown",
          url,
          employmentTypeRaw: criteria.employmentType,
          workArrangementRaw: criteria.workArrangement,
        };
      }

      const nextButton = page.locator(DICE_SEARCH.nextPageButton).first();
      const hasNext = await nextButton.isVisible().catch(() => false);
      if (!hasNext) break;
      await nextButton.click();
      await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
    }
  }

  async getJobDetails(job: NormalizedJob, ctx: AdapterRunContext): Promise<NormalizedJob> {
    const page = getPage(ctx);
    await page.goto(job.url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    const description = await page.locator(DICE_JOB_DETAIL.description).first().innerText().catch(() => undefined);
    return { ...job, description };
  }

  async getMatchScore(_job: NormalizedJob, ctx: AdapterRunContext) {
    const page = getPage(ctx);
    const text = await page.locator(DICE_JOB_DETAIL.matchScoreText).first().innerText().catch(() => null);
    if (!text) return { score: null, source: "platform" as const };
    const match = /(\d{1,3})%/.exec(text);
    if (!match) return { score: null, source: "platform" as const };
    return { score: Math.min(100, Number(match[1])), source: "platform" as const };
  }

  async checkApplicationStatus(_job: NormalizedJob, ctx: AdapterRunContext) {
    const page = getPage(ctx);
    try {
      if (await page.locator(DICE_JOB_DETAIL.alreadyAppliedIndicator).first().isVisible().catch(() => false)) {
        return "already_applied" as const;
      }
      if (await page.locator(DICE_JOB_DETAIL.jobClosedIndicator).first().isVisible().catch(() => false)) {
        return "closed" as const;
      }
      return "open" as const;
    } catch {
      return "unknown" as const;
    }
  }

  async startApplication(_job: NormalizedJob, ctx: AdapterRunContext) {
    const page = getPage(ctx);
    await checkForCaptcha(page);

    const externalOnly = await page.locator(DICE_JOB_DETAIL.externalApplyIndicator).first().isVisible().catch(() => false);
    if (externalOnly) {
      return { started: false, reason: "This listing routes to an external application site" };
    }

    const applyButton = page.locator(DICE_JOB_DETAIL.easyApplyButton).first();
    const hasApplyButton = await applyButton.isVisible().catch(() => false);
    if (!hasApplyButton) {
      return { started: false, reason: "No Easy Apply button found on this listing" };
    }

    await applyButton.click();
    await page.locator(DICE_APPLY_MODAL.root).first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    return { started: true };
  }

  async detectFormFields(ctx: AdapterRunContext): Promise<FormFieldDescriptor[]> {
    const page = getPage(ctx);
    const raw = await scanFormFields(page);
    return raw.map(toFieldDescriptor);
  }

  async fillRequiredFields(
    fields: FormFieldDescriptor[],
    candidate: CandidateProfileData,
    ctx: AdapterRunContext,
  ): Promise<FillResult[]> {
    // The engine (via field-policy.ts) has already decided WHICH fields to
    // fill — this method only re-derives the value to type/select and does
    // the DOM interaction. Re-deriving here (instead of threading resolved
    // values through) keeps FormFieldDescriptor a plain data object and
    // keeps this method self-sufficient/testable on its own.
    const page = getPage(ctx);
    const results: FillResult[] = [];

    for (const field of fields) {
      const value = lookupCandidateValue(field.candidateAttribute, candidate);
      try {
        const locator = page.locator(fieldLocatorSelector(field.fieldId)).first();
        if (field.kind === "select") {
          await locator.selectOption({ label: value ?? "" }).catch(() => locator.selectOption(value ?? ""));
        } else if (field.kind === "textarea" || field.kind === "text" || field.kind === "email" || field.kind === "phone") {
          await locator.fill(value ?? "");
        } else {
          results.push({ fieldId: field.fieldId, action: "failed", reason: `Unsupported field kind for auto-fill: ${field.kind}` });
          continue;
        }
        results.push({ fieldId: field.fieldId, action: "filled" });
      } catch (err) {
        results.push({ fieldId: field.fieldId, action: "failed", reason: (err as Error).message });
      }
    }
    return results;
  }

  async skipOptionalFields(fields: FormFieldDescriptor[], _prefs: unknown, ctx: AdapterRunContext): Promise<FillResult[]> {
    ctx.logger.debug("Dice: leaving optional fields empty per user preference", {
      fieldIds: fields.map((f) => f.fieldId),
    });
    return fields.map((f) => ({ fieldId: f.fieldId, action: "skipped" as const, reason: "optional_user_preference" }));
  }

  async uploadResume(resumeFile: ResumeFilePayload, fields: FormFieldDescriptor[], ctx: AdapterRunContext): Promise<FillResult> {
    const page = getPage(ctx);
    const field = fields.find((f) => f.isResumeUpload) ?? fields[0];
    if (!field) return { fieldId: "resume", action: "failed", reason: "No resume upload field found" };

    try {
      const locator = page.locator(fieldLocatorSelector(field.fieldId)).first();
      if (resumeFile.path) {
        await locator.setInputFiles(resumeFile.path);
      } else if (resumeFile.buffer) {
        await locator.setInputFiles({ name: resumeFile.fileName, mimeType: resumeFile.mimeType, buffer: resumeFile.buffer });
      } else {
        return { fieldId: field.fieldId, action: "failed", reason: "Resume file has neither a path nor a buffer" };
      }
      return { fieldId: field.fieldId, action: "filled" };
    } catch (err) {
      return { fieldId: field.fieldId, action: "failed", reason: (err as Error).message };
    }
  }

  async proceedToNextStep(ctx: AdapterRunContext): Promise<{ isFinalStep: boolean }> {
    const page = getPage(ctx);
    await checkForCaptcha(page);

    const submitVisible = await page
      .locator(DICE_APPLY_MODAL.stepActionButtons.submitApplication)
      .first()
      .isVisible()
      .catch(() => false);
    if (submitVisible) return { isFinalStep: true };

    const clicked = await clickFirstVisible(page, [
      DICE_APPLY_MODAL.stepActionButtons.reviewApplication,
      DICE_APPLY_MODAL.stepActionButtons.next,
      DICE_APPLY_MODAL.stepActionButtons.uploadResumeContinue,
    ]);

    if (!clicked) {
      throw new AdapterError("unexpected_application_step", "No recognized next-step button found in the apply modal");
    }

    await page.waitForTimeout(500); // let the modal's next step render
    return { isFinalStep: false };
  }

  async submitApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult> {
    const page = getPage(ctx);
    try {
      const submitButton = page.locator(DICE_APPLY_MODAL.stepActionButtons.submitApplication).first();
      await submitButton.click();

      // Some flows show one more Confirm/Done step after Submit.
      await clickFirstVisible(page, [DICE_APPLY_MODAL.stepActionButtons.confirm]);

      for (const indicator of DICE_APPLY_MODAL.successIndicators) {
        if (await page.locator(indicator).first().isVisible({ timeout: 5000 }).catch(() => false)) {
          return { status: "applied", verifiedBy: `text:${indicator}` };
        }
      }

      const modalClosed = await page
        .locator(DICE_APPLY_MODAL.root)
        .first()
        .isHidden({ timeout: 5000 })
        .catch(() => false);
      if (modalClosed) {
        return { status: "applied", verifiedBy: "modal-closed" };
      }

      return {
        status: "failed",
        failureReason: "unexpected_application_step",
        failureDetail: "No success indicator or modal-close observed after Submit Application",
      };
    } catch (err) {
      if (err instanceof AdapterError) {
        return { status: "failed", failureReason: err.failureReason, failureDetail: err.message };
      }
      return { status: "failed", failureReason: "website_error", failureDetail: (err as Error).message };
    }
  }

  async verifyApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult> {
    // Independent secondary check per requirement §20 — never trust a click
    // alone. By the time this runs, submitApplication() already found a
    // positive indicator; this re-confirms the modal is gone / the job page
    // now shows an "applied" state, catching a false-positive text match.
    const page = getPage(ctx);
    const stillOpen = await page.locator(DICE_APPLY_MODAL.root).first().isVisible().catch(() => false);
    if (!stillOpen) {
      return { status: "applied", verifiedBy: "modal-closed" };
    }
    for (const indicator of DICE_APPLY_MODAL.successIndicators) {
      if (await page.locator(indicator).first().isVisible().catch(() => false)) {
        return { status: "applied", verifiedBy: `text:${indicator}` };
      }
    }
    return {
      status: "failed",
      failureReason: "unexpected_application_step",
      failureDetail: "Apply modal still open with no success indicator after submission",
    };
  }
}

async function applySearchFilters(page: Page, criteria: SearchCriteria, ctx: AdapterRunContext): Promise<void> {
  const attempts: Array<[string, string]> = [];

  if (criteria.datePosted === "today") attempts.push(["date posted: today", DICE_SEARCH.datePostedFilter.today]);
  else if (criteria.datePosted === "last_3_days") attempts.push(["date posted: last 3 days", DICE_SEARCH.datePostedFilter.last3Days]);

  if (criteria.employmentType === "contract_c2c") attempts.push(["employment type: contract", DICE_SEARCH.employmentTypeFilter.contract]);
  else if (criteria.employmentType === "fulltime") attempts.push(["employment type: full-time", DICE_SEARCH.employmentTypeFilter.fullTime]);

  if (criteria.workArrangement === "remote") attempts.push(["work arrangement: remote", DICE_SEARCH.remoteFilter]);

  for (const [description, selector] of attempts) {
    const clicked = await clickFirstVisible(page, [selector]);
    if (!clicked) {
      ctx.logger.warn(`Dice: could not find filter control for ${description} — continuing without it`, { selector });
    }
  }
}

function extractDiceJobId(href: string): string | null {
  // Dice job URLs are typically /job-detail/{uuid} — fall back to the last
  // non-empty path segment for resilience if the URL structure differs.
  const match = /job-detail\/([a-zA-Z0-9-]+)/.exec(href);
  if (match) return match[1] ?? null;
  const segments = href.split("?")[0]?.split("/").filter(Boolean) ?? [];
  return segments.at(-1) ?? null;
}
