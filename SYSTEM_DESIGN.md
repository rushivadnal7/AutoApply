# System Design — Job Application Automation SaaS

> Architecture reference for a multi-portal job-application automation platform, starting with Dice. Designed to run entirely on free-tier infrastructure while remaining an honest, scalable architecture — not a toy.

## 1. Goals / Non-Goals

**Goals (this build):**
- Prove a genuinely portal-agnostic architecture (engine + adapter contract) using Dice as the only real adapter, with a mock adapter proving the engine works before Dice exists.
- Full candidate configuration lifecycle: profile, multi-resume, multi-role, US-only preferences, mandatory/optional field policy, portal credentials, match threshold, limits.
- Background-worker-driven bot execution with live dashboard updates and Start/Pause/Resume/Stop control.
- Zero recurring infrastructure cost — every managed service is a genuine permanent free tier, no credit card commitment.
- A professional, defensible architecture (adapter pattern, real queue, real realtime channel, real encryption) suitable for review by a technical client.

**Non-Goals (explicitly out of scope for this build):**
- ZipRecruiter / Indeed / Monster adapters — stubbed only (interface-conformant classes that report "unsupported"), not implemented.
- AI-powered internal match score — the data model reserves a column (`internalMatchScore`), but no scoring logic is built.
- CAPTCHA solving/bypassing — treated as a hard failure reason, never attempted (cost, ToS, and ethics reasons).
- Billing/subscriptions, team/admin accounts, scheduled/cron bot runs, email notifications, horizontal auto-scaling / multi-instance orchestration.
- Kubernetes or microservices — three deployables only (web, api, worker), deliberately.

## 2. Tech Stack

Every choice below maps to a real, currently-available free tier — no trials, no cards required unless noted.

