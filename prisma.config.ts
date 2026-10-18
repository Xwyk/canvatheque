import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// En local, les variables viennent de .env ; en conteneur, de l'environnement.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
