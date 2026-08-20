/**
 * Every Dice-specific DOM selector lives here, isolated from
 * dice-adapter.ts's control flow. This is a deliberate architectural
 * choice (see SYSTEM_DESIGN.md §13): Dice can change its markup without
 * notice, and when that happens the fix should be "update selectors in one
 * file," not "trace through the automation logic to find what broke."
 *
 * IMPORTANT — these selectors are written from the documented UX flow (the
 * reference dice_apply.py script's described behavior) and general
 * knowledge of Dice's site structure, but have NOT been verified against a
 * live Dice account in this environment (no test credentials were
 * available during development). Treat every selector below as a
 * best-effort starting point that needs a quick pass against the real site
 * — see IMPLEMENTATION_PLAN.md Phase 6 exit criteria. Where possible,
 * selectors favor role/text-based Playwright locators (resilient to CSS/class
 * churn) over brittle structural selectors.
 */

export const DICE_URLS = {
  login: "https://www.dice.com/dashboard/login",
  searchBase: "https://www.dice.com/jobs",
};

export const DICE_LOGIN = {
  emailInput: 'input[type="email"], input[name="email"], #email',
  passwordInput: 'input[type="password"], input[name="password"], #password',
  continueButtonText: /^(Continue|Next)$/i,
  signInButtonText: /^(Sign In|Log In|Login)$/i,
  loggedInIndicator: '[data-testid="header-avatar"], a[href*="/dashboard/profile"]',
};

export const DICE_SEARCH = {
  resultCard: '[data-testid="job-search-serp-card"], .search-card, article[data-cy="card-body"]',
  resultCardTitleLink: 'a[data-cy="card-title-link"], a.card-title-link, h5 a',
  resultCardCompany: '[data-cy="search-result-company-name"], .company-name',
  resultCardLocation: '[data-cy="search-result-location"], .location',
  nextPageButton: 'a[aria-label="Next"], button[aria-label="Next"]',
  noResultsIndicator: "text=/no jobs found/i",

  // Filter panel controls — Dice's search page exposes these as checkboxes/
  // buttons rather than only via URL query params, so filters are applied
  // by interacting with the UI (matches how a Playwright script driven by
  // the reference dice_apply.py would behave, and is more resilient to
  // undocumented query-param changes).
  datePostedFilter: {
    today: 'text=/^(Today|Last 24 hours)$/i',
    last3Days: 'text=/^(Last 3 days|3 days)$/i',
    all: 'text=/^(All dates|Anytime)$/i',
  },
  employmentTypeFilter: {
    contract: 'text=/^Contract$/i',
    fullTime: 'text=/^Full[- ]?Time$/i',
  },
  remoteFilter: 'text=/^Remote$/i',
};

export const DICE_JOB_DETAIL = {
  title: 'h1[data-cy="jobTitle"], h1',
  company: '[data-cy="companyNameLink"], a[href*="/company/"]',
  location: '[data-cy="location"]',
  description: '#jobDescription, [data-cy="jobDescription"]',
  matchScoreText: "text=/Dice Job Match score is (\\d{1,3})%/i",
  easyApplyButton: 'button:has-text("Easy Apply"), button:has-text("Apply Now"), button[data-cy="applyButton"]',
  externalApplyIndicator: 'text=/apply on company site/i',
  alreadyAppliedIndicator: 'text=/you (have )?applied|application submitted/i',
  jobClosedIndicator: "text=/no longer accepting applications|this job (has expired|is no longer available)/i",
};

export const DICE_APPLY_MODAL = {
  root: '[role="dialog"], .apply-modal, [data-cy="applyModal"]',
  resumeUploadInput: 'input[type="file"][accept*="pdf"], input[type="file"][name*="resume" i]',
  coverLetterUploadInput: 'input[type="file"][name*="cover" i]',

  // Generic field scanning — the adapter walks all visible labeled inputs
  // inside the modal rather than hardcoding every possible custom question,
  // since Dice's "additional questions" step varies per employer.
  labeledField: "label",

  stepActionButtons: {
    uploadResumeContinue: 'button:has-text("Continue")',
    next: 'button:has-text("Next")',
    reviewApplication: 'button:has-text("Review Application")',
    submitApplication: 'button:has-text("Submit Application")',
    confirm: 'button:has-text("Confirm")',
    done: 'button:has-text("Done")',
  },

  successIndicators: [
    "text=/application submitted/i",
    "text=/successfully applied/i",
    "text=/application received/i",
    "text=/thank you for applying/i",
    "text=/you('| )?ve applied/i",
  ],

  captchaIndicators: [
    'iframe[src*="recaptcha"]',
    'iframe[title*="captcha" i]',
    "text=/verify you are human/i",
  ],
};
