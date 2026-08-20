import { prisma } from "@job-app/db";
import type { JobPreferenceInput, JobRoleInput } from "@job-app/shared";
import { HttpError } from "../lib/http-error.js";

const roleInclude = {
  resumeLinks: { include: { resume: true } },
  preference: { include: { jobRole: false } },
  locations: true,
} as const;

export async function listRoles(userId: string) {
  const roles = await prisma.jobRole.findMany({
    where: { userId },
    include: roleInclude,
    orderBy: { createdAt: "asc" },
  });
  return roles;
}

export async function createRole(userId: string, input: JobRoleInput) {
  return prisma.jobRole.create({
    data: {
      userId,
      title: input.title,
      applicationLimit: input.applicationLimit,
      isActive: input.isActive ?? true,
      // A role is unusable by the bot until preferences are configured, but we
      // seed sensible US-only defaults so it's not in a broken half-state —
      // the Preferences page is just editing this row, not creating it blind.
      preference: {
        create: {
          datePosted: "last_3_days",
          employmentType: "both",
          workArrangement: "any",
          matchThresholdPercent: 70,
          skipCoverLetter: true,
          skipOptionalMessage: true,
          skipPortfolio: true,
          fillLinkedIn: false,
        },
      },
    },
    include: roleInclude,
  });
}

async function requireOwnedRole(userId: string, roleId: string) {
  const role = await prisma.jobRole.findFirst({ where: { id: roleId, userId } });
  if (!role) throw HttpError.notFound("Job role not found");
  return role;
}

export async function updateRole(userId: string, roleId: string, input: JobRoleInput) {
  await requireOwnedRole(userId, roleId);
  return prisma.jobRole.update({
    where: { id: roleId },
    data: { title: input.title, applicationLimit: input.applicationLimit, isActive: input.isActive ?? true },
    include: roleInclude,
  });
}

export async function deleteRole(userId: string, roleId: string) {
  await requireOwnedRole(userId, roleId);
  await prisma.jobRole.delete({ where: { id: roleId } });
}

export async function assignResumeToRole(
  userId: string,
  roleId: string,
  resumeId: string,
  isPrimary: boolean,
) {
  await requireOwnedRole(userId, roleId);
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId, deletedAt: null } });
  if (!resume) throw HttpError.notFound("Resume not found");

  await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      // Enforce "at most one isPrimary=true per jobRoleId" at the app layer —
      // defense-in-depth alongside the partial unique index added via raw SQL
      // in the init migration.
      await tx.resumeJobRole.updateMany({ where: { jobRoleId: roleId }, data: { isPrimary: false } });
    }
    await tx.resumeJobRole.upsert({
      where: { resumeId_jobRoleId: { resumeId, jobRoleId: roleId } },
      update: { isPrimary },
      create: { resumeId, jobRoleId: roleId, isPrimary },
    });
  });

  return prisma.jobRole.findUnique({ where: { id: roleId }, include: roleInclude });
}

export async function unassignResumeFromRole(userId: string, roleId: string, resumeId: string) {
  await requireOwnedRole(userId, roleId);
  await prisma.resumeJobRole.deleteMany({ where: { jobRoleId: roleId, resumeId } });
}

export async function updatePreference(userId: string, roleId: string, input: JobPreferenceInput) {
  await requireOwnedRole(userId, roleId);

  await prisma.$transaction(async (tx) => {
    await tx.jobPreference.upsert({
      where: { jobRoleId: roleId },
      update: {
        datePosted: input.datePosted,
        employmentType: input.employmentType,
        workArrangement: input.workArrangement,
        matchThresholdPercent: input.matchThresholdPercent,
        skipCoverLetter: input.skipCoverLetter,
        skipOptionalMessage: input.skipOptionalMessage,
        skipPortfolio: input.skipPortfolio,
        fillLinkedIn: input.fillLinkedIn,
      },
      create: {
        jobRoleId: roleId,
        datePosted: input.datePosted,
        employmentType: input.employmentType,
        workArrangement: input.workArrangement,
        matchThresholdPercent: input.matchThresholdPercent,
        skipCoverLetter: input.skipCoverLetter,
        skipOptionalMessage: input.skipOptionalMessage,
        skipPortfolio: input.skipPortfolio,
        fillLinkedIn: input.fillLinkedIn,
      },
    });

    await tx.jobRoleLocation.deleteMany({ where: { jobRoleId: roleId } });
    await tx.jobRoleLocation.createMany({
      data: input.locations.map((loc) => ({
        jobRoleId: roleId,
        locationType: loc.locationType,
        city: loc.city ?? null,
        state: loc.state ?? null,
      })),
    });
  });

  return prisma.jobRole.findUnique({ where: { id: roleId }, include: roleInclude });
}

/** Used by the bot-start flow to fail fast on roles that aren't actually runnable yet. */
export async function assertRoleIsRunnable(roleId: string) {
  const role = await prisma.jobRole.findUnique({
    where: { id: roleId },
    include: { preference: true, locations: true, resumeLinks: true },
  });
  if (!role) throw HttpError.notFound("Job role not found");
  if (!role.preference) {
    throw HttpError.badRequest(`Role "${role.title}" has no search preferences configured yet`);
  }
  if (role.locations.length === 0) {
    throw HttpError.badRequest(`Role "${role.title}" has no locations configured yet`);
  }
  if (role.resumeLinks.length === 0) {
    throw HttpError.badRequest(`Role "${role.title}" has no resume assigned yet`);
  }
  return role;
}
