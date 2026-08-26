import "./lib/websocket-polyfill.js"; // must run before anything constructs a Supabase client
import { createLogger } from "@job-app/logger";
import { env } from "./lib/env.js";
import { createRedisConnection } from "./lib/redis.js";
import { createBotRunWorker } from "./queue/bullmq-worker.js";
import { startHealthServer } from "./health-server.js";
import { keyFingerprint } from "./lib/crypto.js";

const logger = createLogger({ name: "worker" });

async function main() {
  logger.info({ adapterMode: env.WORKER_ADAPTER_MODE }, "Starting automation worker");
  logger.info({ credentialsKeyFingerprint: keyFingerprint() }, "Loaded CREDENTIALS_ENCRYPTION_KEY");

  const queueConnection = createRedisConnection("bullmq-worker");
  const publisherConnection = createRedisConnection("realtime-publisher");

  const health = await startHealthServer(logger);
  const worker = createBotRunWorker(queueConnection, publisherConnection, logger);

  logger.info({ port: env.WORKER_HEALTH_PORT }, "Worker health server listening; BullMQ worker ready");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker");
    await worker.close();
    await health.close();
    await queueConnection.quit();
    await publisherConnection.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting worker");
  process.exit(1);
});
