import type { FastifyInstance } from "fastify";
import { portalAccountConnectSchema } from "@job-app/shared";
import { parseOrThrow } from "../lib/validate.js";
import { connectPortalAccount, disconnectPortalAccount, listPortalAccounts, listPortals } from "../services/portal.service.js";

export default async function portalRoutes(fastify: FastifyInstance) {
  fastify.get("/portals", async () => {
    const portals = await listPortals();
    return { portals };
  });

  fastify.get("/portals/accounts", async (request) => {
    const accounts = await listPortalAccounts(request.userId);
    return { accounts };
  });

  fastify.post("/portals/accounts", async (request, reply) => {
    const body = parseOrThrow(portalAccountConnectSchema, request.body);
    const account = await connectPortalAccount(request.userId, body);
    return reply.status(201).send(account);
  });

  fastify.delete("/portals/accounts/:portalCode", async (request, reply) => {
    const { portalCode } = request.params as { portalCode: string };
    await disconnectPortalAccount(request.userId, portalCode);
    return reply.status(204).send();
  });
}
