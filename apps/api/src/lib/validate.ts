import type { ZodType } from "zod";
import { HttpError } from "./http-error.js";

// `ZodType<T, ZodTypeDef, any>` (not the `ZodSchema<T>` alias, which pins
// Input=Output=T) — several schemas here use `.default()`/`.coerce`, where
// the parsed Output type has required fields the raw Input doesn't. Pinning
// Input=Output would make TS infer T from the looser Input side instead.
export function parseOrThrow<T>(schema: ZodType<T, import("zod").ZodTypeDef, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw HttpError.badRequest("Validation failed", result.error.flatten());
  }
  return result.data;
}
