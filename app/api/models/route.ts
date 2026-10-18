import { NextResponse } from "next/server";
import { parseCatalogParams } from "@/features/catalog/params";
import { searchModels } from "@/features/catalog/search";
import { db } from "@/lib/db";
import { withRouteMetrics } from "@/lib/metrics";

/** Liste JSON des modèles publiés (défilement infini de la galerie). Filtres : voir params.ts. */
export const GET = withRouteMetrics("/api/models", async (request) => {
  const filters = parseCatalogParams(new URL(request.url).searchParams);
  const page = await searchModels(db(), filters);
  return NextResponse.json(page, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
});
