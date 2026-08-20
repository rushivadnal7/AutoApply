import type { Redis as IORedis } from "ioredis";
import type { Logger as PinoLogger } from "@job-app/logger";
import { prisma, Prisma } from "@job-app/db";
import { REALTIME_EVENTS, realtimeChannelFor, type BotLogger, type LogLevel } from "@job-app/shared";
import type { RealtimeEnvelope } from "@job-app/shared";

export interface CreateBotLoggerOptions {
  botRunId: string;
  userId: string;
  redisPublisher: IORedis;
  processLogger: PinoLogger;
}

/**
 * Implements the shared `BotLogger` interface (void-returning by design —
 * adapters and the engine call it fire-and-forget, never awaiting a log
 * line). Every call does two things: persists a BotLog row for the
 * Application History/Logs pages, and publishes a `bot:log` realtime event
 * so the dashboard's live log panel updates without polling.
 */
export function createBotLogger(options: CreateBotLoggerOptions): BotLogger {
  const { botRunId, userId, redisPublisher, processLogger } = options;

  function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const jobId = typeof context?.jobId === "string" ? context.jobId : undefined;
    const applicationId = typeof context?.applicationId === "string" ? context.applicationId : undefined;

    prisma.botLog
      .create({
        data: {
          botRunId,
          jobRoleId: (context?.jobRoleId as string) ?? null,
          jobId: jobId ?? null,
          applicationId: applicationId ?? null,
          level,
          message,
          context: context ? (context as Prisma.InputJsonValue) : undefined,
        },
      })
      .catch((err) => processLogger.error({ err, botRunId, message }, "Failed to persist BotLog row"));

    const envelope: RealtimeEnvelope<typeof REALTIME_EVENTS.BOT_LOG> = {
      event: REALTIME_EVENTS.BOT_LOG,
      userId,
      payload: { botRunId, level, message, createdAt: new Date().toISOString(), jobId, applicationId, context },
    };
    redisPublisher.publish(realtimeChannelFor(userId), JSON.stringify(envelope)).catch((err) => {
      processLogger.error({ err }, "Failed to publish realtime bot:log event");
    });

    processLogger[level === "debug" ? "debug" : level === "warn" ? "warn" : level === "error" ? "error" : "info"](
      { botRunId, ...context },
      message,
    );
  }

  return {
    log: emit,
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
  };
}
