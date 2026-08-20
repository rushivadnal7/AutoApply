import type { FastifyInstance } from "fastify";
import { HttpError } from "../lib/http-error.js";
import { MAX_RESUME_SIZE_BYTES } from "../lib/file-validation.js";
import {
  deleteResume,
  getResumeDownload,
  listResumes,
  setDefaultResume,
  uploadResume,
} from "../services/resume.service.js";

export default async function resumeRoutes(fastify: FastifyInstance) {
  fastify.get("/resumes", async (request) => {
    const resumes = await listResumes(request.userId);
    return { resumes };
  });

  fastify.post("/resumes", async (request) => {
    const file = await request.file({ limits: { fileSize: MAX_RESUME_SIZE_BYTES } });
    if (!file) throw HttpError.badRequest("No file provided (expected multipart field 'file')");

    const buffer = await file.toBuffer();
    const resume = await uploadResume(request.userId, file.filename, buffer);
    return resume;
  });

  fastify.get("/resumes/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getResumeDownload(request.userId, id);
    if (result.kind === "redirect") {
      return reply.redirect(result.url);
    }
    reply.header("Content-Type", result.mimeType);
    reply.header("Content-Disposition", `attachment; filename="${result.fileName}"`);
    return reply.send(result.buffer);
  });

  fastify.post("/resumes/:id/default", async (request) => {
    const { id } = request.params as { id: string };
    await setDefaultResume(request.userId, id);
    return { success: true };
  });

  fastify.delete("/resumes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteResume(request.userId, id);
    return reply.status(204).send();
  });
}
