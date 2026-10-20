"use server";

import { toggleFavorite } from "@/features/favorites/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { fail, type Result } from "@/lib/result";

/** Ajoute ou retire un favori ; l'interface l'affiche aussitôt (mise à jour optimiste). */
export async function toggleFavoriteAction(
  modelId: unknown,
): Promise<Result<{ favorited: boolean; favoriteCount: number }>> {
  if (typeof modelId !== "string" || modelId.length === 0 || modelId.length > 64) {
    return fail("VALIDATION", "errors.validation");
  }
  return toggleFavorite(db(), await getCurrentUser(), modelId);
}
