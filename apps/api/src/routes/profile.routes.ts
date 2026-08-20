import type { FastifyInstance } from "fastify";
import { candidateProfileSchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import { getProfile, upsertProfile } from "../services/profile.service.js";

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.get("/profile", async (request) => {
    const profile = await getProfile(request.userId);
    return { profile };
  });

  fastify.put("/profile", async (request) => {
    const body = parseOrThrow(candidateProfileSchema, request.body);
    const profile = await upsertProfile(request.userId, body);
    return { profile };
  });
}
