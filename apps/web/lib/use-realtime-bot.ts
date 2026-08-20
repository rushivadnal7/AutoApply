"use client";

import { useEffect, useState } from "react";
import type { BotApplicationEvent, BotLogEvent, BotStatusEvent } from "@job-app/shared";
import { REALTIME_EVENTS } from "@job-app/shared";
import { connectSocket } from "./socket-client";

/**
 * Live bot status + a rolling log tail, fed by the Socket.IO events the API
 * bridges from the worker's Redis pub/sub publications (see
 * SYSTEM_DESIGN.md §9). Pages combine this with an initial REST fetch
 * (React Query) for the pre-connection state; this hook only carries what
 * arrives after the socket connects.
 */
export function useRealtimeBot() {
  const [status, setStatus] = useState<BotStatusEvent | null>(null);
  const [logs, setLogs] = useState<BotLogEvent[]>([]);
  const [lastApplication, setLastApplication] = useState<BotApplicationEvent | null>(null);

  useEffect(() => {
    const socket = connectSocket();

    const onStatus = (payload: BotStatusEvent) => setStatus(payload);
    const onLog = (payload: BotLogEvent) => setLogs((prev) => [...prev.slice(-199), payload]);
    const onApplication = (payload: BotApplicationEvent) => setLastApplication(payload);

    socket.on(REALTIME_EVENTS.BOT_STATUS, onStatus);
    socket.on(REALTIME_EVENTS.BOT_LOG, onLog);
    socket.on(REALTIME_EVENTS.BOT_APPLICATION, onApplication);

    return () => {
      socket.off(REALTIME_EVENTS.BOT_STATUS, onStatus);
      socket.off(REALTIME_EVENTS.BOT_LOG, onLog);
      socket.off(REALTIME_EVENTS.BOT_APPLICATION, onApplication);
    };
  }, []);

  return { status, logs, lastApplication };
}
