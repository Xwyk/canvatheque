import { NextResponse } from "next/server";
import { parseCatalogParams } from "@/features/catalog/params";
import { searchModels } from "@/features/catalog/search";
import { withFavorites } from "@/features/favorites/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { withRouteMetrics } from "@/lib/metrics";

/** Liste JSON des modèles publiés (défilement infini de la galerie). Filtres : voir params.ts. */
export const GET = withRouteMetrics("/api/models", async (request) => {
  const filters = parseCatalogParams(new URL(request.url).searchParams);
  const page = await searchModels(db(), filters);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        // Réponse différente pour un membre connecté : jamais servie depuis un cache partagé.
        Vary: "Cookie",
      },
    });
  }
  // Membre connecté : cœurs des favoris renseignés, réponse personnelle (pas de cache partagé).
  const items = await withFavorites(db(), user.id, page.items);
  return NextResponse.json(
    { ...page, items },
    {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
});
