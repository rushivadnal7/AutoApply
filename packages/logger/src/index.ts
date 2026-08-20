import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Paths pino will replace with "[Redacted]" no matter how deeply nested the
 * field is (the `*.` prefix matches one level of wildcard key). This is the
 * concrete mechanism behind "logs must not expose passwords or sensitive
 * credentials" — every place a credential-shaped field could end up in a log
 * call is covered here, once, instead of trusting every call site to remember.
 */
export const REDACTED_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "passwordHash",
  "*.passwordHash",
  "encryptedPassword",
  "*.encryptedPassword",
  "encryptionIv",
  "*.encryptionIv",
  "encryptionAuthTag",
  "*.encryptionAuthTag",
  "sessionStateEncrypted",
  "*.sessionStateEncrypted",
  "cachedSessionState",
  "*.cachedSessionState",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "tokenHash",
  "*.tokenHash",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.req.headers.authorization",
  "*.req.headers.cookie",
] as const;

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({ name, level, pretty }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    name,
    level: level ?? process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [...REDACTED_PATHS],
      censor: "[Redacted]",
    },
    base: { pid: process.pid, service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const usePretty = pretty ?? process.env.NODE_ENV !== "production";

  if (usePretty) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    });
  }

  return pino(options);
}

export type { Logger };
