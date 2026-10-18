// Configuration Prisma utilisée dans l'image de production (dossier /app/ops).
// Les chemins sont relatifs à ce fichier.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "../prisma/schema.prisma",
  migrations: { path: "../prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
