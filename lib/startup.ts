import { ensureCoreAccounts } from "@/features/account/bootstrap";
import { ensureCategories } from "@/features/catalog/categories";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Tâches exécutées une fois au démarrage du serveur (voir instrumentation.ts). */
export async function runStartupTasks(): Promise<void> {
  const config = env(); // échoue explicitement si une variable manque
  const prisma = db();
  await ensureCategories(prisma);
  const result = await ensureCoreAccounts(prisma, {
    adminEmail: config.ADMIN_EMAIL,
    adminPassword: config.ADMIN_PASSWORD,
    appUrl: config.APP_URL,
  });
  if (result.resetUrl) {
    // Pas encore d'envoi d'e-mail (étape 1) : le lien est affiché une fois dans les journaux.
    logger.warn(
      { event: "admin_bootstrap", resetUrl: result.resetUrl },
      "Compte administrateur sans mot de passe : utilisez ce lien (valable 24 h) pour le définir",
    );
  }
  logger.info({ event: "startup_complete" }, "Canvathèque prête");
}
