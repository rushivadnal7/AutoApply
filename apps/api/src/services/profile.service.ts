import { prisma } from "@job-app/db";
import type { CandidateProfileInput } from "@job-app/shared";

export async function getProfile(userId: string) {
  return prisma.candidateProfile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, input: CandidateProfileInput) {
  const data = {
    fullName: input.fullName,
    phone: input.phone,
    city: input.city || null,
    state: input.state || null,
    workAuthorization: input.workAuthorization ?? null,
    linkedinUrl: input.linkedinUrl || null,
    portfolioUrl: input.portfolioUrl || null,
  };

  return prisma.candidateProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}
