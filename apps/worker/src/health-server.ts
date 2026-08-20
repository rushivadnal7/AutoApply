import Fastify from "fastify";
import type { Logger as PinoLogger } from "@job-app/logger";
import { env } from "./lib/env.js";

/**
 * Render's free tier has no "Background Worker" product — only Web Service
 * gets a free instance (verified against Render's docs, Aug 2026; see
 * SYSTEM_DESIGN.md §12). Binding a tiny HTTP health endpoint is what lets
 * this process be deployed as a free Web Service despite doing no HTTP
 * work of its own; a keep-alive ping (see .github/workflows) hits this to
 * prevent the 15-minute idle sleep from killing an in-progress bot run.
 */
export async function startHealthServer(logger: PinoLogger) {
  const fastify = Fastify({ loggerInstance: logger, disableRequestLogging: true });
  fastify.get("/health", async () => ({ status: "ok", service: "worker", time: new Date().toISOString() }));
  await fastify.listen({ port: env.WORKER_HEALTH_PORT, host: "0.0.0.0" });
  return fastify;
}
