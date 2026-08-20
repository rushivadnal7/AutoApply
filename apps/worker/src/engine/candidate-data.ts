import { prisma } from "@job-app/db";
import type { CandidateProfileData } from "@job-app/shared";

export async function loadCandidateProfileData(userId: string): Promise<CandidateProfileData> {
  const [user, profile] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.candidateProfile.findUnique({ where: { userId } }),
  ]);

  if (!profile) {
    throw new Error(`Candidate profile is missing for user ${userId} — bot-start should have required one`);
  }

  return {
    userId,
    email: user.email,
    fullName: profile.fullName,
    phone: profile.phone,
    city: profile.city,
    state: profile.state,
    workAuthorization: profile.workAuthorization,
    linkedinUrl: profile.linkedinUrl,
    portfolioUrl: profile.portfolioUrl,
  };
}
