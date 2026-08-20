import type { ApplicationStatus, BotStatus, FailureReason, LogLevel, PortalCode, SkipReason } from "./enums.js";

/**
 * Realtime event contract shared by apps/api (emitter) and apps/web
 * (consumer). The worker never talks to Socket.IO directly — it publishes
 * these same shapes to Redis pub/sub on channel `realtime:{userId}`, and
 * apps/api's subscriber re-emits them verbatim to the user's Socket.IO room.
 * Keeping one shared type per event name means the bridge can't drift from
 * what the frontend expects.
 */

export interface BotStatusEvent {
  status: BotStatus;
  botRunId: string | null;
  currentPlatform: PortalCode | null;
  currentRoleId: string | null;
  currentRoleTitle: string | null;
  currentJobTitle: string | null;
  progress: {
    applied: number;
    skipped: number;
    failed: number;
    total: number;
  };
}

export interface BotLogEvent {
  botRunId: string;
  level: LogLevel;
  message: string;
  createdAt: string;
  jobId?: string;
  applicationId?: string;
  context?: Record<string, unknown>;
}

export interface BotApplicationEvent {
  botRunId: string;
  applicationId: string;
  jobTitle: string;
  company: string;
  platform: PortalCode;
  status: ApplicationStatus;
  platformMatchScore: number | null;
  skipReason: SkipReason | null;
  failureReason: FailureReason | null;
}

export interface BotRunCompletedEvent {
  botRunId: string;
  status: Extract<BotStatus, "completed" | "failed" | "stopped">;
  summary: {
    totalApplied: number;
    totalSkipped: number;
    totalFailed: number;
    startedAt: string;
    completedAt: string;
  };
}

export const REALTIME_EVENTS = {
  BOT_STATUS: "bot:status",
  BOT_LOG: "bot:log",
  BOT_APPLICATION: "bot:application",
  BOT_RUN_COMPLETED: "bot:run-completed",
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export type RealtimeEventPayloadMap = {
  [REALTIME_EVENTS.BOT_STATUS]: BotStatusEvent;
  [REALTIME_EVENTS.BOT_LOG]: BotLogEvent;
  [REALTIME_EVENTS.BOT_APPLICATION]: BotApplicationEvent;
  [REALTIME_EVENTS.BOT_RUN_COMPLETED]: BotRunCompletedEvent;
};

/** Envelope published by the worker onto `realtime:{userId}` and relayed by the API. */
export interface RealtimeEnvelope<TName extends RealtimeEventName = RealtimeEventName> {
  event: TName;
  userId: string;
  payload: RealtimeEventPayloadMap[TName];
}

export function realtimeChannelFor(userId: string): string {
  return `realtime:${userId}`;
}

export function botControlChannelFor(userId: string): string {
  return `bot-control:${userId}`;
}
