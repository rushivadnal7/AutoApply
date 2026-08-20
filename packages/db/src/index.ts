import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient, cached on `globalThis` to survive dev-mode
 * hot-reload without exhausting Postgres connections (Supabase free tier
 * has a small connection cap).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
