import { defineConfig } from "vitest/config";
import path from "path";

// `.mts` so Vite's forthcoming native config loader reads this as the ES module
// it is; `import.meta.dirname` for the same reason, since `__dirname` is a
// CommonJS-only global.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Modules under src/lib pull in auth.ts, which refuses to load without a
    // signing key. A throwaway value keeps unit tests importable without
    // reaching for a real secret.
    env: {
      JWT_SECRET: "unit-tests-only-not-a-real-secret",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
    },
  },
});
