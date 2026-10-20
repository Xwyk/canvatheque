import { catalogItem, itemSelect } from "@/features/catalog/model-page";
import type { CatalogItem } from "@/features/catalog/search";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { can, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

/** Favoris : ajout ou retrait (compteur dénormalisé `favoriteCount` tenu dans la transaction). */
export async function toggleFavorite(
  prisma: PrismaClient,
  actor: Actor,
  modelId: string,
): Promise<Result<{ favorited: boolean; favoriteCount: number }>> {
  if (!actor || !can(actor, "favorite:toggle")) return fail("UNAUTHORIZED", "errors.unauthorized");
  const model = await prisma.model.findFirst({
    where: { id: modelId, deletedAt: null },
    select: { id: true, status: true, authorId: true },
  });
  if (!model || !can(actor, "model:view", { ownerId: model.authorId, status: model.status })) {
    return fail("NOT_FOUND", "errors.notFound");
  }

  const key = { userId_modelId: { userId: actor.id, modelId } };
  const existing = await prisma.favorite.findUnique({ where: key });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (existing) await tx.favorite.delete({ where: key });
      else await tx.favorite.create({ data: { userId: actor.id, modelId } });
      return tx.model.update({
        where: { id: modelId },
        data: { favoriteCount: { increment: existing ? -1 : 1 } },
        select: { favoriteCount: true },
      });
    });
    return ok({ favorited: !existing, favoriteCount: Math.max(0, updated.favoriteCount) });
  } catch {
    // Double clic concurrent : l'état réel fait foi.
    const now = await prisma.favorite.findUnique({ where: key });
    const count = await prisma.model.findUniqueOrThrow({
      where: { id: modelId },
      select: { favoriteCount: true },
    });
    return ok({ favorited: !!now, favoriteCount: count.favoriteCount });
  }
}

/** Marque les cartes favorites du membre (aucune requête pour un visiteur). */
export async function withFavorites<T extends { id: string }>(
  prisma: PrismaClient,
  userId: string | null | undefined,
  items: T[],
): Promise<(T & { favorited: boolean })[]> {
  if (!userId || items.length === 0) return items.map((item) => ({ ...item, favorited: false }));
  const rows = await prisma.favorite.findMany({
    where: { userId, modelId: { in: items.map((item) => item.id) } },
    select: { modelId: true },
  });
  const favorites = new Set(rows.map((row) => row.modelId));
  return items.map((item) => ({ ...item, favorited: favorites.has(item.id) }));
}

export const FAVORITES_LIMIT = 96;

/** « Mes favoris » : modèles publiés, du plus récemment ajouté au plus ancien. */
export async function listFavorites(prisma: PrismaClient, userId: string): Promise<CatalogItem[]> {
  const rows = await prisma.favorite.findMany({
    where: { userId, model: { status: "PUBLISHED", deletedAt: null } },
    orderBy: [{ createdAt: "desc" }, { modelId: "desc" }],
    take: FAVORITES_LIMIT,
    select: { model: { select: itemSelect } },
  });
  return rows.map(({ model }) => ({ ...catalogItem(model), favorited: true }));
}
