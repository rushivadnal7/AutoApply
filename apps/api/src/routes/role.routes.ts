import type { FastifyInstance } from "fastify";
import { jobPreferenceSchema, jobRoleSchema, resumeAssignmentSchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import {
  assignResumeToRole,
  createRole,
  deleteRole,
  listRoles,
  unassignResumeFromRole,
  updatePreference,
  updateRole,
} from "../services/role.service.js";

export default async function roleRoutes(fastify: FastifyInstance) {
  fastify.get("/roles", async (request) => {
    const roles = await listRoles(request.userId);
    return { roles };
  });

  fastify.post("/roles", async (request, reply) => {
    const body = parseOrThrow(jobRoleSchema, request.body);
    const role = await createRole(request.userId, body);
    return reply.status(201).send(role);
  });

  fastify.put("/roles/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseOrThrow(jobRoleSchema, request.body);
    return updateRole(request.userId, id, body);
  });

  fastify.delete("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteRole(request.userId, id);
    return reply.status(204).send();
  });

  fastify.post("/roles/:id/resumes", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseOrThrow(resumeAssignmentSchema, request.body);
    return assignResumeToRole(request.userId, id, body.resumeId, body.isPrimary);
  });

  fastify.delete("/roles/:id/resumes/:resumeId", async (request, reply) => {
    const { id, resumeId } = request.params as { id: string; resumeId: string };
    await unassignResumeFromRole(request.userId, id, resumeId);
    return reply.status(204).send();
  });

  fastify.put("/roles/:id/preferences", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseOrThrow(jobPreferenceSchema, request.body);
    return updatePreference(request.userId, id, body);
  });
}
