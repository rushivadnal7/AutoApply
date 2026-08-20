import { Redis } from "ioredis";
import { env } from "./env.js";

/** BullMQ requires `maxRetriesPerRequest: null`. Separate connections for the
 * BullMQ Worker, the realtime publisher, and each run's control-channel
 * subscriber — a connection in subscribe mode can't issue other commands. */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
