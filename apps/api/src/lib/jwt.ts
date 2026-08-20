import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export interface AccessTokenPayload {
  sub: string; // userId
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/** Opaque, high-entropy refresh token — not a JWT. The DB (RefreshToken.tokenHash) is the source of truth, which is what makes rotation and "logout everywhere" possible. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiryDate(): Date {
  const ttl = env.JWT_REFRESH_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  const msPerUnit: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  if (!match) return new Date(Date.now() + 30 * 86_400_000);
  const [, amountStr, unit] = match;
  const amount = Number(amountStr);
  return new Date(Date.now() + amount * (msPerUnit[unit as string] ?? 86_400_000));
}
