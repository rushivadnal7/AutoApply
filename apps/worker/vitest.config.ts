import { defineConfig } from "vitest/config";

export default defineConfig({
  // Supplying an inline (empty) postcss config short-circuits Vite's
  // filesystem auto-discovery, which otherwise walks up past the repo root
  // and can pick up an unrelated postcss.config.* from a sibling directory.
  // This package never imports CSS, so an empty plugin list is correct.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    css: false,
  },
});
