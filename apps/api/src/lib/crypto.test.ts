import { describe, expect, it } from "vitest";

process.env.CREDENTIALS_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/jobapp";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-not-for-production-use-only";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-not-for-production-use-only";

const { encryptSecret, decryptSecret } = await import("./crypto.js");

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const plaintext = "correct horse battery staple";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext and IV each time (random IV per call)", () => {
    const a = encryptSecret("same input");
    const b = encryptSecret("same input");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt if the auth tag was tampered with — this is what makes it authenticated encryption, not just obfuscation", () => {
    const encrypted = encryptSecret("sensitive portal password");
    const tampered = { ...encrypted, authTag: encryptSecret("different").authTag };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
