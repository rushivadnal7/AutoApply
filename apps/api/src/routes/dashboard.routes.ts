import type { FastifyInstance } from "fastify";
import { getDashboardSummary } from "../services/dashboard.service.js";

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get("/dashboard/summary", async (request) => {
    return getDashboardSummary(request.userId);
  });
}
