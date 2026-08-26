import { Redis } from "ioredis";
import { createLogger } from "@job-app/logger";
import { env } from "./env.js";

const logger = createLogger({ name: "worker:redis" });

/**
 * BullMQ requires `maxRetriesPerRequest: null`. Separate connections for the
 * BullMQ Worker, the realtime publisher, and each run's control-channel
 * subscriber — a connection in subscribe mode can't issue other commands.
 *
 * See the identical comment in apps/api/src/lib/redis.ts: every ioredis
 * instance needs an 'error' listener or it falls back to noisy unstructured
 * console output on every reconnect (free-tier Redis providers recycle idle
 * connections routinely; ioredis reconnects on its own — not a crash).
 */
export function createRedisConnection(label = "redis"): Redis {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err) => {
    logger.warn({ err, connection: label }, "Redis connection error (ioredis will retry automatically)");
  });
  return connection;
}
