import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../lib/jwt.js";
import { HttpError } from "../lib/http-error.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * Global auth boundary: every route requires a valid access token UNLESS its
 * path is explicitly allow-listed below. This is deliberately opt-out rather
 * than opt-in — a new route is unauthenticated only if someone remembers to
 * add it here, which fails closed instead of open.
 */
const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: "POST", path: "/auth/register" },
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/refresh" },
  { method: "POST", path: "/auth/logout" },
  { method: "GET", path: "/health" },
];

function isPublicRoute(request: FastifyRequest): boolean {
  return PUBLIC_ROUTES.some((r) => r.method === request.method && request.url.split("?")[0] === r.path);
}

export default fp(async function authGuardPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("userId", "");

  fastify.addHook("preHandler", async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublicRoute(request)) return;

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw HttpError.unauthorized("Missing or malformed Authorization header");
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = verifyAccessToken(token);
      request.userId = payload.sub;
    } catch {
      throw HttpError.unauthorized("Invalid or expired access token");
    }
  });
});
