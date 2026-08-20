import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import { HttpError } from "../lib/http-error.js";
import { env, isProduction } from "../lib/env.js";
import { loginUser, logoutSession, refreshSession, registerUser } from "../services/auth.service.js";

const REFRESH_COOKIE_NAME = "refresh_token";

function setRefreshCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/auth",
    domain: env.COOKIE_DOMAIN,
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Defense-in-depth CSRF check for the two cookie-authenticated endpoints
 * (refresh/logout aren't behind the Bearer auth-guard). SameSite=Strict
 * already blocks the cookie from being sent cross-site in modern browsers;
 * this custom header requirement additionally ensures the request came from
 * our own frontend's fetch/XHR code, not a plain cross-site form POST.
 */
function assertSameOriginFetch(request: import("fastify").FastifyRequest) {
  if (request.headers["x-requested-with"] !== "fetch") {
    throw HttpError.forbidden("Missing same-origin request header");
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  const strictAuthLimit = { max: 10, timeWindow: "1 minute" };

  fastify.post(
    "/auth/register",
    { config: { rateLimit: strictAuthLimit } },
    async (request, reply) => {
      const body = parseOrThrow(registerSchema, request.body);
      const result = await registerUser(body.email, body.password, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      });
      setRefreshCookie(reply, result.refreshToken);
      return reply.status(201).send({ accessToken: result.accessToken, user: { id: result.userId, email: result.email } });
    },
  );

  fastify.post("/auth/login", { config: { rateLimit: strictAuthLimit } }, async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    const result = await loginUser(body.email, body.password, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    });
    setRefreshCookie(reply, result.refreshToken);
    return reply.send({ accessToken: result.accessToken, user: { id: result.userId, email: result.email } });
  });

  fastify.post("/auth/refresh", { config: { rateLimit: strictAuthLimit } }, async (request, reply) => {
    assertSameOriginFetch(request);
    const rawToken = request.cookies[REFRESH_COOKIE_NAME];
    if (!rawToken) throw HttpError.unauthorized("No refresh session");
    const result = await refreshSession(rawToken, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
    });
    setRefreshCookie(reply, result.refreshToken);
    return reply.send({ accessToken: result.accessToken, user: { id: result.userId, email: result.email } });
  });

  fastify.post("/auth/logout", async (request, reply) => {
    assertSameOriginFetch(request);
    const rawToken = request.cookies[REFRESH_COOKIE_NAME];
    await logoutSession(rawToken);
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth", domain: env.COOKIE_DOMAIN });
    return reply.status(204).send();
  });
}
