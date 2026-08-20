import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { Logger } from "@job-app/logger";
import { verifyAccessToken } from "../lib/jwt.js";
import { env } from "../lib/env.js";

/**
 * Per-user room broadcasting. At MVP scale there's at most one active
 * BotRun per user, so a per-user room is sufficient granularity — every
 * event payload still carries `botRunId` so the frontend can associate it,
 * and per-run rooms are a documented future extension if concurrent runs
 * are ever allowed (see SYSTEM_DESIGN.md §9).
 */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function createSocketServer(httpServer: HttpServer, logger: Logger): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.API_CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    logger.debug({ userId, socketId: socket.id }, "Socket connected");

    socket.on("disconnect", () => {
      logger.debug({ userId, socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}
