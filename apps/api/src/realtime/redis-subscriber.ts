import type { Server as SocketIOServer } from "socket.io";
import type { Logger } from "@job-app/logger";
import type { RealtimeEnvelope } from "@job-app/shared";
import { createRedisConnection } from "../lib/redis.js";
import { userRoom } from "./socket-server.js";

/**
 * Bridges worker-published realtime events to this API instance's Socket.IO
 * server. The worker is a separate deployable and cannot emit to Socket.IO
 * directly, so it publishes the same event envelope to Redis pub/sub
 * (`realtime:{userId}`) and this subscriber re-emits it verbatim.
 */
export function startRealtimeBridge(io: SocketIOServer, logger: Logger): () => Promise<void> {
  const subscriber = createRedisConnection("realtime-subscriber");

  subscriber.psubscribe("realtime:*", (err: Error | null | undefined) => {
    if (err) logger.error({ err }, "Failed to subscribe to realtime:* channel");
  });

  subscriber.on("pmessage", (_pattern: string, _channel: string, message: string) => {
    try {
      const envelope = JSON.parse(message) as RealtimeEnvelope;
      io.to(userRoom(envelope.userId)).emit(envelope.event, envelope.payload);
    } catch (err) {
      logger.error({ err, message }, "Failed to parse realtime envelope");
    }
  });

  return async () => {
    await subscriber.quit();
  };
}