| Layer | Choice | Why | Free-tier provider |
|---|---|---|---|
| Language | TypeScript everywhere | The adapter interface, DB models, and shared schemas are the spine of this architecture — end-to-end types make the contract enforceable at compile time, not just documented. | n/a |
| Frontend framework | Next.js 14+ (App Router) | Best-in-class DX, huge ecosystem, deploys natively and for free to Vercel with zero config. | Vercel Hobby (no card required) |
| UI kit | Tailwind CSS + shadcn/ui | Free, open-source, ships a polished/professional look fast — matters for a client-facing demo. | n/a |
| Data fetching | TanStack Query | Standard caching/loading/error state for REST calls from Next.js client components. | n/a |
| Charts | Recharts | Free, React-native, enough for summary-card and progress visuals. | n/a |
| Backend API framework | Fastify | Faster than Express, native TS-friendly, built-in schema validation hooks, clean route modularity for ~10 domain route groups. | n/a |
| Background worker runtime | Plain Node.js process (health server + BullMQ `Worker`) | Playwright needs a real, long-lived browser process — this cannot run on a serverless/edge function, so it must be a standalone always-running Node process. | Render free **Web Service** (see §12 — Render's Background Worker product has no free tier) |
| Automation | Playwright (Chromium, headless) | Same tool the reference `dice_apply.py` script already uses — behavior parity, mature Node bindings, official Docker base image with all system deps preinstalled. | n/a (open source) |
| Database | PostgreSQL via Supabase | Relational integrity is essential — uniqueness constraints are how "no duplicate applications" and "job dedup" are enforced. Supabase bundles Postgres + object storage in one free account. | Supabase free project (500MB DB, 1GB storage, no card required) |
| ORM | Prisma | Best-in-class TS type generation from schema, first-class migrations, generated types feed the adapter/engine layer directly. | n/a |
| File storage (resumes) | Supabase Storage (private bucket) | Same vendor as the DB, S3-compatible semantics, short-lived signed URLs so the frontend never gets a permanent public link. | Included in Supabase free project |
| Queue / broker | BullMQ + Redis | The de facto standard Node queue with delayed jobs (pacing), retries/backoff (transient errors), and progress events — maps directly onto the pacing and failure-handling requirements. | Upstash Redis free tier (256MB, 500K commands/mo, reachable over TCP so BullMQ/ioredis works) |
| Realtime | Socket.IO | Room-based broadcasting, automatic reconnect, self-hosted — no extra vendor account or quota to track. | Self-hosted inside `apps/api` |
| Auth | Custom JWT (access + refresh) + argon2id password hashing | Demonstrates real auth engineering to a technical client rather than flipping on a BaaS toggle; fully portable, no external auth-vendor quota. | n/a (self-built) |
| Credential encryption | AES-256-GCM via Node `crypto`, server-held key | Portal passwords must be *reversible* (we log back into Dice with them) — architecturally distinct from one-way user password hashing. Built into Node core. | n/a |
| Monorepo tooling | pnpm workspaces + Turborepo | Modern standard for TS monorepos, fast incremental builds/caching, clean `apps/*` + `packages/*` split matching the 3-service deployment shape. | n/a (open source) |
| CI | GitHub Actions | Free minutes cover lint/typecheck/test on every PR and double as the free-tier "keep-alive" cron (see §12). | GitHub Actions free tier |
| Deployment — frontend | Vercel | Zero-config Next.js hosting, generous free Hobby tier. | Vercel Hobby |
| Deployment — API | Render free Web Service (Docker) | Same free-tier product family as the worker; WebSocket support works fine on the free tier. | Render free tier |
| Deployment — worker | Render free Web Service (Docker, `mcr.microsoft.com/playwright` base image) | See §12 for why this is a Web Service, not the paid Background Worker product. | Render free tier |
| Logging | Pino (with `redact` config) | Fastify's native logger, structured JSON, built-in field redaction directly satisfies "logs must not expose passwords." | n/a |
| Error tracking (hardening phase) | Sentry | 5,000 events/month free, no card required — genuine observability, easy to demo. | Sentry free tier |

## 3. High-Level Architecture

```
                         ┌────────────────────┐
                         │   apps/web (Next.js)│  Vercel
                         │  Dashboard / Wizard  │
                         └─────────┬───────────┘
                        REST (JWT)  │  Socket.IO (JWT handshake)
                                    ▼
                         ┌────────────────────┐
                         │   apps/api (Fastify) │  Render (free Web Svc)
                         │  routes/services      │
                         │  Socket.IO server     │
                         └──┬───────────┬───────┘
             Prisma/SQL     │           │ enqueue (BullMQ)     Redis pub/sub
                            ▼           ▼                     (control + events)
                  ┌──────────────┐   ┌────────────────┐   ◄──────────────┐
                  │  Supabase    │   │ Upstash Redis   │                 │
                  │  Postgres +  │   │ (BullMQ broker) │                 │
                  │  Storage     │   └───────┬─────────┘                 │
                  └──────────────┘           │ dequeue                   │
                                              ▼                          │
                                  ┌───────────────────────┐              │
                                  │ apps/worker            │──────────────┘
                                  │ Automation Engine       │  Render (free Web Svc)
                                  │  + Field Policy          │  Playwright/Chromium
                                  │  + JobPortalAdapter       │
                                  │      ├── DiceAdapter (real)
                                  │      ├── MockAdapter (dev/proof)
                                  │      └── Zip/Indeed/Monster (stubs)
                                  └──────────┬────────────┘
                                             ▼
                                     Dice (Playwright browser)
```

**Data flow for "Start Bot":**
`web` POST `/bot/start` (JWT) → `api` validates config, creates `BotRun` + snapshot rows, enqueues **one** BullMQ job → returns `202` immediately (bot never runs inside the HTTP request) → `worker` picks up the job, runs the Automation Engine loop, and for every state change/log/application result: writes to Postgres **and** publishes to a Redis pub/sub channel → `api` is subscribed to that channel and re-emits to the user's Socket.IO room → `web` updates live without refresh.

## 4. Monorepo Folder Structure

```
job-application-dashboard/
├── apps/
│   ├── web/                     # Next.js — Vercel
│   │   ├── app/
│   │   │   ├── (auth)/login, register
│   │   │   ├── (dashboard)/dashboard, profile, resumes, roles,
│   │   │   │   preferences, portals, bot, applications, logs, runs, settings
│   │   │   └── wizard/[step]
│   │   ├── components/
│   │   └── lib/ (api-client.ts, socket-client.ts, auth-context.tsx)
│   ├── api/                     # Fastify — Render Web Service
│   │   └── src/
│   │       ├── routes/ (auth, profile, resumes, roles, preferences,
│   │       │           portals, bot, applications, logs, runs)
│   │       ├── plugins/ (auth-guard, rate-limit, helmet, cors, socket-io)
│   │       ├── services/ (one per domain, all userId-scoped)
│   │       ├── realtime/ (redis-subscriber.ts, emitters.ts)
│   │       └── server.ts
│   └── worker/                  # BullMQ + Playwright — Render Web Service
│       └── src/
│           ├── engine/ (automation-engine.ts, state-machine.ts,
│           │           field-policy.ts, pacing.ts, control-signal.ts)
│           ├── adapters/
│           │   ├── base/ (adapter.ts interface, mock-adapter.ts)
│           │   ├── dice/ (dice-adapter.ts, dice-selectors.ts, dice-form-map.ts)
│           │   ├── zip-recruiter/ (stub-adapter.ts)
│           │   ├── indeed/ (stub-adapter.ts)
│           │   └── monster/ (stub-adapter.ts)
│           ├── queue/ (bullmq-worker.ts, redis-publisher.ts)
│           └── health-server.ts   # tiny HTTP server so Render treats this as a Web Service
├── packages/
│   ├── db/                      # Prisma schema, migrations, generated client
│   ├── shared/                  # adapter interface, zod schemas, enums, US-states constant
│   ├── config/                  # shared eslint/tsconfig/prettier
│   └── logger/                  # shared pino instance + redaction config
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
├── SYSTEM_DESIGN.md
└── IMPLEMENTATION_PLAN.md
```

## 5. Core Data Model

Key relationships called out explicitly since they're hard requirements:

- **Resume ↔ JobRole is many-to-many** via an explicit join entity `ResumeJobRole` (not a simple FK on `JobRole`), with an `isPrimary` flag enforced unique-per-role via a partial index. This satisfies "same resume assignable to multiple roles" while keeping "exactly one resume drives an application for a given role" as a deterministic rule.
- **Job dedup is global**, keyed by `(platform, externalJobId)` — a `Job` row is scraped metadata, not user-owned, so it can be a shared cache across users.
- **Application dedup is per-user**, keyed by `(userId, jobId)` — this is where "has this candidate already processed this job" is enforced at the database level, not just in application logic.

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  profile       CandidateProfile?
  resumes       Resume[]
  jobRoles      JobRole[]
  portalAccounts PortalAccount[]
  applications  Application[]
  bot           Bot?
  botRuns       BotRun[]
  refreshTokens RefreshToken[]
}

