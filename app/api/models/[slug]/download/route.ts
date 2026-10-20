import { NextResponse } from "next/server";
import { absoluteUrl } from "@/features/catalog/seo";
import { downloadReturnPath } from "@/features/downloads/links";
import { requestDownload } from "@/features/downloads/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { metrics, withRouteMetrics } from "@/lib/metrics";
import { consumeRateLimit, HOUR, rateLimitKey } from "@/lib/rate-limit";
import { httpStatusFor } from "@/lib/result";
import { buckets, publicS3 } from "@/lib/storage/s3";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Téléchargement d'un modèle : 302 vers une URL présignée en pièce jointe. Avec
 * `Accept: application/json` (bouton de la fiche), renvoie `{ url }` pour garder la page.
 * Visiteur : 401 JSON (avec `loginUrl`) pour le bouton, redirection vers la connexion pour un
 * lien ouvert directement. Autres erreurs en JSON : 404, 429 (`Retry-After`).
 */
export const GET = withRouteMetrics(
  "/api/models/[slug]/download",
  async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
    const user = await getCurrentUser();

    if (!user) {
      // Après connexion, retour sur la fiche qui relance le téléchargement.
      const loginUrl = `/login?redirectTo=${encodeURIComponent(downloadReturnPath(slug))}`;
      if (!wantsJson) {
        return NextResponse.redirect(absoluteUrl(loginUrl), { status: 303, headers: NO_STORE });
      }
      return NextResponse.json(
        { code: "UNAUTHORIZED", loginUrl },
        { status: 401, headers: NO_STORE },
      );
    }

    const limit = await consumeRateLimit(db(), rateLimitKey("download", user.id), {
      limit: env().RATE_LIMIT_DOWNLOAD_PER_HOUR,
      windowMs: HOUR,
    });
    if (!limit.ok) {
      logger.warn({ event: "rate_limited", bucket: "download" }, "Limite de débit atteinte");
      return NextResponse.json(
        { code: "RATE_LIMITED", retryAfter: limit.retryAfter },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
      );
    }

    const result = await requestDownload(
      {
        prisma: db(),
        publicS3: publicS3(),
        bucket: buckets().models,
        ttlSeconds: env().SIGNED_URL_TTL_SECONDS,
      },
      user,
      slug,
    );
    if (!result.ok) {
      return NextResponse.json(
        { code: result.error.code },
        { status: httpStatusFor(result.error.code), headers: NO_STORE },
      );
    }

    metrics().downloads.inc({ format: result.data.format });
    if (wantsJson) return NextResponse.json({ url: result.data.url }, { headers: NO_STORE });
    return NextResponse.redirect(result.data.url, { status: 302, headers: NO_STORE });
  },
);
