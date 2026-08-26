import { Redis } from "ioredis";
import { createLogger } from "@job-app/logger";
import { env } from "./env.js";

const logger = createLogger({ name: "api:redis" });

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it's given.
 * We keep one connection for the queue and a second, separate connection for
 * pub/sub — a Redis connection in subscribe mode can't issue other commands.
 *
 * Every ioredis instance needs an 'error' listener or it falls back to a
 * noisy, unstructured `console.error` per event (its safety net against
 * crashing the process, not a real problem — free-tier Redis providers like
 * Upstash routinely recycle idle connections, and ioredis reconnects on its
 * own). This just routes that through our structured logger instead, and
 * labels which connection it came from since a service can have several.
 */
export function createRedisConnection(label = "redis"): Redis {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err) => {
    logger.warn({ err, connection: label }, "Redis connection error (ioredis will retry automatically)");
  });
  return connection;
}

export const redisConnection = createRedisConnection("bullmq-queue");