model CandidateProfile {
  id                 String  @id @default(uuid())
  userId             String  @unique
  user               User    @relation(fields: [userId], references: [id])
  fullName           String
  phone              String
  city               String?
  state              String?          // 2-letter US code
  workAuthorization  WorkAuthorization?
  linkedinUrl        String?
  portfolioUrl       String?
  updatedAt          DateTime @updatedAt
}

model Resume {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  fileName      String
  storagePath   String              // Supabase Storage key: resumes/{userId}/{id}/{fileName}
  fileSizeBytes Int
  mimeType      String
  isDefault     Boolean  @default(false)
  uploadedAt    DateTime @default(now())
  deletedAt     DateTime?
  roleLinks     ResumeJobRole[]
}

model JobRole {
  id               String   @id @default(uuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  title            String              // keyword, e.g. "Business Analyst"
  applicationLimit Int
  isActive         Boolean  @default(true)
  resumeLinks      ResumeJobRole[]
  preference       JobPreference?
  locations        JobRoleLocation[]
  createdAt        DateTime @default(now())
}

model ResumeJobRole {
  id         String   @id @default(uuid())
  resumeId   String
  resume     Resume   @relation(fields: [resumeId], references: [id])
  jobRoleId  String
  jobRole    JobRole  @relation(fields: [jobRoleId], references: [id])
  isPrimary  Boolean  @default(true)
  assignedAt DateTime @default(now())

  @@unique([resumeId, jobRoleId])
  // Partial unique index (raw SQL migration): one isPrimary=true row per jobRoleId
}

model JobPreference {
  id               String   @id @default(uuid())
  jobRoleId        String   @unique
  jobRole          JobRole  @relation(fields: [jobRoleId], references: [id])
  datePosted       DatePosted        // today | last_3_days | all
  employmentType   EmploymentType    // contract_c2c | fulltime | both
  workArrangement  WorkArrangement   // remote | hybrid | onsite | any
  matchThresholdPercent Int          // 0-100
  skipCoverLetter       Boolean @default(true)
  skipOptionalMessage   Boolean @default(true)
  skipPortfolio         Boolean @default(true)
  fillLinkedIn           Boolean @default(false)
}

model JobRoleLocation {
  id           String   @id @default(uuid())
  jobRoleId    String
  jobRole      JobRole  @relation(fields: [jobRoleId], references: [id])
  locationType LocationType   // city | state | remote
  city         String?
  state        String?        // validated against static US state list, app-layer
}

model JobPortal {                 // seeded lookup table
  id       String  @id @default(uuid())
  code     String  @unique        // DICE | ZIPRECRUITER | INDEED | MONSTER
  name     String
  isActive Boolean @default(false) // whether a real adapter exists yet
}

model PortalAccount {
  id                  String   @id @default(uuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id])
  jobPortalId         String
  jobPortal           JobPortal @relation(fields: [jobPortalId], references: [id])
  status              PortalAccountStatus  // connected | disconnected | reauth_required | error
  accountEmail        String
  encryptedPassword   String    // AES-256-GCM ciphertext (base64)
  encryptionIv        String
  encryptionAuthTag    String
  encryptionKeyVersion Int @default(1)
  sessionStateEncrypted String? // cached Playwright storageState, same AES scheme
  lastVerifiedAt      DateTime?

  @@unique([userId, jobPortalId])
}

