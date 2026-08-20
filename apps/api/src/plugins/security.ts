import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "../lib/env.js";

export default fp(async function securityPlugin(fastify: FastifyInstance) {
  await fastify.register(helmet, { global: true });

  await fastify.register(cors, {
    origin: env.API_CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });

  await fastify.register(cookie);

  // Global baseline rate limit; auth routes additionally get a stricter
  // per-route limit registered alongside their handlers (see auth.routes.ts).
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
});
