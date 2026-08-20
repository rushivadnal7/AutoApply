import { randomUUID } from "node:crypto";
import { prisma } from "@job-app/db";
import { HttpError } from "../lib/http-error.js";
import { assertValidResumeFile } from "../lib/file-validation.js";
import { deleteResumeFile, getResumeSignedUrl, readResumeFileLocally, saveResumeFile } from "../lib/storage.js";

export async function listResumes(userId: string) {
  return prisma.resume.findMany({
    where: { userId, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function uploadResume(userId: string, fileName: string, buffer: Buffer) {
  const { mimeType } = assertValidResumeFile(buffer);

  const resumeId = randomUUID();
  const { storagePath } = await saveResumeFile(userId, resumeId, fileName, buffer, mimeType);

  const existingCount = await prisma.resume.count({ where: { userId, deletedAt: null } });

  return prisma.resume.create({
    data: {
      id: resumeId,
      userId,
      fileName,
      storagePath,
      fileSizeBytes: buffer.length,
      mimeType,
      isDefault: existingCount === 0,
    },
  });
}

async function requireOwnedResume(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId, deletedAt: null } });
  if (!resume) throw HttpError.notFound("Resume not found");
  return resume;
}

export async function getResumeDownload(userId: string, resumeId: string) {
  const resume = await requireOwnedResume(userId, resumeId);
  const signedUrl = await getResumeSignedUrl(resume.storagePath);
  if (signedUrl) return { kind: "redirect" as const, url: signedUrl };

  const buffer = await readResumeFileLocally(resume.storagePath);
  return { kind: "stream" as const, buffer, fileName: resume.fileName, mimeType: resume.mimeType };
}

export async function setDefaultResume(userId: string, resumeId: string) {
  await requireOwnedResume(userId, resumeId);
  await prisma.$transaction([
    prisma.resume.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.resume.update({ where: { id: resumeId }, data: { isDefault: true } }),
  ]);
}

export async function deleteResume(userId: string, resumeId: string) {
  const resume = await requireOwnedResume(userId, resumeId);

  const activeRoleLinks = await prisma.resumeJobRole.count({ where: { resumeId } });
  if (activeRoleLinks > 0) {
    throw HttpError.conflict(
      "This resume is assigned to one or more job roles. Unassign it before deleting.",
      { assignedRoleCount: activeRoleLinks },
    );
  }

  // Soft delete: past Applications reference this resume row for history,
  // so we never hard-delete a resume that may have already been used.
  await prisma.resume.update({ where: { id: resume.id }, data: { deletedAt: new Date() } });
  await deleteResumeFile(resume.storagePath);
}
