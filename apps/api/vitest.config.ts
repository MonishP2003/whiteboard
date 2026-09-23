import { defineConfig } from "vitest/config";

// Load apps/api/.env when present; CI sets the variables directly.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

// Integration tests truncate every table, so locally they run against a separate database.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";

export default defineConfig({
  test: {
    // Integration files share one database.
    fileParallelism: false,
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/globalSetup.ts"],
        },
      },
    ],
  },
});
