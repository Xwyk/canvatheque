import type { CatalogFilters } from "@/features/catalog/params";
import { searchModels, type CatalogItem } from "@/features/catalog/search";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type CategoryWithCount = {
  slug: string;
  name: string;
  color: string;
  icon: string;
  count: number;
};

/** Catégories dans l'ordre de référence, avec le nombre de modèles publiés de chacune. */
export async function getCategoriesWithCounts(prisma: PrismaClient): Promise<CategoryWithCount[]> {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    select: {
      slug: true,
      name: true,
      color: true,
      icon: true,
      _count: { select: { models: { where: { status: "PUBLISHED", deletedAt: null } } } },
    },
  });
  return categories.map(({ _count, ...category }) => ({ ...category, count: _count.models }));
}

export type GalleryPage = { items: CatalogItem[]; nextCursor: string | null; total: number };

/**
 * Page de galerie rendue par le serveur. Avec un curseur (lien « Charger plus » sans
 * JavaScript), le total est calculé à part : `searchModels` ne le donne qu'en première page.
 */
export async function loadGalleryPage(
  prisma: PrismaClient,
  filters: CatalogFilters,
): Promise<GalleryPage> {
  const [page, first] = await Promise.all([
    searchModels(prisma, filters),
    filters.cursor ? searchModels(prisma, { ...filters, cursor: null, limit: 1 }) : null,
  ]);
  return {
    items: page.items,
    nextCursor: page.nextCursor,
    total: (first ?? page).total ?? page.items.length,
  };
}
