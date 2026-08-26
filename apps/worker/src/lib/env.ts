import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env") });
config();

// Render assigns its own PORT and requires the service to bind to it — see
// the identical comment in apps/api/src/lib/env.ts.
if (process.env.PORT) process.env.WORKER_HEALTH_PORT = process.env.PORT;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(1),
  WORKER_HEALTH_PORT: z.coerce.number().int().default(4100),
  WORKER_HEADLESS: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  WORKER_DEFAULT_PACING_SECONDS: z.coerce.number().int().min(0).default(20),
  // "mock" drives the DICE slot with a pure-TS fake adapter (no Playwright,
  // no real credentials needed) — this is what proves the engine works
  // portal-agnostically (Phase 5) and is the safe default here since this
  // build environment has no real Dice test account to verify against.
  // Set to "dice" once you have real Dice credentials to exercise Phase 6/7.
  WORKER_ADAPTER_MODE: z.enum(["mock", "dice"]).default("mock"),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_STORAGE_BUCKET: z.string().default("resumes"),
  SENTRY_DSN: z.string().optional().default(""),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid worker environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const usesSupabaseStorage = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
