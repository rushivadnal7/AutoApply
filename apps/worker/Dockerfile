# Built from the monorepo root: docker build -f apps/worker/Dockerfile .
# Render (free Web Service) deploys this directly — see SYSTEM_DESIGN.md §12.
# Base image ships Chromium + all system deps preinstalled, avoiding a
# manual apt-get dependency chase for Playwright.
#
# Runs via `tsx` rather than compiled `dist/` output — see the comment at
# the top of apps/api/Dockerfile for why (shared workspace packages resolve
# to raw .ts source, which plain `node` can't import but tsx can, same as
# local `pnpm dev` already does).

FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS base
# Ubuntu Jammy generally ships OpenSSL already, but installing it explicitly
# here avoids relying on that — see the equivalent, confirmed-necessary fix
# in apps/api/Dockerfile for what happens when Prisma's native engine can't
# find libssl at all.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Not corepack — see the identical, confirmed-necessary fix in
# apps/api/Dockerfile: npm rotated its package-signing keys, and older
# corepack builds fail signature verification with "Cannot find matching
# keyid" as a result. Plain `npm install -g` isn't exposed to that check.
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @job-app/worker...

FROM deps AS build
COPY packages/config packages/config
COPY packages/logger packages/logger
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/worker apps/worker
RUN pnpm --filter @job-app/db generate

# Inherits from `base` (not a fresh `FROM ...:jammy`) so the openssl install
# and pnpm setup above actually carry into the runtime image — see the
# identical reasoning in apps/api/Dockerfile.
FROM base AS runtime
ENV NODE_ENV=production
ENV WORKER_ADAPTER_MODE=mock
COPY --from=build /repo /repo
EXPOSE 4100
# See the equivalent comment in apps/api/Dockerfile — run via the package's
# own "start" script so tsx resolves from apps/worker/node_modules/.bin.
CMD ["pnpm", "--filter", "@job-app/worker", "start"]
