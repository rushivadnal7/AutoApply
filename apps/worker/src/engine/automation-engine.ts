import type { Redis as IORedis } from "ioredis";
import { prisma } from "@job-app/db";
import type { Logger as PinoLogger } from "@job-app/logger";
import type { AdapterRunContext, BotStatus, OptionalFieldPreferences, PortalCode } from "@job-app/shared";
import { createAdapter } from "../adapters/registry.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { loadResumeFile } from "../lib/resume-loader.js";
import { createBotLogger } from "../lib/bot-logger.js";
import { publishBotApplication, publishBotRunCompleted, publishBotStatus } from "../lib/realtime-publisher.js";
import { env } from "../lib/env.js";
import { BrowserSessionManager } from "./browser-session.js";
import { ControlSignal } from "./control-signal.js";
import { abortableSleep } from "./pacing.js";
import { buildSearchCriteria } from "./search-criteria.js";
import { loadCandidateProfileData } from "./candidate-data.js";
import { processJob } from "./process-job.js";

async function loadBotRun(botRunId: string) {
  return prisma.botRun.findUniqueOrThrow({
    where: { id: botRunId },
    include: {
      roles: {
        include: {
          jobRole: {
            include: {
              preference: true,
              locations: true,
              resumeLinks: { include: { resume: true } },
            },
          },
        },
      },
      portals: { include: { jobPortal: true, portalAccount: true } },
    },
  });
}

type BotRunWithRelations = Awaited<ReturnType<typeof loadBotRun>>;

