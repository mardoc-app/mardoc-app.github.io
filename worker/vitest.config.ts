import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Spies on every console method in every test and fails any test that logs (T-22, I-16).
    setupFiles: ["test/setup.ts"],
    unstubGlobals: true,
  },
});
