import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "./env.js";

/**
 * AES-256-GCM for REVERSIBLE secrets (portal account passwords, cached
 * Playwright session state) — distinct from the one-way argon2id hashing
 * used for the user's own login password (see password.ts). We need to
 * decrypt these to actually log back into the portal on the candidate's
 * behalf; a login password never needs to be recovered.
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

/**
 * Non-secret fingerprint of the currently-loaded key — see the identical
 * helper in apps/worker/src/lib/crypto.ts for why this exists.
 */
export function keyFingerprint(): string {
  return createHash("sha256").update(getKey()).digest("hex").slice(0, 12);
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: 1,
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
