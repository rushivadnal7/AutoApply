import { prisma, Prisma, type ApplicationStatus } from "@job-app/db";
import { APPLICATION_STATUS_VALUES, type ApplicationHistoryQuery } from "@job-app/shared";

function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUS_VALUES as readonly string[]).includes(value);
}

export async function listApplications(userId: string, query: ApplicationHistoryQuery) {
  const where: Prisma.ApplicationWhereInput = {
    userId,
    ...(query.jobRoleId ? { jobRoleId: query.jobRoleId } : {}),
    ...(query.status && isApplicationStatus(query.status) ? { status: query.status } : {}),
    ...(query.minMatchScore !== undefined ? { platformMatchScore: { gte: query.minMatchScore } } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        }
      : {}),
    job: {
      ...(query.jobTitle ? { title: { contains: query.jobTitle, mode: "insensitive" } } : {}),
      ...(query.company ? { company: { contains: query.company, mode: "insensitive" } } : {}),
      ...(query.location ? { location: { contains: query.location, mode: "insensitive" } } : {}),
      ...(query.platform ? { jobPortal: { code: query.platform } } : {}),
    },
  };

  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        job: { include: { jobPortal: true } },
        jobRole: { select: { id: true, title: true } },
        resume: { select: { id: true, fileName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.application.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function listBotRuns(userId: string) {
  return prisma.botRun.findMany({
    where: { userId },
    include: {
      roles: { include: { jobRole: { select: { title: true } } } },
      portals: { include: { jobPortal: { select: { code: true, name: true } } } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
}

export async function getBotRunLogs(userId: string, botRunId: string) {
  const run = await prisma.botRun.findFirst({ where: { id: botRunId, userId } });
  if (!run) return null;
  return prisma.botLog.findMany({
    where: { botRunId },
    orderBy: { createdAt: "asc" },
  });
}
