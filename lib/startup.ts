import { ensureCoreAccounts } from "@/features/account/bootstrap";
import { ensureCategories } from "@/features/catalog/categories";
import { cleanupExpiredUploads } from "@/features/uploads/service";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailer } from "@/lib/mail/mailer";
import { resetPasswordMessage } from "@/lib/mail/templates";
import { buckets, s3 } from "@/lib/storage/s3";

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
    if (config.SMTP_HOST) {
      await mailer().send(
        resetPasswordMessage(
          { to: result.adminEmail, pseudo: result.adminPseudo },
          result.resetUrl,
        ),
      );
      logger.warn(
        { event: "admin_bootstrap", delivery: "email" },
        "Compte administrateur sans mot de passe : lien de définition envoyé par e-mail (24 h)",
      );
    } else {
      // Sans SMTP, le lien n'a pas d'autre canal : il est affiché une fois dans les journaux.
      logger.warn(
        { event: "admin_bootstrap", delivery: "log", resetUrl: result.resetUrl },
        "Compte administrateur sans mot de passe : utilisez ce lien (valable 24 h) pour le définir",
      );
    }
  }
  try {
    const abandoned = await cleanupExpiredUploads({ prisma, s3: s3(), buckets: buckets() });
    if (abandoned > 0)
      logger.info({ event: "uploads_cleanup", abandoned }, "Envois expirés purgés");
  } catch (error) {
    // Le stockage indisponible ne doit pas empêcher le démarrage (le healthcheck le signalera).
    logger.warn({ event: "uploads_cleanup_failed", err: error }, "Purge des envois impossible");
  }
  logger.info({ event: "startup_complete" }, "Canvathèque prête");
}
