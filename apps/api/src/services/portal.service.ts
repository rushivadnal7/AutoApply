import { prisma } from "@job-app/db";
import type { PortalAccountConnectInput } from "@job-app/shared";
import { HttpError } from "../lib/http-error.js";
import { encryptSecret } from "../lib/crypto.js";

/** Fields safe to ever return from a read endpoint — never the encrypted secret material. */
const safePortalAccountSelect = {
  id: true,
  jobPortalId: true,
  jobPortal: { select: { code: true, name: true, isActive: true } },
  status: true,
  accountEmail: true,
  lastVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listPortals() {
  return prisma.jobPortal.findMany({ orderBy: { code: "asc" } });
}

export async function listPortalAccounts(userId: string) {
  return prisma.portalAccount.findMany({ where: { userId }, select: safePortalAccountSelect });
}

export async function connectPortalAccount(userId: string, input: PortalAccountConnectInput) {
  const portal = await prisma.jobPortal.findUnique({ where: { code: input.portalCode } });
  if (!portal) throw HttpError.notFound("Unknown job portal");

  const encrypted = encryptSecret(input.accountPassword);

  const account = await prisma.portalAccount.upsert({
    where: { userId_jobPortalId: { userId, jobPortalId: portal.id } },
    update: {
      accountEmail: input.accountEmail,
      encryptedPassword: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      encryptionKeyVersion: encrypted.keyVersion,
      status: "connected",
      // A fresh credential save invalidates any cached session for the old creds.
      sessionStateEncrypted: null,
      sessionStateIv: null,
      sessionStateAuthTag: null,
      sessionStateKeyVersion: null,
    },
    create: {
      userId,
      jobPortalId: portal.id,
      accountEmail: input.accountEmail,
      encryptedPassword: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      encryptionKeyVersion: encrypted.keyVersion,
      status: "connected",
    },
    select: safePortalAccountSelect,
  });

  return account;
}

export async function disconnectPortalAccount(userId: string, portalCode: string) {
  const portal = await prisma.jobPortal.findUnique({ where: { code: portalCode as never } });
  if (!portal) throw HttpError.notFound("Unknown job portal");

  const account = await prisma.portalAccount.findUnique({
    where: { userId_jobPortalId: { userId, jobPortalId: portal.id } },
  });
  if (!account) throw HttpError.notFound("No connected account for this portal");

  // A real disconnect purges the stored secret, not just a status flag —
  // reconnecting requires re-entering credentials.
  await prisma.portalAccount.update({
    where: { id: account.id },
    data: {
      status: "disconnected",
      encryptedPassword: "",
      encryptionIv: "",
      encryptionAuthTag: "",
      sessionStateEncrypted: null,
      sessionStateIv: null,
      sessionStateAuthTag: null,
      sessionStateKeyVersion: null,
    },
  });
}
