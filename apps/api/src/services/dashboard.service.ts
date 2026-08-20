import { prisma } from "@job-app/db";

export async function getDashboardSummary(userId: string) {
  const [total, applied, skipped, failed, activeRuns, matchScoreAgg, roles] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: "applied" } }),
    prisma.application.count({ where: { userId, status: "skipped" } }),
    prisma.application.count({ where: { userId, status: "failed" } }),
    prisma.botRun.count({
      where: {
        userId,
        status: { in: ["starting", "logging_in", "searching", "analyzing", "applying", "waiting", "paused", "resuming"] },
      },
    }),
    prisma.application.aggregate({
      where: { userId, platformMatchScore: { not: null } },
      _avg: { platformMatchScore: true },
    }),
    prisma.jobRole.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        applicationLimit: true,
        applications: { select: { status: true } },
      },
    }),
  ]);

  // Per-platform stats: join through Job -> JobPortal since Application has no direct portal FK.
  const applications = await prisma.application.findMany({
    where: { userId },
    select: { job: { select: { jobPortal: { select: { code: true, name: true } } } } },
  });
  const platformCounts = new Map<string, { code: string; name: string; count: number }>();
  for (const app of applications) {
    const key = app.job.jobPortal.code;
    const existing = platformCounts.get(key);
    if (existing) existing.count += 1;
    else platformCounts.set(key, { code: key, name: app.job.jobPortal.name, count: 1 });
  }

  const roleProgress = roles.map((r) => ({
    id: r.id,
    title: r.title,
    applicationLimit: r.applicationLimit,
    applied: r.applications.filter((a) => a.status === "applied").length,
    skipped: r.applications.filter((a) => a.status === "skipped").length,
    failed: r.applications.filter((a) => a.status === "failed").length,
  }));

  return {
    totals: { total, applied, skipped, failed, activeRuns },
    averageMatchScore: matchScoreAgg._avg.platformMatchScore ?? null,
    platformStats: Array.from(platformCounts.values()),
    roleProgress,
  };
}
