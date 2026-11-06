import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["app/lib/ingest/**/*.ts", "app/lib/auth/**/*.ts", "app/lib/valuation/**/*.ts"],
      reporter: ["text-summary", "text"],
      // حد أدنى يفشل CI تحته
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
