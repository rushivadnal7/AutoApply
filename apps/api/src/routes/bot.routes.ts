import type { FastifyInstance } from "fastify";
import { botControlSchema, botPacingSchema, botStartSchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import { getBotStatus, sendBotControl, startBot, updatePacingDelay } from "../services/bot.service.js";

export default async function botRoutes(fastify: FastifyInstance) {
  fastify.get("/bot", async (request) => {
    const bot = await getBotStatus(request.userId);
    return { bot };
  });

  fastify.post("/bot/start", async (request, reply) => {
    const body = parseOrThrow(botStartSchema, request.body);
    const run = await startBot(request.userId, body);
    return reply.status(202).send({ botRunId: run.id, status: run.status });
  });

  fastify.post("/bot/control", async (request) => {
    const body = parseOrThrow(botControlSchema, request.body);
    return sendBotControl(request.userId, body.action);
  });

  fastify.put("/bot/pacing", async (request) => {
    const body = parseOrThrow(botPacingSchema, request.body);
    const bot = await updatePacingDelay(request.userId, body.pacingDelaySeconds);
    return { bot };
  });
}
