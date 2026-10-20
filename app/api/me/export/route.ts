import { NextResponse } from "next/server";
import { exportFileName, exportUserData } from "@/features/account/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withRouteMetrics } from "@/lib/metrics";
import { consumeRateLimit, HOUR, rateLimitKey } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };
const EXPORTS_PER_HOUR = 10;

/** Export JSON des données du membre connecté (RGPD), en pièce jointe. */
export const GET = withRouteMetrics("/api/me/export", async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }
  const limit = await consumeRateLimit(db(), rateLimitKey("export", user.id), {
    limit: EXPORTS_PER_HOUR,
    windowMs: HOUR,
  });
  if (!limit.ok) {
    logger.warn({ event: "rate_limited", bucket: "export" }, "Limite de débit atteinte");
    return NextResponse.json(
      { code: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
    );
  }
  const now = new Date();
  const data = await exportUserData(db(), user.id, now);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(user.pseudoSlug, now)}"`,
    },
  });
});