export async function runBotRun(botRunId: string, redisPublisher: IORedis, processLogger: PinoLogger): Promise<void> {
  const botRun = await loadBotRun(botRunId);
  const { userId } = botRun;

  const botLogger = createBotLogger({ botRunId, userId, redisPublisher, processLogger });
  const controlSignal = new ControlSignal(userId);
  await controlSignal.start();

  const browserSessions = new BrowserSessionManager();
  const authenticatedPortals = new Set<PortalCode>();

  let candidate;
  try {
    candidate = await loadCandidateProfileData(userId);
  } catch (err) {
    await failRun(botRunId, userId, redisPublisher, botLogger, `Candidate profile unavailable: ${(err as Error).message}`);
    await controlSignal.dispose();
    return;
  }

  const counters = { applied: 0, skipped: 0, failed: 0 };
  const totalTarget = botRun.roles.reduce((sum, r) => sum + r.applicationLimitSnapshot, 0);
  // Local mirror of BotRunRole.appliedCount, seeded from the DB and kept in
  // sync as we go — avoids a DB round-trip on every single job just to check
  // "has this role hit its limit yet."
  const roleAppliedCounts = new Map<string, number>(botRun.roles.map((r) => [r.id, r.appliedCount]));

  async function setStatus(
    status: BotStatus,
    extra?: { currentPlatform?: PortalCode | null; currentJobRoleId?: string | null; currentJobTitle?: string | null },
  ): Promise<void> {
    await prisma.bot.update({
      where: { userId },
      data: {
        status,
        currentBotRunId: botRunId,
        progressApplied: counters.applied,
        progressSkipped: counters.skipped,
        progressFailed: counters.failed,
        ...(extra?.currentPlatform !== undefined ? { currentPlatform: extra.currentPlatform } : {}),
        ...(extra?.currentJobRoleId !== undefined ? { currentJobRoleId: extra.currentJobRoleId } : {}),
        ...(extra?.currentJobTitle !== undefined ? { currentJobTitle: extra.currentJobTitle } : {}),
      },
    });
    await prisma.botRun.update({ where: { id: botRunId }, data: { status } });
    publishBotStatus(redisPublisher, userId, {
      status,
      botRunId,
      currentPlatform: extra?.currentPlatform ?? null,
      currentRoleId: extra?.currentJobRoleId ?? null,
      currentRoleTitle: null,
      currentJobTitle: extra?.currentJobTitle ?? null,
      progress: { ...counters, total: totalTarget },
    });
  }

  async function authenticatePortal(botRunPortal: BotRunWithRelations["portals"][number]): Promise<boolean> {
    const portalCode = botRunPortal.jobPortal.code;
    const account = botRunPortal.portalAccount;

    if (!account.encryptedPassword) {
      botLogger.error(`No credentials stored for ${portalCode}`, { portalCode });
      return false;
    }

    const password = decryptSecret({
      ciphertext: account.encryptedPassword,
      iv: account.encryptionIv,
      authTag: account.encryptionAuthTag,
    });

    const cachedSessionState =
      account.sessionStateEncrypted && account.sessionStateIv && account.sessionStateAuthTag
        ? JSON.parse(
            decryptSecret({
              ciphertext: account.sessionStateEncrypted,
              iv: account.sessionStateIv,
              authTag: account.sessionStateAuthTag,
            }),
          )
        : undefined;

    const { page, browserContext } = await browserSessions.getOrCreateContext(portalCode, cachedSessionState);
    const adapter = createAdapter(portalCode);
    const ctx: AdapterRunContext = { page, browserContext, botRunId, userId, logger: botLogger, signal: controlSignal.signal };

    botLogger.info(`Connected to ${botRunPortal.jobPortal.name}`, { portalCode });
    const result = await adapter.authenticate({ email: account.accountEmail, password, cachedSessionState }, ctx);

    if (!result.success) {
      botLogger.error(`Login to ${botRunPortal.jobPortal.name} failed: ${result.reason ?? "unknown reason"}`, { portalCode });
      await prisma.portalAccount.update({ where: { id: account.id }, data: { status: "reauth_required" } }).catch(() => undefined);
      return false;
    }

    if (result.sessionState) {
      const encrypted = encryptSecret(JSON.stringify(result.sessionState));
      await prisma.portalAccount
        .update({
          where: { id: account.id },
          data: {
            sessionStateEncrypted: encrypted.ciphertext,
            sessionStateIv: encrypted.iv,
            sessionStateAuthTag: encrypted.authTag,
            sessionStateKeyVersion: 1,
            lastVerifiedAt: new Date(),
            status: "connected",
          },
        })
        .catch(() => undefined);
    }

    authenticatedPortals.add(portalCode);
    return true;
  }

  try {
    await setStatus("starting");

    roleLoop: for (const botRunRole of botRun.roles) {
      if (controlSignal.isStopped) break;
      const role = botRunRole.jobRole;

      const primaryResumeLink = role.resumeLinks.find((l) => l.isPrimary) ?? role.resumeLinks[0];
      const resume = primaryResumeLink?.resume ?? null;
      const optionalPrefs: OptionalFieldPreferences | null = role.preference
        ? {
            skipCoverLetter: role.preference.skipCoverLetter,
            skipOptionalMessage: role.preference.skipOptionalMessage,
            skipPortfolio: role.preference.skipPortfolio,
            fillLinkedIn: role.preference.fillLinkedIn,
          }
        : null;

      if (!role.preference || !optionalPrefs || role.locations.length === 0) {
        botLogger.warn(`Role "${role.title}" is missing search preferences or locations — skipping role`, { jobRoleId: role.id });
        continue;
      }

      for (const botRunPortal of botRun.portals) {
        if (controlSignal.isStopped) break roleLoop;

        await controlSignal.checkpoint(() => void setStatus("paused"));
        if (controlSignal.isStopped) break roleLoop;

        if ((roleAppliedCounts.get(botRunRole.id) ?? 0) >= botRunRole.applicationLimitSnapshot) break; // this role's target reached — next role

        const portalCode = botRunPortal.jobPortal.code;

        if (!authenticatedPortals.has(portalCode)) {
          await setStatus("logging_in", { currentPlatform: portalCode, currentJobRoleId: role.id });
          const ok = await authenticatePortal(botRunPortal);
          if (!ok) {
            botLogger.error("Authentication failed — pausing bot for user intervention (reconnect the account, then Resume)", {
              portalCode,
            });
            controlSignal.forcePause();
            await setStatus("paused", { currentPlatform: portalCode });
            await controlSignal.checkpoint();
            if (controlSignal.isStopped) break roleLoop;
            // Resumed: retry this same portal from the top of the inner loop.
            const retryOk = await authenticatePortal(botRunPortal);
            if (!retryOk) {
              botLogger.error("Re-authentication failed again — skipping this portal for this role", { portalCode });
              continue;
            }
          }
        }

        await setStatus("searching", { currentPlatform: portalCode, currentJobRoleId: role.id });
        botLogger.info(`Searching ${role.title} jobs on ${botRunPortal.jobPortal.name}`, { jobRoleId: role.id, portalCode });

        const adapter = createAdapter(portalCode);
        const { page, browserContext } = await browserSessions.getOrCreateContext(portalCode, undefined);
        const ctx: AdapterRunContext = { page, browserContext, botRunId, userId, logger: botLogger, signal: controlSignal.signal };
        const criteria = buildSearchCriteria(role);

        for await (const normalizedJob of adapter.searchJobs(criteria, ctx)) {
          if (controlSignal.isStopped) break roleLoop;
          await controlSignal.checkpoint(() => void setStatus("paused"));
          if (controlSignal.isStopped) break roleLoop;

          if ((roleAppliedCounts.get(botRunRole.id) ?? 0) >= botRunRole.applicationLimitSnapshot) break;

          await setStatus("analyzing", { currentPlatform: portalCode, currentJobRoleId: role.id, currentJobTitle: normalizedJob.title });

          const result = await processJob({
            adapter,
            ctx,
            normalizedJob,
            jobPortalId: botRunPortal.jobPortalId,
            portalAccountId: botRunPortal.portalAccountId,
            botRunId,
            jobRoleId: role.id,
            matchThresholdPercent: role.preference.matchThresholdPercent,
            resume,
            loadResumeFile,
            candidate,
            optionalPrefs,
          });

          await recordOutcome(botRunId, botRunRole.id, result);
          counters[result.outcome === "applied" ? "applied" : result.outcome === "skipped" ? "skipped" : "failed"] += 1;
          if (result.outcome === "applied") {
            roleAppliedCounts.set(botRunRole.id, (roleAppliedCounts.get(botRunRole.id) ?? 0) + 1);
          }

          if (result.applicationId) {
            publishBotApplication(redisPublisher, userId, {
              botRunId,
              applicationId: result.applicationId,
              jobTitle: normalizedJob.title,
              company: normalizedJob.company,
              platform: portalCode,
              status: result.outcome === "applied" ? "applied" : result.outcome === "skipped" ? "skipped" : "failed",
              platformMatchScore: result.matchScore,
              skipReason: result.skipReason ?? null,
              failureReason: result.failureReason ?? null,
            });
          }

          await setStatus("waiting", { currentPlatform: portalCode, currentJobRoleId: role.id });
          const bot = await prisma.bot.findUnique({ where: { userId } });
          await abortableSleep((bot?.pacingDelaySeconds ?? env.WORKER_DEFAULT_PACING_SECONDS) * 1000, controlSignal.signal);
        }
      }
    }

    const finalStatus: BotStatus = controlSignal.isStopped ? "stopped" : "completed";
    await finalizeBotRun(botRunId, userId, finalStatus, redisPublisher);
    await setStatus(finalStatus);
    botLogger.info(`Bot run ${finalStatus}`, { applied: counters.applied, skipped: counters.skipped, failed: counters.failed });
  } catch (err) {
    processLogger.error({ err, botRunId }, "Unexpected automation engine error");
    botLogger.error(`Unexpected error: ${(err as Error).message}`, {});
    await failRun(botRunId, userId, redisPublisher, botLogger, (err as Error).message);
  } finally {
    await browserSessions.close();
    await controlSignal.dispose();
  }
}

