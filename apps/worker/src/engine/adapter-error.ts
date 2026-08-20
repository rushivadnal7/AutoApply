import type { FailureReason } from "@job-app/shared";

/**
 * Thrown by an adapter when it can identify a specific, meaningful failure
 * reason (session expired, CAPTCHA, form changed, timeout, ...). The engine
 * catches this specially and records `Application.failureReason` exactly as
 * given; any other thrown error falls back to `unknown_error` /
 * `website_error` in the engine's generic catch block.
 */
export class AdapterError extends Error {
  constructor(
    public readonly failureReason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