model Job {                       // globally deduped scrape cache — NOT user-owned
  id                 String   @id @default(uuid())
  jobPortalId        String
  jobPortal          JobPortal @relation(fields: [jobPortalId], references: [id])
  externalJobId      String
  title              String
  company            String
  location           String
  url                String
  description        String?
  employmentTypeRaw  String?
  workArrangementRaw String?
  postedAt           DateTime?
  firstSeenAt        DateTime @default(now())
  lastSeenAt         DateTime @default(now())
  rawPayload         Json?

  @@unique([jobPortalId, externalJobId])
}

model Application {
  id                 String   @id @default(uuid())
  userId             String
  user               User     @relation(fields: [userId], references: [id])
  jobId              String
  job                Job      @relation(fields: [jobId], references: [id])
  jobRoleId          String
  jobRole            JobRole  @relation(fields: [jobRoleId], references: [id])
  resumeId           String?
  portalAccountId    String
  botRunId           String
  botRun             BotRun   @relation(fields: [botRunId], references: [id])
  status             ApplicationStatus   // processing | applied | failed | skipped
  platformMatchScore Int?
  internalMatchScore Int?      // reserved for future AI scoring, unused in MVP
  skipReason         SkipReason?
  failureReason      FailureReason?
  failureDetail      String?
  appliedAt          DateTime?
  createdAt          DateTime @default(now())

  @@unique([userId, jobId])   // <-- the dedup/duplicate-prevention constraint
}

model Bot {                       // live control-state singleton per user
  id                String  @id @default(uuid())
  userId            String  @unique
  status            BotStatus
  currentBotRunId   String?
  currentPlatform   String?
  currentRoleId     String?
  currentJobTitle   String?
  progressApplied   Int @default(0)
  progressSkipped   Int @default(0)
  progressFailed    Int @default(0)
  progressTotal     Int @default(0)
  pacingDelaySeconds Int @default(20)
  updatedAt         DateTime @updatedAt
}

model BotRun {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  status      BotStatus
  startedAt   DateTime @default(now())
  completedAt DateTime?
  totalApplied  Int @default(0)
  totalSkipped  Int @default(0)
  totalFailed   Int @default(0)
  roles       BotRunRole[]
  portals     BotRunPortal[]
  logs        BotLog[]
  applications Application[]
}

model BotRunRole {
  id                       String @id @default(uuid())
  botRunId                 String
  jobRoleId                String
  applicationLimitSnapshot Int
  appliedCount Int @default(0)
  skippedCount Int @default(0)
  failedCount  Int @default(0)
}

model BotRunPortal {
  id              String @id @default(uuid())
  botRunId        String
  jobPortalId     String
  portalAccountId String
}

