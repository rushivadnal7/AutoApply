/**
 * Populates a demo account with realistic historical data so the dashboard
 * isn't empty on first view for a client demo (IMPLEMENTATION_PLAN.md Phase
 * 13). Idempotent-ish: re-running upserts the user/profile/roles but will
 * add a fresh duplicate bot run + applications each time — fine for a demo
 * reset, not meant to run repeatedly against a real deployment.
 *
 * Usage: pnpm --filter @job-app/db exec tsx prisma/seed-demo.ts
 */
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "DemoPass123";

// A minimal-but-valid single-page PDF, just enough to satisfy the magic-byte
// check and be openable — content doesn't matter for a demo resume.
const PLACEHOLDER_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
);

const ROLES = [
  { title: "Business Analyst", applicationLimit: 50 },
  { title: "Data Analyst", applicationLimit: 30 },
];

const COMPANIES = ["Acme Corp", "Northwind Traders", "Globex", "Initech", "Umbrella Group", "Stark Industries"];

const SKIP_REASONS = [
  "below_match_threshold",
  "already_applied",
  "duplicate_job",
  "job_unavailable",
  "application_not_supported",
] as const;

const FAILURE_REASONS = ["mandatory_field_unfillable", "timeout", "form_changed"] as const;

function randomOf<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000 - Math.floor(Math.random() * 3_600_000));
}

async function main() {
  const dicePortal = await prisma.jobPortal.findUniqueOrThrow({ where: { code: "DICE" } });

  const passwordHash = await hash(DEMO_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash, bot: { create: {} } },
  });

  await prisma.candidateProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      fullName: "Jordan Rivera",
      phone: "(555) 234-9871",
      city: "Austin",
      state: "TX",
      workAuthorization: "us_citizen",
      linkedinUrl: "https://linkedin.com/in/jordan-rivera-demo",
    },
  });

  const resumeId = randomUUID();
  const resume = await prisma.resume.upsert({
    where: { id: resumeId },
    update: {},
    create: {
      id: resumeId,
      userId: user.id,
      fileName: "Jordan_Rivera_Resume.pdf",
      storagePath: `${user.id}/${resumeId}/Jordan_Rivera_Resume.pdf`,
      fileSizeBytes: PLACEHOLDER_PDF.length,
      mimeType: "application/pdf",
      isDefault: true,
    },
  });

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join, resolve } = await import("node:path");
  const localPath = join(resolve(process.cwd(), "..", "..", "apps", "api", "uploads"), resume.storagePath);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, PLACEHOLDER_PDF);

  const account = await prisma.portalAccount.upsert({
    where: { userId_jobPortalId: { userId: user.id, jobPortalId: dicePortal.id } },
    update: {},
    create: {
      userId: user.id,
      jobPortalId: dicePortal.id,
      status: "connected",
      accountEmail: "jordan.rivera.demo@example.com",
      encryptedPassword: "demo-placeholder-not-a-real-ciphertext",
      encryptionIv: "demo",
      encryptionAuthTag: "demo",
      lastVerifiedAt: daysAgo(1),
    },
  });

  const roleRecords = [];
  for (const roleDef of ROLES) {
    const role = await prisma.jobRole.create({
      data: {
        userId: user.id,
        title: roleDef.title,
        applicationLimit: roleDef.applicationLimit,
        resumeLinks: { create: [{ resumeId: resume.id, isPrimary: true }] },
        preference: {
          create: {
            datePosted: "last_3_days",
            employmentType: "both",
            workArrangement: "any",
            matchThresholdPercent: 65,
            skipCoverLetter: true,
            skipOptionalMessage: true,
            skipPortfolio: true,
            fillLinkedIn: false,
          },
        },
        locations: { create: [{ locationType: "remote" }, { locationType: "state", state: "TX" }] },
      },
    });
    roleRecords.push(role);
  }

  const run = await prisma.botRun.create({
    data: {
      userId: user.id,
      status: "completed",
      startedAt: daysAgo(2),
      completedAt: daysAgo(2),
      roles: { create: roleRecords.map((r) => ({ jobRoleId: r.id, applicationLimitSnapshot: 15 })) },
      portals: { create: [{ jobPortalId: dicePortal.id, portalAccountId: account.id }] },
    },
  });

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const role of roleRecords) {
    for (let i = 0; i < 15; i++) {
      const job = await prisma.job.create({
        data: {
          jobPortalId: dicePortal.id,
          externalJobId: `demo-${role.id}-${i}`,
          title: `${role.title} ${i % 3 === 0 ? "II" : ""}`.trim(),
          company: randomOf(COMPANIES),
          location: i % 4 === 0 ? "Remote" : "Austin, TX",
          url: `https://www.dice.com/job-detail/demo-${role.id}-${i}`,
          postedAt: daysAgo(2 + Math.floor(i / 4)),
        },
      });

      const roll = Math.random();
      const matchScore = 55 + Math.floor(Math.random() * 40);

      if (roll < 0.55) {
        applied += 1;
        await prisma.application.create({
          data: {
            userId: user.id,
            jobId: job.id,
            jobRoleId: role.id,
            resumeId: resume.id,
            portalAccountId: account.id,
            botRunId: run.id,
            status: "applied",
            platformMatchScore: matchScore,
            appliedAt: job.postedAt ?? daysAgo(2),
            createdAt: job.postedAt ?? daysAgo(2),
          },
        });
      } else if (roll < 0.85) {
        skipped += 1;
        await prisma.application.create({
          data: {
            userId: user.id,
            jobId: job.id,
            jobRoleId: role.id,
            portalAccountId: account.id,
            botRunId: run.id,
            status: "skipped",
            skipReason: randomOf(SKIP_REASONS),
            platformMatchScore: matchScore,
            createdAt: job.postedAt ?? daysAgo(2),
          },
        });
      } else {
        failed += 1;
        await prisma.application.create({
          data: {
            userId: user.id,
            jobId: job.id,
            jobRoleId: role.id,
            resumeId: resume.id,
            portalAccountId: account.id,
            botRunId: run.id,
            status: "failed",
            failureReason: randomOf(FAILURE_REASONS),
            failureDetail: "Simulated demo-seed failure for realistic history.",
            platformMatchScore: matchScore,
            createdAt: job.postedAt ?? daysAgo(2),
          },
        });
      }
    }
  }

  await prisma.botRun.update({
    where: { id: run.id },
    data: { totalApplied: applied, totalSkipped: skipped, totalFailed: failed },
  });

  await prisma.botLog.createMany({
    data: [
      { botRunId: run.id, level: "info", message: "Connected to Dice", createdAt: daysAgo(2) },
      { botRunId: run.id, level: "info", message: "Searching Business Analyst jobs", createdAt: daysAgo(2) },
      { botRunId: run.id, level: "info", message: `Found ${roleRecords.length * 15} jobs across ${roleRecords.length} roles`, createdAt: daysAgo(2) },
      { botRunId: run.id, level: "info", message: `Run completed — applied ${applied}, skipped ${skipped}, failed ${failed}`, createdAt: daysAgo(2) },
    ],
  });

  await prisma.bot.update({
    where: { userId: user.id },
    data: { status: "completed", currentBotRunId: run.id, progressApplied: applied, progressSkipped: skipped, progressFailed: failed, progressTotal: 30 },
  });

  console.log(`Seeded demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  ${roleRecords.length} roles, 1 resume, 1 connected (mock) Dice account`);
  console.log(`  1 completed bot run: ${applied} applied, ${skipped} skipped, ${failed} failed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
