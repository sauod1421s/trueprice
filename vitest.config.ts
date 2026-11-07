import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname), "server-only": path.resolve(__dirname, "tests/support/server-only-stub.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "app/lib/ingest/**/*.ts", "app/lib/auth/**/*.ts", "app/lib/valuation/**/*.ts",
        "app/lib/analytics/**/*.ts", "app/lib/support/validate.ts", "app/lib/admin/feedRows.ts",
        "app/lib/db/health.ts", "app/lib/db/connection.ts", "app/lib/previewDefaults.ts",
      ],
      reporter: ["text-summary", "text"],
      // حد أدنى يفشل CI تحته
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