model BotLog {
  id            String   @id @default(uuid())
  botRunId      String
  botRun        BotRun   @relation(fields: [botRunId], references: [id])
  jobRoleId     String?
  jobId         String?
  applicationId String?
  level         LogLevel  // info | warn | error | debug
  message       String
  context       Json?
  createdAt     DateTime @default(now())

  @@index([botRunId, createdAt])
}

model RefreshToken {
  id         String   @id @default(uuid())
  userId     String
  tokenHash  String
  userAgent  String?
  ipAddress  String?
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
}
```

## 6. `JobPortalAdapter` Interface Contract

Lives in `packages/shared/src/adapter.ts` so both the worker (implementations) and any future tooling share one contract.

```ts
export type PortalCode = 'DICE' | 'ZIPRECRUITER' | 'INDEED' | 'MONSTER';

export interface PortalCredentials {
  email: string;
  password: string;                 // decrypted, in-memory only — adapter must never persist it
  cachedSessionState?: unknown;      // Playwright storageState JSON, if previously saved
}

export interface SearchCriteria {
  keyword: string;
  locations: Array<{ type: 'city' | 'state' | 'remote'; city?: string; state?: string }>;
  datePosted: 'today' | 'last_3_days' | 'all';
  employmentType: 'contract_c2c' | 'fulltime' | 'both';
  workArrangement: 'remote' | 'hybrid' | 'onsite' | 'any';
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
  postedAt?: Date;
}

export interface FormFieldDescriptor {
  fieldId: string;                  // adapter-internal handle/selector ref
  label: string;                    // as read from the live DOM
  kind: 'text' | 'email' | 'phone' | 'select' | 'radio' | 'checkbox' | 'file' | 'textarea';
  required: boolean;                // read from DOM/validation state — never hardcoded
  candidateAttribute?: CandidateAttributeKey | null;
  isResumeUpload?: boolean;         // true ONLY for the actual resume file input
}

export type FillResult =
  | { fieldId: string; action: 'filled' }
  | { fieldId: string; action: 'skipped'; reason: string }
  | { fieldId: string; action: 'failed'; reason: string };

export interface ApplicationSubmissionResult {
  status: 'applied' | 'failed';
  verifiedBy?: string;              // e.g. "text:Application submitted"
  failureReason?: FailureReasonCode;
}

export interface AdapterRunContext {
  page: import('playwright').Page;
  browserContext: import('playwright').BrowserContext;
  botRunId: string;
  logger: BotLogger;                // writes BotLog rows + publishes realtime events
  signal: AbortSignal;               // cooperative cancellation for Pause/Stop
}

export interface JobPortalAdapter {
  readonly portalCode: PortalCode;

  authenticate(creds: PortalCredentials, ctx: AdapterRunContext): Promise<{ success: boolean; sessionState?: unknown; reason?: string }>;
  searchJobs(criteria: SearchCriteria, ctx: AdapterRunContext): AsyncIterable<NormalizedJob>;
  getJobDetails(job: NormalizedJob, ctx: AdapterRunContext): Promise<NormalizedJob>;
  getMatchScore(job: NormalizedJob, ctx: AdapterRunContext): Promise<{ score: number | null; source: 'platform' }>;
  checkApplicationStatus(job: NormalizedJob, ctx: AdapterRunContext): Promise<'open' | 'closed' | 'already_applied' | 'unknown'>;
  startApplication(job: NormalizedJob, ctx: AdapterRunContext): Promise<{ started: boolean; reason?: string }>;
  detectFormFields(ctx: AdapterRunContext): Promise<FormFieldDescriptor[]>;
  fillRequiredFields(fields: FormFieldDescriptor[], candidate: CandidateProfileData, ctx: AdapterRunContext): Promise<FillResult[]>;
  skipOptionalFields(fields: FormFieldDescriptor[], prefs: OptionalFieldPreferences, ctx: AdapterRunContext): Promise<FillResult[]>;
  uploadResume(resumeFilePath: string, fields: FormFieldDescriptor[], ctx: AdapterRunContext): Promise<FillResult>;
  submitApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult>;
  verifyApplication(ctx: AdapterRunContext): Promise<ApplicationSubmissionResult>;

