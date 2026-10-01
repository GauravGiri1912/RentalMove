import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    // Live Cloudinary / Groq calls are part of the suite.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Test files share one isolated store; keep them sequential so they can't race.
    fileParallelism: false,
  },
});
