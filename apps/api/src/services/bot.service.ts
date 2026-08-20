import { prisma } from "@job-app/db";
import { ACTIVE_BOT_STATUSES, botControlChannelFor, type BotControlAction, type BotStartInput } from "@job-app/shared";
import { HttpError } from "../lib/http-error.js";
import { assertRoleIsRunnable } from "./role.service.js";
import { enqueueBotRun } from "../queue/bot-run-queue.js";
import { redisConnection } from "../lib/redis.js";

export async function getBotStatus(userId: string) {
  const bot = await prisma.bot.findUnique({ where: { userId } });
  if (!bot) throw HttpError.notFound("Bot state not found for user");
  return bot;
}

export async function startBot(userId: string, input: BotStartInput) {
  const bot = await prisma.bot.findUnique({ where: { userId } });
  if (!bot) throw HttpError.notFound("Bot state not found for user");
  if ((ACTIVE_BOT_STATUSES as readonly string[]).includes(bot.status)) {
    throw HttpError.conflict("A bot run is already active for this account", { currentStatus: bot.status });
  }

  // Defensive app-layer guard mirroring the partial-unique "one active BotRun
  // per user" DB constraint (see packages/db/prisma/schema.prisma TODO note).
  const existingActiveRun = await prisma.botRun.findFirst({
    where: { userId, status: { in: [...ACTIVE_BOT_STATUSES] } },
  });
  if (existingActiveRun) {
    throw HttpError.conflict("A bot run is already active for this account");
  }

  const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw HttpError.badRequest("Complete your candidate profile before starting the bot");
  }

  const roles = await Promise.all(input.jobRoleIds.map((id) => assertRoleIsRunnable(id)));
  for (const role of roles) {
    if (role.userId !== userId) throw HttpError.forbidden("Job role does not belong to this account");
  }

  const portalAccounts = await prisma.portalAccount.findMany({
    where: { userId, jobPortal: { code: { in: input.portalCodes } } },
    include: { jobPortal: true },
  });

  for (const code of input.portalCodes) {
    const account = portalAccounts.find((a) => a.jobPortal.code === code);
    if (!account || account.status !== "connected") {
      throw HttpError.badRequest(`Portal ${code} is not connected yet`);
    }
    if (!account.jobPortal.isActive) {
      throw HttpError.badRequest(`Portal ${code} does not have a working automation adapter yet`);
    }
  }

  const totalTarget = roles.reduce((sum, r) => sum + r.applicationLimit, 0);

  const botRun = await prisma.$transaction(async (tx) => {
    const run = await tx.botRun.create({
      data: {
        userId,
        status: "starting",
        roles: {
          create: roles.map((r) => ({ jobRoleId: r.id, applicationLimitSnapshot: r.applicationLimit })),
        },
        portals: {
          create: portalAccounts
            .filter((a) => input.portalCodes.includes(a.jobPortal.code))
            .map((a) => ({ jobPortalId: a.jobPortalId, portalAccountId: a.id })),
        },
      },
    });

    await tx.bot.update({
      where: { userId },
      data: {
        status: "starting",
        currentBotRunId: run.id,
        currentPlatform: null,
        currentJobRoleId: null,
        currentJobTitle: null,
        progressApplied: 0,
        progressSkipped: 0,
        progressFailed: 0,
        progressTotal: totalTarget,
      },
    });

    return run;
  });

  await enqueueBotRun({ botRunId: botRun.id, userId });

  return botRun;
}

export async function updatePacingDelay(userId: string, pacingDelaySeconds: number) {
  return prisma.bot.update({ where: { userId }, data: { pacingDelaySeconds } });
}

export async function sendBotControl(userId: string, action: BotControlAction) {
  const bot = await prisma.bot.findUnique({ where: { userId } });
  if (!bot) throw HttpError.notFound("Bot state not found for user");

  if (action === "pause" && !["starting", "logging_in", "searching", "analyzing", "applying", "waiting", "resuming"].includes(bot.status)) {
    throw HttpError.conflict("Bot is not in a pausable state", { currentStatus: bot.status });
  }
  if (action === "resume" && bot.status !== "paused") {
    throw HttpError.conflict("Bot is not paused", { currentStatus: bot.status });
  }
  if (action === "stop" && !(ACTIVE_BOT_STATUSES as readonly string[]).includes(bot.status)) {
    throw HttpError.conflict("Bot is not running", { currentStatus: bot.status });
  }

  // The worker owns every Bot.status write from here — the API only signals
  // intent. This keeps status transitions single-sourced and avoids the
  // dashboard flickering between an optimistic API write and the worker's
  // own authoritative one.
  await redisConnection.publish(botControlChannelFor(userId), action);

  return { acknowledged: true, action };
}