  // Added beyond the literal list in the requirements doc — necessary to drive
  // multi-step forms (Continue/Next/Review/Submit/Confirm/Done) while keeping the
  // required/optional POLICY decision itself in the engine, not the adapter.
  proceedToNextStep(ctx: AdapterRunContext): Promise<{ isFinalStep: boolean }>;
}
```

Two deliberate clarifications worth keeping in mind (so they read as intentional, not inconsistent):
1. `fillRequiredFields` is invoked by the engine both for truly-mandatory fields **and** for optional fields the user chose to actively fill (e.g., LinkedIn) — the required/optional *decision* already happened in the engine before the adapter is called, so from the adapter's point of view it's just "fill these fields with these values."
2. `proceedToNextStep` is the one addition beyond the requirements doc's literal list, needed because the engine (not the adapter) must own the required/optional loop across every step of a multi-step form.

## 7. Automation Engine — Workflow / State Machine

State enum (matches the requirement's exact list): `Idle, Starting, LoggingIn, Searching, Analyzing, Applying, Waiting, Paused, Resuming, Completed, Failed, Stopped`.

```
Idle --start--> Starting --> LoggingIn
LoggingIn --success--> Searching(role, portal)
LoggingIn --failure--> Failed (BotRun ends, reason=login_failed)
Searching --jobs found--> Analyzing(job)
Analyzing --fails filter/dedup/threshold--> record Skipped --> Analyzing(next job)
Analyzing --passes--> Applying(job)
Applying --result recorded--> Waiting(pacing delay) --> Analyzing(next job)
[any active state] --pause command (next checkpoint)--> Paused --resume--> Resuming --> [prior state]
[any active state] --stop command (next checkpoint)--> Stopped
role limit reached OR all roles/portals exhausted --> Completed
unrecoverable error (e.g. session re-auth failed) --> Failed, Bot paused, user notified
```

**Outer loop shape:** for each `Role` in the run (outer) → for each `Portal` in the run (inner) → authenticate (reuse cached session if valid) → search → process jobs until **that role's** `applicationLimit` (summed across all portals used in the run) is reached or the portal's results are exhausted → next portal → next role. Application limit is enforced as a running counter per `BotRunRole`, portal-agnostic.

**Pause semantics (explicit design decision):** Pause does not interrupt an in-flight application. The engine checks the control signal only at safe checkpoints (after an application fully resolves to applied/failed/skipped, before the next job starts). This guarantees no half-submitted form is ever left in an inconsistent state.

**Failure containment:** every per-job iteration is wrapped in try/catch at the engine level; a caught error records `Application.status = failed` with the mapped `failureReason` and the loop continues — this is what satisfies "a single failed application must not stop the whole run." Session-expiry is special-cased: on detecting expiry, engine calls `adapter.authenticate()` again; if that fails, the run transitions to `Paused` (not `Failed`) and a realtime + BotLog notification is emitted.

## 8. Background Job / Queue Design

**Granularity decision: one BullMQ job per `BotRun`**, not per-role and not per-job-application. Rationale:
- Portal sessions are inherently sequential — one authenticated Playwright browser context per portal per run avoids concurrent-session anti-bot detection on Dice.
- Pacing/rate-control is naturally sequential; fan-out to many small jobs would fight against it.
- Session/cookie reuse (Playwright `storageState`) is simplest to manage within one continuous browser context.

Fine-grained visibility is achieved without fine-grained queuing: the worker emits progress via `job.updateProgress()` **and** direct DB writes (`BotLog`, `Application`) **and** Redis pub/sub events at every per-job-application boundary inside that single long-running BullMQ job.

- **Enqueue:** `api` creates `BotRun` + `BotRunRole`/`BotRunPortal` snapshot rows in one transaction, then `queue.add('process-bot-run', { botRunId })`.
- **Concurrency guard:** a DB check (unique "one active BotRun per user" — enforced via a partial unique index on `BotRun` where `status` is in the active set) prevents a user from starting two runs at once.
- **Retries:** BullMQ `attempts: 2` is for catastrophic run-level failure (worker crash, browser crash) — resuming naturally skips already-processed jobs because the `(userId, jobId)` unique constraint on `Application` prevents re-processing. Per-application transient errors (network blips) get a small inline retry (2 attempts, short backoff) at the *adapter action* level, not the BullMQ job level.
- **Control (Pause/Resume/Stop):** since one BotRun = one long-lived executing BullMQ job, BullMQ's own pause/resume primitives (which operate on queues, not individual in-flight jobs) don't apply here. Instead: `api` writes the intent to `Bot.status` **and** publishes a Redis pub/sub message on `bot-control:{userId}`; the worker subscribes to that channel for the duration of the run and checks/acts on it at the next safe checkpoint (see engine pause semantics above). Stop triggers an `AbortController` used as the `AdapterRunContext.signal`.
- **Upstash-specific setup note:** the Upstash Redis DB must have **eviction disabled (`noeviction`)** in its dashboard settings — BullMQ relies on job-state keys persisting under memory pressure, and Upstash's default eviction policy can silently drop them.

## 9. Realtime Update Design

- **Transport:** Socket.IO server hosted inside `apps/api`.
- **Auth:** JWT verified during the Socket.IO handshake (same access token as REST calls).
- **Room granularity:** per-user room (`user:{userId}`). MVP guarantees at most one active `BotRun` per user, so per-run rooms aren't needed yet; every event payload still includes `botRunId` so the frontend can associate/filter, and per-run rooms are a documented future extension if concurrent runs are ever allowed.
- **Bridge across processes:** the worker is a separate deployable from `api`, so it cannot emit to Socket.IO directly. It publishes JSON events to a Redis pub/sub channel (`realtime:{userId}`); `api` subscribes and re-emits to the matching Socket.IO room. This reuses the Redis instance already provisioned and avoids adding a Redis Socket.IO adapter package (unnecessary at single-instance demo scale).
- **Events:**
  - `bot:status` — `{ status, currentPlatform, currentRoleId, currentJobTitle, progress: { applied, skipped, failed, total } }`
  - `bot:log` — `{ botRunId, level, message, createdAt, jobId?, applicationId? }`
  - `bot:application` — full `Application` row summary, on create/update
  - `bot:run-completed` — `{ botRunId, summary }`

## 10. Required vs. Optional Field Policy — the Core Rule

This gets its own module (`apps/worker/src/engine/field-policy.ts`, portal-agnostic, unit-testable without Playwright) because it is a first-class mechanism, not an afterthought.

```ts
export type FieldDecision =
  | { action: 'fill'; value: string; source: 'candidate_profile' }
  | { action: 'skip'; reason: 'optional_user_preference' }
  | { action: 'fail_application'; reason: 'mandatory_field_unfillable'; fieldLabel: string };

