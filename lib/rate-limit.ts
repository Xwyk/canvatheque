import { createHash } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type RateLimitRule = {
  /** Nombre maximal d'événements dans la fenêtre. */
  limit: number;
  /** Durée de la fenêtre glissante, en millisecondes. */
  windowMs: number;
};

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfter: number };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Hache un identifiant (IP, e-mail) pour ne jamais le stocker en clair dans les clés. */
export function rateLimitKey(action: string, ...parts: (string | null | undefined)[]): string {
  const digest = createHash("sha256")
    .update(parts.map((part) => part ?? "-").join("|"))
    .digest("base64url")
    .slice(0, 22);
  return `${action}:${digest}`;
}

/**
 * Estimation de fenêtre glissante : seau courant + seau précédent pondéré par la part
 * de la fenêtre qu'il recouvre encore (ADR-004).
 */
export function slidingCount(current: number, previous: number, elapsedRatio: number): number {
  return current + previous * (1 - elapsedRatio);
}

/**
 * Enregistre un événement et indique s'il dépasse la limite. L'incrément est atomique
 * (INSERT … ON CONFLICT … RETURNING) ; un dépassement est quand même compté, ce qui
 * pénalise les rafales.
 */
export async function consumeRateLimit(
  prisma: PrismaClient,
  key: string,
  { limit, windowMs }: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const time = now.getTime();
  const bucketStart = Math.floor(time / windowMs) * windowMs;
  const bucket = new Date(bucketStart);
  const previousBucket = new Date(bucketStart - windowMs);

  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "bucket", "count") VALUES (${key}, ${bucket}, 1)
    ON CONFLICT ("key", "bucket") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  const previous = await prisma.rateLimit.findUnique({
    where: { key_bucket: { key, bucket: previousBucket } },
    select: { count: true },
  });

  // Purge opportuniste des seaux de plus d'un jour, à l'ouverture d'un nouveau seau
  // (premier événement de la fenêtre pour cette clé) : rare et indexé sur "bucket".
  if (row!.count === 1) {
    await prisma.rateLimit.deleteMany({
      where: { bucket: { lt: new Date(time - DAY - windowMs) } },
    });
  }

  const elapsedRatio = (time - bucketStart) / windowMs;
  const estimate = slidingCount(row!.count, previous?.count ?? 0, elapsedRatio);
  if (estimate <= limit) return { ok: true, remaining: Math.floor(limit - estimate) };

  // Attente estimée avant que le compte glissant repasse sous la limite.
  const previousCount = previous?.count ?? 0;
  let retryAfterMs = bucketStart + windowMs - time;
  if (previousCount > 0 && row!.count <= limit) {
    const neededRatio = 1 - (limit - row!.count) / previousCount;
    retryAfterMs = Math.max(0, neededRatio * windowMs - (time - bucketStart));
  }
  return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/** Efface les compteurs d'une clé (ex. après une connexion réussie). */
export async function resetRateLimit(prisma: PrismaClient, key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
