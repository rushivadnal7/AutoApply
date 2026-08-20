import type { JobPortalAdapter, PortalCode } from "@job-app/shared";
import { MockAdapter } from "./base/mock-adapter.js";
import { DiceAdapter } from "./dice/dice-adapter.js";
import { createZipRecruiterAdapter } from "./zip-recruiter/stub-adapter.js";
import { createIndeedAdapter } from "./indeed/stub-adapter.js";
import { createMonsterAdapter } from "./monster/stub-adapter.js";
import { env } from "../lib/env.js";

/**
 * One fresh adapter instance per BotRun-portal-session — never a shared
 * singleton, since some adapters (MockAdapter) hold small per-run mutable
 * state (e.g. "which step of the multi-step form are we on"), and reusing
 * an instance across concurrent runs (plausible once multiple users run
 * bots at once) would let that state leak between them.
 *
 * WORKER_ADAPTER_MODE selects what backs the DICE slot: "mock" (default in
 * this environment — no live Dice credentials were available to verify
 * against) or "dice" (the real Playwright adapter, once you have a test
 * account — see IMPLEMENTATION_PLAN.md Phase 6/7).
 */
const factories: Record<PortalCode, () => JobPortalAdapter> = {
  DICE: env.WORKER_ADAPTER_MODE === "dice" ? () => new DiceAdapter() : () => new MockAdapter(),
  ZIPRECRUITER: createZipRecruiterAdapter,
  INDEED: createIndeedAdapter,
  MONSTER: createMonsterAdapter,
};

export function createAdapter(portalCode: PortalCode): JobPortalAdapter {
  return factories[portalCode]();
}
