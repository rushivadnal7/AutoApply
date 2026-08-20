import { Worker, type Job } from "bullmq";
import type { Redis as IORedis } from "ioredis";
import type { Logger as PinoLogger } from "@job-app/logger";
import { runBotRun } from "../engine/automation-engine.js";

export const BOT_RUN_QUEUE_NAME = "process-bot-run";

export interface BotRunJobData {
  botRunId: string;
  userId: string;
}

export function createBotRunWorker(connection: IORedis, redisPublisher: IORedis, logger: PinoLogger): Worker<BotRunJobData> {
  const worker = new Worker<BotRunJobData>(
    BOT_RUN_QUEUE_NAME,
    async (job: Job<BotRunJobData>) => {
      logger.info({ botRunId: job.data.botRunId }, "Picked up bot run job");
      await runBotRun(job.data.botRunId, redisPublisher, logger);
    },
    {
      connection,
      // One BotRun = one long-lived browser session (SYSTEM_DESIGN.md §8) —
      // concurrency > 1 here would mean multiple Chromium instances
      // fighting over the same free-tier ~512MB RAM envelope. Different
      // users' runs still queue and process one after another rather than
      // failing outright.
      concurrency: 1,
      lockDuration: 10 * 60 * 1000, // long-running jobs; extend BullMQ's stalled-job lock accordingly
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, botRunId: job?.data.botRunId }, "Bot run job failed at the queue level");
  });

  return worker;
}
