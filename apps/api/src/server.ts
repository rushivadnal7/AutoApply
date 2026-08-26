import "./lib/websocket-polyfill.js"; // must run before anything constructs a Supabase client
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { createLogger } from "@job-app/logger";
import { env } from "./lib/env.js";

import securityPlugin from "./plugins/security.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authGuardPlugin from "./plugins/auth-guard.js";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import roleRoutes from "./routes/role.routes.js";
import portalRoutes from "./routes/portal.routes.js";
import botRoutes from "./routes/bot.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

import { createSocketServer } from "./realtime/socket-server.js";
import { startRealtimeBridge } from "./realtime/redis-subscriber.js";
import { keyFingerprint } from "./lib/crypto.js";

const logger = createLogger({ name: "api" });

async function main() {
  logger.info({ credentialsKeyFingerprint: keyFingerprint() }, "Loaded CREDENTIALS_ENCRYPTION_KEY");

  const fastify = Fastify({ loggerInstance: logger, disableRequestLogging: env.NODE_ENV === "production" });

  await fastify.register(securityPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await fastify.register(authGuardPlugin);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(resumeRoutes);
  await fastify.register(roleRoutes);
  await fastify.register(portalRoutes);
  await fastify.register(botRoutes);
  await fastify.register(applicationRoutes);
  await fastify.register(dashboardRoutes);

  await fastify.ready();

  const io = createSocketServer(fastify.server, logger);
  const stopRealtimeBridge = startRealtimeBridge(io, logger);

  await fastify.listen({ port: env.API_PORT, host: "0.0.0.0" });
  logger.info({ port: env.API_PORT }, "API server listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down API server");
    await stopRealtimeBridge();
    await fastify.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting API server");
  process.exit(1);
});
