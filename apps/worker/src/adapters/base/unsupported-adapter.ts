import type { JobPortalAdapter, PortalCode } from "@job-app/shared";

/**
 * Interface-conformant placeholder for a portal that doesn't have a real
 * adapter yet (ZipRecruiter, Indeed, Monster — see IMPLEMENTATION_PLAN.md
 * "Future Work — Phase A"). It exists so the adapter registry stays
 * type-complete and so `JobPortal.isActive` is the only gate that needs to
 * flip when a real adapter lands — no engine or registry code changes.
 * bot.service.ts already refuses to start a run against an inactive
 * portal, so in normal operation these methods are never actually called.
 */
export function createUnsupportedAdapter(portalCode: PortalCode): JobPortalAdapter {
  const fail = (): never => {
    throw new Error(`The ${portalCode} adapter is not implemented yet`);
  };

  return {
    portalCode,
    authenticate: async () => ({ success: false, reason: `${portalCode} is not supported yet` }),
    // eslint-disable-next-line @typescript-eslint/require-yield
    searchJobs: async function* () {
      return;
    },
    getJobDetails: fail,
    getMatchScore: fail,
    checkApplicationStatus: async () => "unknown",
    startApplication: async () => ({ started: false, reason: `${portalCode} is not supported yet` }),
    detectFormFields: async () => [],
    fillRequiredFields: async () => [],
    skipOptionalFields: async () => [],
    uploadResume: fail,
    submitApplication: async () => ({ status: "failed", failureReason: "unknown_error" }),
    verifyApplication: async () => ({ status: "failed", failureReason: "unknown_error" }),
    proceedToNextStep: async () => ({ isFinalStep: true }),
  };
}
