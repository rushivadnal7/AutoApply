import type { Browser, BrowserContext, Page } from "playwright";
import { env } from "../lib/env.js";

/**
 * Lazily launches at most one real Chromium browser per BotRun (shared
 * across every portal used in that run — see SYSTEM_DESIGN.md §8 on why
 * one browser context per portal per run, not per job). In "mock" adapter
 * mode (the default here — no live Dice credentials available in this
 * environment) no real browser is launched at all, so the whole platform
 * is runnable/demoable without Playwright browser binaries installed.
 *
 * The `playwright` package itself is dynamically imported only inside the
 * "dice" branch below — not as a static top-level import. Playwright is a
 * large package to load into memory, and a static import pays that cost at
 * process startup regardless of adapter mode, which mattered in practice:
 * it contributed to the worker being killed (SIGTERM, no logs at all) on
 * Render's free tier ~512MB memory ceiling even in mock mode, where the
 * browser is never actually used.
 */
export class BrowserSessionManager {
  private browser: Browser | null = null;
  private readonly contexts = new Map<string, { context: BrowserContext; page: Page }>();

  async getOrCreateContext(
    portalCode: string,
    cachedStorageState: unknown,
  ): Promise<{ page: unknown; browserContext: unknown }> {
    if (env.WORKER_ADAPTER_MODE !== "dice") {
      // Mock mode: adapters never touch these — plain placeholders suffice.
      return { page: {}, browserContext: {} };
    }

    const existing = this.contexts.get(portalCode);
    if (existing) return { page: existing.page, browserContext: existing.context };

    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: env.WORKER_HEADLESS });
    }

    const context = await this.browser.newContext({
      storageState: (cachedStorageState as Awaited<ReturnType<BrowserContext["storageState"]>>) ?? undefined,
    });
    const page = await context.newPage();
    this.contexts.set(portalCode, { context, page });
    return { page, browserContext: context };
  }

  async close(): Promise<void> {
    for (const { context } of this.contexts.values()) {
      await context.close().catch(() => undefined);
    }
    this.contexts.clear();
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
