# Implementation Plan — Job Application Automation SaaS

> Companion to [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md). Work through phases in order — each is a checkpoint with a goal, a task checklist, exit criteria, and dependencies. Check off tasks as they land so this file always answers "what's next."

**How to use this file:** update the `- [ ]` boxes as work completes. Don't start a phase until its "Depends On" phases are checked off. Each phase's "Exit Criteria" is the bar for calling it done — not "code written" but "verifiably working."

**Status as of 2026-08-17:** Phases 0–10 are built and verified end-to-end against local infrastructure (docker-compose Postgres/Redis, `WORKER_ADAPTER_MODE=mock`) — registered a real user through the API, configured a role/resume/preferences/portal through the actual UI in a headless browser, ran the bot twice (one run hit a real bug — resume-upload fields being wrongly evaluated as unfillable candidate-data fields — caught live and fixed in `apps/worker/src/engine/process-job.ts`), and confirmed Socket.IO live updates render with zero page refreshes. What's **not** done yet: provisioning the actual free-tier cloud accounts (Supabase/Upstash/Vercel/Render — Phase 0/13), the Dice adapter is untested against a real Dice account (Phase 6 — no test credentials were available), and Phases 11 (wizard) and parts of 12 (hardening) are still open. Dockerfiles, CI, and a demo-data seed were added alongside this pass — see Phase 13. None of this has been committed to git yet — it's all working-tree changes, ready for you to review before the first commit.

---

## Phase 0 — Project Scaffolding & Tooling

**Goal:** A working, empty monorepo that builds, lints, and deploys a "hello world" on all three free-tier targets.

