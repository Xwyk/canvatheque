/**
 * Crée ou vérifie le compte administrateur hors serveur (développement, dépannage).
 * En production, la même opération s'exécute à chaque démarrage (instrumentation.ts).
 * Usage : npm run bootstrap:admin
 */
import { existsSync } from "node:fs";
import { ensureCoreAccounts } from "@/features/account/bootstrap";
import { createPrismaClient } from "@/lib/db";
import { parseEnv } from "@/lib/env";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = parseEnv(process.env);
const prisma = createPrismaClient(config.DATABASE_URL);

try {
  const result = await ensureCoreAccounts(prisma, {
    adminEmail: config.ADMIN_EMAIL,
    adminPassword: config.ADMIN_PASSWORD,
    appUrl: config.APP_URL,
  });
  console.log(`Administrateur prêt (${config.ADMIN_EMAIL}).`);
  if (result.resetUrl) console.log(`Définir le mot de passe (24 h) : ${result.resetUrl}`);
} finally {
  await prisma.$disconnect();
}
