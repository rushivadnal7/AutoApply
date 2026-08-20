import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./token-store";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io(SOCKET_URL, {
    auth: { token: getAccessToken() },
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