async function recordOutcome(
  botRunId: string,
  botRunRoleId: string,
  result: Awaited<ReturnType<typeof processJob>>,
): Promise<void> {
  const increment = { increment: 1 } as const;
  const [roleUpdate, runUpdate] =
    result.outcome === "applied"
      ? [{ appliedCount: increment }, { totalApplied: increment }]
      : result.outcome === "skipped"
        ? [{ skippedCount: increment }, { totalSkipped: increment }]
        : [{ failedCount: increment }, { totalFailed: increment }];

  await prisma.$transaction([
    prisma.botRunRole.update({ where: { id: botRunRoleId }, data: roleUpdate }),
    prisma.botRun.update({ where: { id: botRunId }, data: runUpdate }),
  ]);
}

async function finalizeBotRun(botRunId: string, userId: string, status: BotStatus, redisPublisher: IORedis): Promise<void> {
  const run = await prisma.botRun.update({
    where: { id: botRunId },
    data: { status, completedAt: new Date() },
  });
  if (status === "completed" || status === "failed" || status === "stopped") {
    publishBotRunCompleted(redisPublisher, userId, {
      botRunId,
      status,
      summary: {
        totalApplied: run.totalApplied,
        totalSkipped: run.totalSkipped,
        totalFailed: run.totalFailed,
        startedAt: run.startedAt.toISOString(),
        completedAt: (run.completedAt ?? new Date()).toISOString(),
      },
    });
  }
}

async function failRun(
  botRunId: string,
  userId: string,
  redisPublisher: IORedis,
  botLogger: ReturnType<typeof createBotLogger>,
  message: string,
): Promise<void> {
  botLogger.error(`Bot run failed: ${message}`, {});
  await prisma.bot.update({ where: { userId }, data: { status: "failed" } }).catch(() => undefined);
  await finalizeBotRun(botRunId, userId, "failed", redisPublisher).catch(() => undefined);
  publishBotStatus(redisPublisher, userId, {
    status: "failed",
    botRunId,
    currentPlatform: null,
    currentRoleId: null,
    currentRoleTitle: null,
    currentJobTitle: null,
    progress: { applied: 0, skipped: 0, failed: 0, total: 0 },
  });
}