- [x] Initialize pnpm workspace + Turborepo, `apps/{web,api,worker}`, `packages/{db,shared,config,logger}`
- [x] Shared `tsconfig` configs in `packages/config` (eslint/prettier configs deferred — not yet added)
- [x] `packages/logger` — pino instance with redaction config stub
- [ ] Provision Supabase project, Upstash Redis DB (set `noeviction`), Vercel project, two Render Web Services (api, worker) — **needs your cloud accounts, not doable by the agent**
- [x] `.env.example` with every variable named (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`, `REDIS_URL`, `JWT_*`, `CREDENTIALS_ENCRYPTION_KEY`, ...)
- [x] Fastify `apps/api` with `/health`; Next.js `apps/web`; `apps/worker` health server — all built well past "minimal" (see Phases 1-10)
- [x] GitHub Actions CI: install, typecheck, test on PR
- [ ] Deploy all three to their free-tier targets end-to-end — blocked on cloud account provisioning above

**Exit Criteria:** a PR triggers CI (done, local); `web`, `api`, `worker` are each live on their free-tier URL and reachable (not done — needs cloud accounts).

**Depends On:** nothing.

---

## Phase 1 — Auth + Candidate Profile

**Goal:** A user can register, log in, log out, and maintain a candidate profile.

- [x] `packages/db` Prisma schema: `User`, `RefreshToken`, `CandidateProfile`
- [x] `argon2id` password hashing, JWT access + rotating refresh-cookie flow, `/auth/register|login|refresh|logout`
- [x] Global auth-guard Fastify hook + allow-list
- [x] `apps/web` login/register pages + auth context (TanStack Query + in-memory access token + httpOnly refresh cookie)
- [x] Candidate profile CRUD route + `apps/web` profile page (full name, phone, city/state, work auth, LinkedIn, portfolio)

**Exit Criteria:** register → login → edit profile → logout → login again round-trips correctly ✅ verified against local Postgres via curl and a real browser session (Supabase swap is a Phase 13 connection-string change, same schema); unauthorized requests to the profile route return 401 ✅ verified. Along the way, live testing caught and fixed a real refresh-token race (concurrent `/auth/refresh` calls tripping rotation-reuse theft detection) — see `apps/web/lib/api-client.ts`.

**Depends On:** Phase 0.

---

## Phase 2 — Resume Management

**Goal:** A user can upload, view, replace, and delete multiple resumes.

- [x] `Resume` Prisma model; storage abstraction with a local-disk dev fallback + Supabase Storage path (auto-selected by whether `SUPABASE_URL` is configured)
- [x] Upload endpoint: magic-byte MIME validation, size limit, storage key derived from `resumeId`
- [x] List/replace/delete endpoints, ownership-checked download (blob-fetch with Bearer auth, not a plain link — see Phase 9 notes)
- [x] `apps/web` Resumes page (upload, list, mark default, delete)

**Exit Criteria:** multiple resumes uploaded/listed/deleted per user ✅ verified. Cross-user download denial is implemented (`requireOwnedResume` scopes every lookup to the caller's `userId`) but not yet exercised with a second real account — tracked as a Phase 12 to-do.

**Depends On:** Phase 1.

---

## Phase 3 — Job Roles & Preferences

**Goal:** A user can configure multiple independent job-role searches, with the resume↔role many-to-many working end to end.

- [x] `JobRole`, `ResumeJobRole` (with partial-unique `isPrimary` index, added via raw SQL in the init migration), `JobPreference`, `JobRoleLocation` models
- [x] Role CRUD, resume-assignment endpoint (assign an existing resume to one or more roles), preference CRUD (US-only location picker validated against a static state list, date posted, employment type, work arrangement, match threshold, optional-field toggles)
- [x] `apps/web` Roles page + Preferences sub-forms; resume-assignment UI (assign/unassign/set-primary) confirmed working in a real browser session

**Exit Criteria:** ✅ verified via the API directly (role created, resume assigned with `isPrimary`, join-table row confirmed in the response) and visually in the browser (Roles page shows the assigned resume badge + locations). Assigning the *same* resume to a *second* role wasn't re-tested this pass but uses the identical assignment endpoint — low risk, worth a quick re-check before the demo.

**Depends On:** Phases 1, 2.

---

## Phase 4 — Complete Data Model (Portal / Bot Schema)

**Goal:** Every remaining entity needed by the automation engine exists, migrated, and seeded.

- [x] `JobPortal` (seeded: Dice=active, ZipRecruiter/Indeed/Monster=inactive), `PortalAccount`, `Job`, `Application`, `Bot`, `BotRun`, `BotRunRole`, `BotRunPortal`, `BotLog`
- [x] All indexes/uniques: `(jobPortalId, externalJobId)` on `Job`, `(userId, jobId)` on `Application`, partial unique "one active BotRun per user" (raw SQL, see migration)
- [x] Portal account connect/disconnect endpoints (AES-256-GCM encrypt on write, never decrypt for display) + `apps/web` Portals page ("Connect Dice" form, masked status)

**Exit Criteria:** `prisma migrate dev` runs clean ✅ against local Postgres (Supabase is a connection-string swap, same migration); a `PortalAccount` password is not retrievable as plaintext via any read endpoint ✅ (`safePortalAccountSelect` never includes the encrypted columns) — confirmed by reading the route/service code, not by attempting a DB browse this pass.

**Depends On:** Phase 3.

---

## Phase 5 — Generic Automation Engine + Adapter Interface + Mock Adapter

**Goal:** Prove the engine works portal-agnostically before Dice exists at all. *(Internal de-risking milestone — not client-facing yet.)*

- [x] `packages/shared/src/adapter.ts` — the full `JobPortalAdapter` contract (plus `ResumeFilePayload`, refined during build to support both local-disk and in-memory-buffer resumes)
- [x] `field-policy.ts` with the required/optional resolver + unit tests, including the "prefs never read in the required branch" guarantee test — **7/7 tests passing**, including the structural-guarantee test using a throwing `Proxy`
- [x] `MockAdapter` — pure TS, no Playwright: fake jobs, fake form fields (required/optional mix), deterministic simulated failures (mandatory-field-unfillable, closed/already-applied jobs, external-apply-only) keyed off job id
- [x] Engine core loop + state machine, pacing delay, BullMQ wiring against `MockAdapter`
- [x] Pause/Resume/Stop via Redis pub/sub control signal, plus an engine-triggered `forcePause()` for the session-expiry path

**Exit Criteria:** ✅ verified live — started a real bot run via the API against `MockAdapter`, watched it produce real `Application`/`BotLog`/`BotRun` rows, confirmed Socket.IO events update the `/bot` page with zero page refreshes, and confirmed a second bot-run job correctly deduped jobs the first run had already processed. **A real bug was caught here**: the resume-upload field was being fed through the required/optional field-policy resolver (which has no candidate-attribute value for it) and always failed as "mandatory field unfillable" — fixed in `process-job.ts` by excluding `isResumeUpload` fields from that resolver entirely, since resume upload is handled by the dedicated `uploadResume()` call.

**Depends On:** Phase 4.

---

## Phase 6 — Dice Adapter

**Goal:** Real Dice automation, behavior-matched to the reference `dice_apply.py` script.

- [x] `authenticate` — login form, persist `storageState` for session reuse
- [x] `searchJobs` — build Dice search URL from `SearchCriteria`, paginate, scrape listing DOM
- [x] `getJobDetails`, `getMatchScore` (parse "Your Dice Job Match score is X%"), `checkApplicationStatus`
- [x] `startApplication`, `detectFormFields` (generic in-page field scanner + keyword-based attribute inference), `uploadResume` (distinguishes resume vs. cover-letter uploads; radio/checkbox groups deliberately never attribute-mapped — see code comment on why guessing is worse than failing gracefully), `proceedToNextStep`
- [x] `submitApplication` / `verifyApplication` — explicit success-text matching + modal-closed check, never "assume success from click"
- [x] `dice-selectors.ts` isolated from logic (DOM-change resilience)
- [ ] Local fixture HTML page(s) mirroring Dice's apply modal for adapter unit tests — not yet built

**Exit Criteria — NOT MET, by necessity:** no Dice test account/credentials were available in this environment, so `DiceAdapter` has never run against the real site. The code is complete and follows the documented UX flow (role/text-based Playwright locators favored over brittle CSS, explicit `AdapterError` failure-reason mapping, CAPTCHA detection), but every selector in `dice-selectors.ts` is a best-effort starting point that needs a verification pass against a live account before Phase 7 can be trusted end-to-end. **This is the single highest-risk item before a client demo that touches real Dice** — budget time for it, or demo on `WORKER_ADAPTER_MODE=mock` (fully working) and be upfront that Dice-specific selector tuning is the next step.

**Depends On:** Phase 5.

---

## Phase 7 — Queue/Worker Wiring with Real Adapter

**Goal:** The real Dice adapter is driven through the same queue/control machinery proven in Phase 5.

- [x] `POST /bot/start|pause|resume|stop` endpoints wired to `BotRun` creation + BullMQ enqueue + Redis control channel
- [x] Adapter registry is config-driven by `JobPortal.code`, switchable via `WORKER_ADAPTER_MODE=mock|dice` env var — `DiceAdapter` is fully wired in, just unverified against a live account (see Phase 6)
- [ ] Session-expiry → re-auth → pause+notify path exercised against real Dice — implemented (`forcePause()` + retry-on-resume loop in `automation-engine.ts`) but not exercised against a real session expiry

**Exit Criteria:** ✅ met for mock mode — starting a bot from `apps/web` produces real applications, and Pause/Resume/Stop clicks visibly change bot behavior within one job's processing time (verified live in a browser). Not yet met for real Dice — same blocker as Phase 6.

**Depends On:** Phases 5, 6.

---

## Phase 8 — Realtime Progress

**Goal:** Live dashboard updates without manual refresh, end to end on deployed infra (not just localhost).

- [x] Socket.IO server in `apps/api`, JWT handshake auth, `user:{userId}` rooms
- [x] Redis subscriber bridging worker-published events to Socket.IO emits
- [x] `apps/web` socket client hook (`useRealtimeBot`), wired into live "Bot Status" panels on both `/dashboard` and `/bot`

**Exit Criteria:** ✅ verified with a headless browser against local `api`/`worker` — starting a bot run updated the status badge and a live scrolling log panel with zero page refreshes (Playwright's `waitForFunction` confirmed the DOM changed without any `page.goto`/reload). Local-vs-deployed is just an infra address change; the mechanism itself is proven.

**Depends On:** Phase 7.

---

## Phase 9 — Dashboard ⭐ (client-facing demo milestone)

**Goal:** The full "first development milestone" from the requirements doc, on deployed infrastructure.

- [x] Summary cards (total/successful/skipped/failed, active runs, avg match score)
- [x] Per-platform stats, per-role progress (`X/limit`)
- [x] Live progress panel (current platform/role/job, applied/skipped/failed counters) wired to Phase 8 events
- [x] Start/Pause/Resume/Stop controls (on `/bot`, linked from the dashboard's status card)

**Exit Criteria:** ✅ **MET, on local infra with the mock adapter** — verified exactly the described flow: configured a role with resume/preferences/US locations through the real UI, connected a (mock) Dice account, started a run from the dashboard, and watched applied/skipped/failed update live without a refresh. See the screenshots taken during this pass. **What's left for the literal client-facing version of this milestone**: swap `WORKER_ADAPTER_MODE=dice` (needs Phase 6 selector verification) and deploy to the free-tier targets (Phase 13) — the application logic itself is done.

**Depends On:** Phases 1–8 (everything up to here).

---

## Phase 10 — History, Logs, Bot Run History

**Goal:** Full auditability of past activity.

- [x] Application History page with filters (title, company, status — match-score/date/location filters are supported server-side by `applicationHistoryQuerySchema` but don't yet have UI controls)
- [x] Bot Activity Logs viewer, associated to run/job/application, with a run selector
- [x] Bot Run History list + detail (start/end, platforms, roles, applied/skipped/failed)

**Exit Criteria:** ✅ verified live — Application History shows real rows with job/company/platform/role/match/status/reason/date (including the same job appearing as both `failed` and later `applied` across two runs, a nice real demonstration of failure-then-fix); Bot Runs lists both prior runs with correct summaries; Activity Logs correctly renders the full structured log trail for a selected run. Minor gap: match-score/date/location filter *inputs* aren't wired up in the UI yet (schema supports them).

**Depends On:** Phase 9.

---

## Phase 11 — Setup Wizard UI

**Goal:** The 13-step first-time-user wizard, assembling all prior CRUD screens into one guided flow with a final review/summary step.

- [ ] Wizard shell + step routing/persistence (resume-in-progress if user leaves)
- [ ] Steps 1–11 reuse Phase 1–7 forms; Step 12 renders a read-only configuration summary; Step 13 is the Start Bot CTA

**Exit Criteria:** a brand-new account can go from zero to a running bot using only the wizard, no other page. **Not started.** Note: a brand-new account can already go from zero to a running bot today using the regular nav (Profile → Resumes → Job Roles → Job Portals → Bot Control) — verified in this pass — so this phase is purely the guided-single-flow UX wrapper, not new capability.

**Depends On:** Phase 9 (needs Start Bot to be functional).

---

## Phase 12 — Security Hardening Pass

**Goal:** Every item in the Security Design section of SYSTEM_DESIGN.md verified, not just designed.

- [x] `@fastify/rate-limit` (global 300/min + stricter 10/min on auth routes), `@fastify/helmet` globally
- [x] Pino redaction audit — grepped every `logger.*` call for credential-shaped arguments (none found passing raw passwords/secrets) and confirmed `REDACTED_PATHS` in `packages/logger` covers every actual field name used (`password`, `passwordHash`, `encryptedPassword`, `encryptionIv/AuthTag`, `sessionStateEncrypted`, `cachedSessionState`, `accessToken`, `refreshToken`, `tokenHash`)
- [ ] Dedicated least-privilege Postgres role for the app's Prisma connection — not done (local dev uses the docker-compose superuser; this is a Supabase-project-settings task for Phase 13, not application code)
- [x] CSRF check on cookie-authenticated state-changing routes (`assertSameOriginFetch` on `/auth/refresh` + `/auth/logout`) — this exact check caught its own frontend bug in testing (the client wasn't sending the header, breaking silent session-restore on every page load) and is now fixed
- [x] Dependabot enabled (`.github/dependabot.yml` — npm, GitHub Actions, and both Dockerfiles)
- [x] Manual pass: attempt cross-user data access with a second test account against every list/detail endpoint — **done and passing**: registered a second ("attacker") account and confirmed, against the first ("victim") account's real data, that resume download → 404, role update → 404, resume delete → 404, and that profile/applications/portal-accounts/bot-status/runs all correctly return the attacker's own empty state rather than any of the victim's data.

**Exit Criteria:** mostly met — rate limiting, redaction, CSRF, and the cross-user adversarial test are all verified. The one remaining to-do is the least-privilege Postgres role, which is a Supabase-project-settings task for Phase 13, not application code.

**Depends On:** Phase 9 (needs a real, running app to audit).

---

## Phase 13 — Free-Tier Deployment & Demo Prep

**Goal:** Everything live, stable, and rehearsed for the client pitch.

- [x] GitHub Actions keep-alive cron (`.github/workflows/keep-alive.yml`, pings `api`/`worker` health every 10 min) — ships pre-wired but inert until you set the `API_HEALTH_URL`/`WORKER_HEALTH_URL` repo variables after deploying
- [x] Seed a demo user with realistic historical data (`pnpm db:seed:demo` — 2 roles, varied applied/skipped/failed with real skip/failure reasons, a completed run) — run and confirmed working (42 applications, 72% avg match score, correct per-role breakdown)
- [ ] Pre-demo warm-up runbook — not written yet (depends on having real deployed URLs to warm up)
- [x] README with architecture summary, local run instructions, and deployment mapping
- [x] (Not originally listed, added because it was needed to actually run anything) `apps/api/Dockerfile` and `apps/worker/Dockerfile` — multi-stage pnpm-workspace-aware builds, worker based on the official Playwright image
- [ ] Cloud account provisioning (Supabase/Upstash/Vercel/Render) and the actual deploy — **blocked on you creating the accounts**; everything above is set up to make this a config-only step once you have them

**Exit Criteria:** not yet met — this phase is gated on cloud account creation, which the agent can't do on your behalf. Once you have accounts: fill in `.env` production values, push the Dockerfiles to Render, deploy `apps/web` to Vercel, run `pnpm db:migrate:deploy` + `pnpm db:seed` + `pnpm db:seed:demo` against the Supabase database, set the keep-alive repo variables, and do one cold run-through before presenting.

**Depends On:** Phases 9–12.

---

## Future Work — Phase A (Additional Job Portals)

*Not built now — this is what proves the architecture's core promise once the MVP is stable.*

- [ ] `ZipRecruiterAdapter`, `IndeedAdapter`, `MonsterAdapter` — implement the same `JobPortalAdapter` contract from Phase 5/6
- [ ] Mark each `JobPortal.isActive = true` as it lands; no core engine/dashboard/DB changes expected — this is the architecture's own success test ("adapter task, not a rewrite")

## Future Work — Phase B (Advanced Features)

*Not built now.*

- [ ] AI-powered internal match score (populates the already-reserved `internalMatchScore` column)
- [ ] AI-generated application-question answers
- [ ] Scheduled bot runs, daily application limits
- [ ] Email notifications (candidate: Resend free tier)
- [ ] Advanced analytics
- [ ] Subscription plans, usage limits
- [ ] Admin dashboard, team/company accounts

---

## Critical Files

These are the files that carry the most architectural weight — get these right and the rest follows the pattern:

- `packages/db/prisma/schema.prisma` — the entire data model backbone; every other phase depends on getting the uniqueness constraints (`Job` dedup, `Application` dedup, `ResumeJobRole`) right first.
- `packages/shared/src/adapter.ts` — the `JobPortalAdapter` contract; this is the file that proves (or disproves) the "adapter task, not a rewrite" architectural promise.
- `apps/worker/src/engine/field-policy.ts` — the required-vs-optional "core rule" as a standalone, unit-testable module independent of any adapter.
- `apps/worker/src/engine/automation-engine.ts` — the state machine and per-role/per-portal orchestration loop that every adapter (mock, then Dice) plugs into.
- `apps/worker/src/adapters/dice/dice-adapter.ts` — the first real, portal-specific implementation; the one file most directly ported (behaviorally, not literally) from the reference `dice_apply.py`.
