import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withRouteMetrics } from "@/lib/metrics";
import { buckets, checkBuckets, s3 } from "@/lib/storage/s3";

type CheckStatus = "ok" | "error";

async function check(name: string, probe: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await probe();
    return "ok";
  } catch (error) {
    logger.error({ err: error, check: name }, "Vérification de santé en échec");
    return "error";
  }
}

export const GET = withRouteMetrics("/api/health", async () => {
  const [database, storage] = await Promise.all([
    check("db", () => db().$queryRaw`SELECT 1`),
    check("storage", () => {
      const { models, previews } = buckets();
      return checkBuckets(s3(), [models, previews]);
    }),
  ]);
  const healthy = database === "ok" && storage === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "error", checks: { db: database, storage } },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
});
