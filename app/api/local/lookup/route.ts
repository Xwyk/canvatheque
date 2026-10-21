import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { lookupChecksums, lookupSchema } from "@/features/local/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withRouteMetrics } from "@/lib/metrics";
import { consumeRateLimit, HOUR, rateLimitKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

const NO_STORE = { "Cache-Control": "no-store" };
const LOOKUPS_PER_HOUR = 20;

/**
 * Mode local : modèles publiés correspondant à des empreintes SHA-256 (jamais de fichier).
 * Appelé seulement sur « Vérifier sur Canvathèque » ; ouvert aux visiteurs, limité par IP.
 */
export const POST = withRouteMetrics("/api/local/lookup", async (request) => {
  const limit = await consumeRateLimit(db(), rateLimitKey("lookup", clientIp(await headers())), {
    limit: LOOKUPS_PER_HOUR,
    windowMs: HOUR,
  });
  if (!limit.ok) {
    logger.warn({ event: "rate_limited", bucket: "lookup" }, "Limite de débit atteinte");
    return NextResponse.json(
      { code: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
    );
  }
  const parsed = lookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }
  const matches = await lookupChecksums(db(), parsed.data.checksums);
  return NextResponse.json({ matches }, { headers: NO_STORE });
});
