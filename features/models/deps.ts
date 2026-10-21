import type { UploadDeps } from "@/features/uploads/service";
import { getSession } from "@/lib/auth/current";
import { parseCwprjKeys } from "@/lib/cwprj-keys";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { consumeRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import { fail, type Failure } from "@/lib/result";
import { buckets, publicS3, s3 } from "@/lib/storage/s3";

/** Dépendances réelles des services de publication (serveur uniquement). */
export function publicationDeps(): UploadDeps {
  const config = env();
  return {
    prisma: db(),
    s3: s3(),
    publicS3: publicS3(),
    buckets: buckets(),
    maxFileBytes: config.MAX_FILE_SIZE_MB * 1024 * 1024,
    maxModels: config.MAX_MODELS_PER_USER,
    cwprjKeys: parseCwprjKeys(config.CWPRJ_KEY, config.CWPRJ_IV),
  };
}

/** Membre connecté, sinon un échec typé (la session d'un compte banni est déjà refusée). */
export async function currentActor() {
  const session = await getSession();
  if (!session) return fail("UNAUTHORIZED", "errors.unauthorized");
  return { ok: true as const, data: session.user };
}

/** Échec RATE_LIMITED si la limite est atteinte, sinon null. */
export async function rateLimited(key: string, rule: RateLimitRule): Promise<Failure | null> {
  const result = await consumeRateLimit(db(), key, rule);
  if (result.ok) return null;
  logger.warn({ event: "rate_limited", bucket: key.split(":")[0] }, "Limite de débit atteinte");
  return fail("RATE_LIMITED", "errors.rateLimited", { retryAfter: result.retryAfter });
}
