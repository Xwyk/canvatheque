import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Trois projets, une seule couverture fusionnée (coverage/lcov.info) : ADR-010.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "features/**/*.test.ts", "tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: [
            "components/**/*.test.tsx",
            "app/**/*.test.tsx",
            "features/**/*.test.tsx",
            "tests/components/**/*.test.tsx",
          ],
          setupFiles: ["tests/setup/components.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          include: ["tests/backend/**/*.test.ts", "tests/backend/**/*.test.tsx"],
          globalSetup: ["tests/setup/backend-global.ts"],
          setupFiles: ["tests/setup/backend.ts"],
          // Une seule base partagée : exécution séquentielle des fichiers.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "html"],
      reportsDirectory: "coverage",
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "features/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "prisma/seed.ts",
        "proxy.ts",
        "instrumentation.ts",
        "i18n/**/*.ts",
      ],
      exclude: [
        // Primitives shadcn générées, non modifiées
        "components/ui/button.tsx",
        // Client Prisma généré
        "lib/generated/**",
        // Définitions de polices (aucune logique, résolues par le compilateur Next)
        "app/fonts.ts",
        // Filet ultime sans fournisseurs, testé en E2E
        "app/global-error.tsx",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
      ],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