export function resolveFieldDecision(
  field: FormFieldDescriptor,
  candidate: CandidateProfileData,
  prefs: OptionalFieldPreferences,
): FieldDecision {
  if (field.required) {
    // NOTE: `prefs` is intentionally never read in this branch. This is the
    // structural guarantee that a user's optional-field configuration can
    // never cause a mandatory field to be skipped.
    const value = lookupCandidateValue(field.candidateAttribute, candidate);
    return value
      ? { action: 'fill', value, source: 'candidate_profile' }
      : { action: 'fail_application', reason: 'mandatory_field_unfillable', fieldLabel: field.label };
  }
  const wantsFill = field.candidateAttribute && prefs.shouldFill(field.candidateAttribute);
  const value = wantsFill ? lookupCandidateValue(field.candidateAttribute, candidate) : undefined;
  return value ? { action: 'fill', value, source: 'candidate_profile' } : { action: 'skip', reason: 'optional_user_preference' };
}
```

- **Required-ness source of truth is the live form's DOM/validation state** (`FormFieldDescriptor.required`, set by the adapter's `detectFormFields()`), not a hardcoded list.
- A `fail_application` decision on ANY field aborts that application immediately with `Application.failureReason = 'mandatory_field_unfillable'` and `failureDetail = field.label` — fail gracefully rather than submit incomplete information.
- **Test obligation:** a unit test that stubs `prefs` to throw if accessed, then asserts the required branch never touches it — turning the "structural guarantee" into something CI actually enforces.

## 11. Security Design

| Requirement | Mechanism |
|---|---|
| Passwords not stored plain text | `User.passwordHash` via `argon2id` (memory-hard, GPU-resistant) |
| Sensitive credentials encrypted at rest | `PortalAccount.encryptedPassword` via AES-256-GCM (authenticated encryption), unique IV per record, server-only key from env var; `encryptionKeyVersion` column reserved for future key rotation |
| Resume files access-controlled per-owner | Private Supabase Storage bucket, key `resumes/{userId}/{resumeId}/{fileName}`; all access brokered by the API (ownership check against JWT `userId`), never a permanent public URL — only short-lived (5 min) signed URLs |
| Users only access their own data | Every Prisma query in the service layer is scoped by `userId` from the verified JWT, never from client-supplied body/query params; shared `assertOwnership()` helper |
| Auth sessions/tokens protected | Short-lived (15 min) JWT access token + httpOnly/Secure/SameSite=Strict refresh cookie; refresh tokens stored **hashed** in `RefreshToken`, rotated on every use (old token invalidated), enabling theft detection and "logout everywhere" |
| API endpoints require authorization | Global Fastify `preHandler` auth-guard hook, explicit allow-list only for `/auth/register`, `/auth/login`, `/auth/refresh`, `/health` |
| Logs must not expose credentials | Pino `redact` config on `password`, `encryptedPassword`, `sessionStateEncrypted`, `accountEmail`-adjacent fields; code-review checklist item forbidding raw credential-object interpolation into `BotLogger` |
| File uploads validated | Magic-byte MIME sniffing (not trusting file extension/Content-Type header), max size enforced both at Fastify multipart config and again server-side, storage key generated from `resumeId` (never trusts user-supplied filename for the path) |
| DB least privilege | Dedicated Postgres role for the Prisma connection (not the Supabase default superuser), granted only the DML/DDL it needs |
| CSRF (not in the source list, load-bearing) | SameSite=Strict cookies + custom header check on state-changing routes, since refresh tokens live in cookies |
| Brute force (not in the source list, load-bearing) | `@fastify/rate-limit` on `/auth/*` |

## 12. Free-Tier Operational Notes

- **Render has no free "Background Worker" product** (verified against Render's docs as of Aug 2026) — the automation worker must be deployed as a free **Web Service** that also binds a tiny HTTP health endpoint to `$PORT` (this is what makes Render treat it as a valid free Web Service), with the BullMQ `Worker` running in the same process.
- **Free Web Services sleep after 15 min of no HTTP traffic**, including the worker. A paused bot run sitting idle waiting on Redis pub/sub generates no HTTP traffic and risks being killed mid-pause. Mitigation: a GitHub Actions scheduled workflow (already free, same repo as CI) pings both the `api` and `worker` health endpoints every ~10 minutes, and separately pings the Supabase project at least weekly to prevent its 7-day inactivity auto-pause.
- **Cold starts (30-60s)** should be handled before a live demo — a warm-up ping a minute or two before the demo starts avoids an awkward pause on stage.
- **Resource fit:** Render's free tier is ~512MB RAM / shared CPU — headless Chromium is memory-heavy, so the design constraint of "one BotRun (one browser context) at a time" isn't just a correctness choice, it's also what keeps the worker inside the free-tier resource envelope.
- **Playwright on Docker:** use the official `mcr.microsoft.com/playwright:<version>-jammy` base image for the worker's Dockerfile — it ships Chromium plus all required system libraries preinstalled.
- **Supabase specifics (verified Aug 2026):** 500MB DB, 1GB file storage, 5GB egress, 50,000 MAU, up to 2 active projects, auto-pause after 7 days of no database requests (same keep-alive ping covers this).
- **Upstash specifics (verified Aug 2026):** 256MB data size, 500K commands/month, 10GB bandwidth/month, up to 10 free databases.

## 13. Risks & Considerations

- Automating applications against a portal's ToS is a business/legal consideration, not an engineering one — worth a short, explicit conversation with the client: the bot only acts on the *candidate's own* consented account, with configurable pacing, and hard-fails (rather than attempts to bypass) on CAPTCHA — a defensible, conservative stance to lead with.
- Dice's DOM can change without notice — this is precisely why `failureReason = 'form_changed'` exists as a first-class status and why Dice selectors live in an isolated `dice-selectors.ts` file, not scattered through logic.
