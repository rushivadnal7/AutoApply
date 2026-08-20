import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it's given.
 * We keep one connection for the queue and a second, separate connection for
 * pub/sub — a Redis connection in subscribe mode can't issue other commands.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redisConnection = createRedisConnection();
