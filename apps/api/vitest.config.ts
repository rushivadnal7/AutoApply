import { defineConfig } from "vitest/config";

export default defineConfig({
  // See apps/worker/vitest.config.ts for why this is needed — an inline
  // (empty) postcss config short-circuits Vite's filesystem auto-discovery,
  // which otherwise walks up past the repo root into a sibling project.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    css: false,
  },
});
