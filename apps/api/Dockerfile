# Built from the monorepo root: docker build -f apps/api/Dockerfile .
# Render (free Web Service) deploys this directly — see SYSTEM_DESIGN.md §12.
#
# Runs via `tsx` rather than compiled `dist/` output. The shared workspace
# packages (@job-app/logger, @job-app/shared, @job-app/db) resolve straight
# to their TypeScript source (see their package.json `main`/`exports`) —
# that's fine for tsx (dev, and here) but plain `node` cannot import a raw
# .ts file at all (ERR_UNKNOWN_FILE_EXTENSION). Running the same way in
# prod as in `pnpm dev` sidesteps having to give every shared package its
# own build step and keep it correctly ordered in this Dockerfile.

FROM node:20-slim AS base
# node:20-slim ships with no OpenSSL at all — Prisma's native query engine
# binary needs libssl present just to load (dlopen), regardless of whether
# it's used to run `prisma generate` or just to start the app. Installing
# it here, in the stage everything else builds from, means both the
# generate step and the final runtime actually have it.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @job-app/api...

FROM deps AS build
COPY packages/config packages/config
COPY packages/logger packages/logger
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @job-app/db generate

# Inherits from `base` (not a fresh `FROM node:20-slim`) specifically so the
# openssl install and pnpm setup above actually carry into the runtime
# image — a separate `FROM node:20-slim` here would silently drop both.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
EXPOSE 4000
# `pnpm exec` from the repo root only resolves binaries reachable from the
# root package's own dependencies — tsx is a dependency of apps/api
# specifically, so we run it via that package's own "start" script instead,
# which correctly prepends apps/api/node_modules/.bin to PATH.
CMD ["pnpm", "--filter", "@job-app/api", "start"]
