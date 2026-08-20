# Job Application Automation SaaS

A multi-portal job-application automation platform. Candidates configure roles, resumes, and preferences; a background worker searches, filters, and applies to jobs on their behalf; a dashboard tracks results in real time.

Dice is the first (and currently only) working portal integration. The architecture — a generic Automation Engine driving a `JobPortalAdapter` interface — is built so adding ZipRecruiter/Indeed/Monster later is an adapter task, not a rewrite. See **[SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)** for the full architecture and **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** for phase-by-phase status (what's built, what's verified, what's left).

## Stack

TypeScript monorepo (pnpm workspaces + Turborepo) — Next.js frontend, Fastify API, BullMQ/Playwright worker, Postgres via Prisma, Redis for queue + realtime. Every piece maps to a free-tier cloud provider (Vercel, Render, Supabase, Upstash) — see SYSTEM_DESIGN.md §2 for the full table and rationale.

```
apps/
  web/     Next.js dashboard (App Router)
  api/     Fastify REST API + Socket.IO
  worker/  BullMQ consumer running the Automation Engine (Playwright)
packages/
  db/       Prisma schema + client
  shared/   Cross-app types: the JobPortalAdapter contract, zod schemas, enums
  logger/   Shared pino instance with credential redaction
  config/   Shared tsconfig
```

## Running locally

Requires Node 20+, pnpm, and Docker (for local Postgres/Redis — no cloud account needed for local dev).

```bash
pnpm install
cp .env.example .env        # then fill in CREDENTIALS_ENCRYPTION_KEY, JWT secrets (see below)
docker compose up -d        # local Postgres + Redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed                # seeds the JobPortal lookup table (Dice, ZipRecruiter, Indeed, Monster)
pnpm db:seed:demo           # optional: populates a demo@example.com account with realistic history
pnpm dev                    # runs web (:3000), api (:4000), worker (:4100 health) together
```

Generate the two required secrets before starting:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # CREDENTIALS_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (generate two)
```

By default the worker runs in **mock mode** (`WORKER_ADAPTER_MODE=mock` in `.env.example`) — a pure-TypeScript fake adapter drives the exact same engine, queue, and realtime pipeline as real Dice would, with no Playwright browser or Dice credentials required. This is what proves the architecture end-to-end and is what the demo seed data assumes. Switch to `WORKER_ADAPTER_MODE=dice` (and run `pnpm --filter @job-app/worker exec playwright install chromium`) once you have a real Dice test account — see the note on Dice below.

## Where things stand

Phases 0–10 (scaffolding through application history/logs) are built and verified against local infrastructure: registered a user, configured a role end-to-end through the real UI, ran the bot, watched Socket.IO push live status/log updates with zero page refreshes, and confirmed cross-user data isolation with a second test account. The full status, including two real bugs that were caught and fixed during this verification pass, is tracked in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

**Two things are explicitly not done and need your attention before a client demo that touches real Dice:**

1. **The Dice adapter (`apps/worker/src/adapters/dice/`) has never run against a real Dice account.** No test credentials were available while building this. The code is complete and follows the documented UX flow, but every CSS/text selector in `dice-selectors.ts` is a best-effort starting point — budget time to verify/tune it against a live account, or demo on mock mode (fully working) and be upfront that this is the next step.
2. **No cloud accounts have been provisioned.** Everything above was verified against `docker-compose`'s local Postgres/Redis. Standing up the actual free-tier Supabase/Upstash/Vercel/Render deployment (Phase 13) needs your accounts — Dockerfiles, CI, and a keep-alive workflow are already in place to make that step mechanical once you have them.

## Deploying to free-tier infrastructure

See SYSTEM_DESIGN.md §2 and §12 for the full reasoning. Short version:

- **Database + file storage:** create a [Supabase](https://supabase.com) project, set `DATABASE_URL`/`DIRECT_URL` from its connection-pooling and direct URIs, and `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_STORAGE_BUCKET` for resume storage.
- **Redis:** create an [Upstash](https://upstash.com) Redis database, set its eviction policy to `noeviction`, and use its `REDIS_URL`.
- **API + worker:** deploy `apps/api/Dockerfile` and `apps/worker/Dockerfile` as two [Render](https://render.com) **Web Services** (not the paid Background Worker product — it has no free tier; the worker binds a health port specifically so it qualifies as a Web Service).
- **Frontend:** deploy `apps/web` to [Vercel](https://vercel.com), pointing `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SOCKET_URL` at the deployed API.
- **Keep-alive:** set the `API_HEALTH_URL`/`WORKER_HEALTH_URL` repo variables so `.github/workflows/keep-alive.yml` can ping both every 10 minutes — Render's free tier sleeps after 15 minutes idle, and a paused bot run generates no HTTP traffic to keep it awake otherwise.

## Testing

```bash
pnpm test         # unit tests (currently: apps/worker's field-policy — the required/optional "core rule")
pnpm typecheck    # across every app/package
pnpm build        # production build of everything
```

## Security notes for reviewers

Portal account passwords are AES-256-GCM encrypted at rest (reversible — the worker needs to log back in), separate from the user's own login password (argon2id, one-way). Refresh tokens rotate on every use and are stored hashed; reuse of a revoked token revokes every session for that user. Every service-layer query is scoped by the authenticated `userId` from the verified JWT, never from client-supplied identifiers — this was adversarially tested with a second account (resume download, role update, resume delete all correctly return 404; profile/applications/portal-accounts/bot-status/runs all correctly return the second account's own empty state). Full mapping of requirements to mechanisms is in SYSTEM_DESIGN.md §11.
