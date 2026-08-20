import type { FastifyInstance } from "fastify";
import { applicationHistoryQuerySchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import { HttpError } from "../lib/http-error.js";
import { getBotRunLogs, listApplications, listBotRuns } from "../services/application.service.js";

export default async function applicationRoutes(fastify: FastifyInstance) {
  fastify.get("/applications", async (request) => {
    const query = parseOrThrow(applicationHistoryQuerySchema, request.query);
    return listApplications(request.userId, query);
  });

  fastify.get("/runs", async (request) => {
    const runs = await listBotRuns(request.userId);
    return { runs };
  });

  fastify.get("/runs/:id/logs", async (request) => {
    const { id } = request.params as { id: string };
    const logs = await getBotRunLogs(request.userId, id);
    if (logs === null) throw HttpError.notFound("Bot run not found");
    return { logs };
  });
}
