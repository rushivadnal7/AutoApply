import type { Redis as IORedis } from "ioredis";
import {
  REALTIME_EVENTS,
  realtimeChannelFor,
  type BotApplicationEvent,
  type BotRunCompletedEvent,
  type BotStatusEvent,
  type RealtimeEnvelope,
} from "@job-app/shared";

export function publishBotStatus(redis: IORedis, userId: string, payload: BotStatusEvent): void {
  const envelope: RealtimeEnvelope<typeof REALTIME_EVENTS.BOT_STATUS> = {
    event: REALTIME_EVENTS.BOT_STATUS,
    userId,
    payload,
  };
  void redis.publish(realtimeChannelFor(userId), JSON.stringify(envelope));
}

export function publishBotApplication(redis: IORedis, userId: string, payload: BotApplicationEvent): void {
  const envelope: RealtimeEnvelope<typeof REALTIME_EVENTS.BOT_APPLICATION> = {
    event: REALTIME_EVENTS.BOT_APPLICATION,
    userId,
    payload,
  };
  void redis.publish(realtimeChannelFor(userId), JSON.stringify(envelope));
}

export function publishBotRunCompleted(redis: IORedis, userId: string, payload: BotRunCompletedEvent): void {
  const envelope: RealtimeEnvelope<typeof REALTIME_EVENTS.BOT_RUN_COMPLETED> = {
    event: REALTIME_EVENTS.BOT_RUN_COMPLETED,
    userId,
    payload,
  };
  void redis.publish(realtimeChannelFor(userId), JSON.stringify(envelope));
}
