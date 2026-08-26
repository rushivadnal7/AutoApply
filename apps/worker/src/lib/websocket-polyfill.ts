import WebSocket from "ws";

/**
 * See the identical file in apps/api for the full explanation: Node 20
 * lacks the native `WebSocket` global that @supabase/supabase-js's Realtime
 * subsystem expects (even for pure Storage usage), causing `createClient()`
 * to throw immediately. Must be imported for its side effect before the
 * first `createClient()` call — imported first thing in main.ts.
 */
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
