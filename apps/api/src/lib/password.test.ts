import { describe, expect, it } from "vitest";

process.env.CREDENTIALS_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/jobapp";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-not-for-production-use-only";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-not-for-production-use-only";

const { hashPassword, verifyPassword } = await import("./password.js");

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", async () => {
    const hash = await hashPassword("correct-password-123");
    expect(await verifyPassword(hash, "correct-password-123")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-password-123");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("never stores the plaintext password in the hash output", async () => {
    const plaintext = "correct-password-123";
    const hash = await hashPassword(plaintext);
    expect(hash).not.toContain(plaintext);
  });

  it("does not throw on a malformed hash — verifyPassword fails closed instead", async () => {
    await expect(verifyPassword("not-a-real-argon2-hash", "anything")).resolves.toBe(false);
  });
});
