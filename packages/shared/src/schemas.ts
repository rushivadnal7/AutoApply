import { z } from "zod";
import {
  BOT_CONTROL_ACTION_VALUES,
  DATE_POSTED_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  LOCATION_TYPE_VALUES,
  PORTAL_CODE_VALUES,
  WORK_ARRANGEMENT_VALUES,
  WORK_AUTHORIZATION_VALUES,
} from "./enums.js";
import { US_STATE_CODES } from "./us-states.js";

/**
 * Request-body validation shared between apps/api (server-side enforcement,
 * the actual security boundary) and apps/web (client-side form validation,
 * for UX only). Both importing the same schema means the two can never
 * silently disagree about what's a valid payload.
 */

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

const usStateSchema = z
  .string()
  .length(2)
  .toUpperCase()
  .refine((v) => US_STATE_CODES.includes(v), { message: "Must be a valid US state code" });

export const candidateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9()+\-.\s]{7,20}$/, "Enter a valid phone number"),
  city: z.string().trim().max(100).optional().nullable(),
  state: usStateSchema.optional().nullable(),
  workAuthorization: z.enum(WORK_AUTHORIZATION_VALUES).optional().nullable(),
  linkedinUrl: z.string().trim().url().max(300).optional().nullable().or(z.literal("")),
  portfolioUrl: z.string().trim().url().max(300).optional().nullable().or(z.literal("")),
});
export type CandidateProfileInput = z.infer<typeof candidateProfileSchema>;

export const jobRoleSchema = z.object({
  title: z.string().trim().min(1).max(150),
  applicationLimit: z.coerce.number().int().min(1).max(1000),
  isActive: z.boolean().optional(),
});
export type JobRoleInput = z.infer<typeof jobRoleSchema>;

export const resumeAssignmentSchema = z.object({
  resumeId: z.string().uuid(),
  isPrimary: z.boolean().default(true),
});
export type ResumeAssignmentInput = z.infer<typeof resumeAssignmentSchema>;

export const jobRoleLocationSchema = z
  .object({
    locationType: z.enum(LOCATION_TYPE_VALUES),
    city: z.string().trim().max(100).optional(),
    state: usStateSchema.optional(),
  })
  .refine((v) => v.locationType !== "city" || (!!v.city && !!v.state), {
    message: "City locations require both city and state",
    path: ["city"],
  })
  .refine((v) => v.locationType !== "state" || !!v.state, {
    message: "State locations require a state",
    path: ["state"],
  });
export type JobRoleLocationInput = z.infer<typeof jobRoleLocationSchema>;

export const jobPreferenceSchema = z.object({
  datePosted: z.enum(DATE_POSTED_VALUES),
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES),
  workArrangement: z.enum(WORK_ARRANGEMENT_VALUES),
  matchThresholdPercent: z.coerce.number().int().min(0).max(100),
  skipCoverLetter: z.boolean(),
  skipOptionalMessage: z.boolean(),
  skipPortfolio: z.boolean(),
  fillLinkedIn: z.boolean(),
  locations: z.array(jobRoleLocationSchema).min(1, "Select at least one US location or Remote"),
});
export type JobPreferenceInput = z.infer<typeof jobPreferenceSchema>;

export const portalAccountConnectSchema = z.object({
  portalCode: z.enum(PORTAL_CODE_VALUES),
  accountEmail: emailSchema,
  accountPassword: z.string().min(1).max(256),
});
export type PortalAccountConnectInput = z.infer<typeof portalAccountConnectSchema>;

export const botStartSchema = z.object({
  portalCodes: z.array(z.enum(PORTAL_CODE_VALUES)).min(1),
  jobRoleIds: z.array(z.string().uuid()).min(1),
});
export type BotStartInput = z.infer<typeof botStartSchema>;

export const botControlSchema = z.object({
  action: z.enum(BOT_CONTROL_ACTION_VALUES),
});
export type BotControlInput = z.infer<typeof botControlSchema>;

export const botPacingSchema = z.object({
  pacingDelaySeconds: z.coerce.number().int().min(0).max(600),
});
export type BotPacingInput = z.infer<typeof botPacingSchema>;

export const applicationHistoryQuerySchema = z.object({
  jobTitle: z.string().trim().optional(),
  company: z.string().trim().optional(),
  platform: z.enum(PORTAL_CODE_VALUES).optional(),
  jobRoleId: z.string().uuid().optional(),
  status: z.string().optional(),
  minMatchScore: z.coerce.number().int().min(0).max(100).optional(),
  location: z.string().trim().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ApplicationHistoryQuery = z.infer<typeof applicationHistoryQuerySchema>;
