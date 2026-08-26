import WebSocket from "ws";

/**
 * @supabase/supabase-js eagerly initializes its Realtime subsystem inside
 * `createClient()` — even when the client is only ever used for Storage
 * (our case: resume uploads/downloads). That subsystem expects a native
 * `WebSocket` global, which is only stable as of Node 22; on Node 20 (what
 * our Docker image runs) `createClient()` throws immediately with
 * "Node.js detected but native WebSocket not found." This must be imported
 * — for its side effect — before the first `createClient()` call anywhere
 * in the process, so it's imported first thing in server.ts.
 */
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
