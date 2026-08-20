import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export const BOT_RUN_QUEUE_NAME = "process-bot-run";

export interface BotRunJobData {
  botRunId: string;
  userId: string;
}

export const botRunQueue = new Queue<BotRunJobData>(BOT_RUN_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { age: 86_400 * 7 },
    removeOnFail: { age: 86_400 * 30 },
  },
});

export async function enqueueBotRun(data: BotRunJobData): Promise<void> {
  await botRunQueue.add(BOT_RUN_QUEUE_NAME, data, { jobId: data.botRunId });
}
