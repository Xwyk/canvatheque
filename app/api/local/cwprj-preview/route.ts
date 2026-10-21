import { NextResponse } from "next/server";
import { cwprjPreview } from "@/features/local/server";
import { getCurrentUser } from "@/lib/auth/current";
import { parseCwprjKeys } from "@/lib/cwprj-keys";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRouteMetrics } from "@/lib/metrics";
import { consumeRateLimit, HOUR, rateLimitKey } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };
const PREVIEWS_PER_HOUR = 30;

/**
 * Mode local : miniature d'un seul `.cwprj` envoyé sur demande explicite (« Afficher la
 * miniature »). Membres uniquement, limité par membre ; corps brut (le fichier), WebP
 * ré-encodé en réponse, rien n'est stocké (ADR-013, ADR-014).
 */
export const POST = withRouteMetrics("/api/local/cwprj-preview", async (request) => {
  const config = env();
  const keys = parseCwprjKeys(config.CWPRJ_KEY, config.CWPRJ_IV);
  if (keys.length === 0) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }
  const limit = await consumeRateLimit(db(), rateLimitKey("cwprj-preview", user.id), {
    limit: PREVIEWS_PER_HOUR,
    windowMs: HOUR,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { code: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
    );
  }

  const maxBytes = config.MAX_FILE_SIZE_MB * 1024 * 1024;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!request.body || declared > maxBytes) {
    return NextResponse.json(
      { code: "VALIDATION", reason: "tooLarge" },
      { status: 413, headers: NO_STORE },
    );
  }
  // Lecture bornée : une taille annoncée fausse ne fait pas dépasser la limite.
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > maxBytes) {
      return NextResponse.json(
        { code: "VALIDATION", reason: "tooLarge" },
        { status: 413, headers: NO_STORE },
      );
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    return NextResponse.json(
      { code: "VALIDATION", reason: "empty" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await cwprjPreview(Buffer.concat(chunks), keys);
  if (!result.ok) {
    logger.info(
      { event: "cwprj_preview_unavailable", reason: result.reason, source: "local" },
      "Miniature locale indisponible",
    );
    return NextResponse.json(
      { code: "UNPROCESSABLE", reason: result.reason },
      { status: 422, headers: NO_STORE },
    );
  }
  return new NextResponse(new Uint8Array(result.webp), {
    headers: { ...NO_STORE, "Content-Type": "image/webp" },
  });
});
