import { prisma } from "@job-app/db";
import { HttpError } from "../lib/http-error.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiryDate, signAccessToken } from "../lib/jwt.js";

export interface AuthResult {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  email: string,
  password: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw HttpError.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      bot: { create: {} }, // one Bot control-state singleton per user, from day one
    },
  });

  return issueTokenPair(user.id, user.email, meta);
}

export async function loginUser(
  email: string,
  password: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw HttpError.unauthorized("Invalid email or password");
  }
  return issueTokenPair(user.id, user.email, meta);
}

export async function refreshSession(
  rawRefreshToken: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw HttpError.unauthorized("Invalid refresh token");
  }

  if (existing.revokedAt) {
    // A previously-rotated-out token being reused is a signal of theft —
    // revoke every session for this user rather than just this one token.
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw HttpError.unauthorized("Refresh token reuse detected; all sessions revoked");
  }

  if (existing.expiresAt < new Date()) {
    throw HttpError.unauthorized("Refresh token expired");
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user) {
    throw HttpError.unauthorized("Invalid refresh token");
  }

  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  return issueTokenPair(user.id, user.email, meta);
}

export async function logoutSession(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokenPair(
  userId: string,
  email: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<AuthResult> {
  const accessToken = signAccessToken(userId);
  const { token: refreshToken, tokenHash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  return { userId, email, accessToken, refreshToken };
}
