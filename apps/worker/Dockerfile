# Built from the monorepo root: docker build -f apps/worker/Dockerfile .
# Render (free Web Service) deploys this directly — see SYSTEM_DESIGN.md §12.
# Base image ships Chromium + all system deps preinstalled, avoiding a
# manual apt-get dependency chase for Playwright.

FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
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
RUN pnpm --filter @job-app/worker build

FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
ENV NODE_ENV=production
ENV WORKER_ADAPTER_MODE=dice
COPY --from=build /repo /repo
EXPOSE 4100
CMD ["node", "apps/worker/dist/main.js"]
