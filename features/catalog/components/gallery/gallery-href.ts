import {
  catalogSearchParams,
  type CatalogFilters,
  type CatalogSort,
} from "@/features/catalog/params";

/** Filtres reflétés dans l'URL de la galerie (sans curseur ni taille de page). */
export type GalleryFilters = Pick<
  CatalogFilters,
  "q" | "formats" | "categories" | "licenses" | "tags" | "sort"
>;

export const EMPTY_FACETS = {
  formats: [],
  categories: [],
  licenses: [],
  tags: [],
} satisfies Partial<GalleryFilters>;

/**
 * URL de la galerie pour ces filtres. Sur `/categories/[slug]` (`locked`), on reste sur la
 * page de la catégorie tant qu'elle est la seule cochée ; sinon, retour à `/models`.
 */
export function galleryHref(filters: GalleryFilters, locked?: string | null): string {
  const onCategory =
    !!locked && filters.categories.length === 1 && filters.categories[0] === locked;
  const path = onCategory ? `/categories/${locked}` : "/models";
  const query = catalogSearchParams(onCategory ? { ...filters, categories: [] } : filters);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** Ajoute ou retire une valeur d'une liste de filtres. */
export function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Tri après une nouvelle recherche : pertinence avec des mots, sinon le tri choisi. */
export function sortAfterSearch(q: string, current: CatalogSort): CatalogSort {
  if (q) return "relevance";
  return current === "relevance" ? "recent" : current;
}

/** Vrai si l'URL porte autre chose que la page de base (recherche, filtres, tri). */
export function isRefined(filters: GalleryFilters, locked?: string | null): boolean {
  return galleryHref(filters, locked).includes("?");
}

/** Ne garde que les filtres d'URL (sans curseur ni taille de page). */
export function pickGalleryFilters({
  q,
  formats,
  categories,
  licenses,
  tags,
  sort,
}: GalleryFilters): GalleryFilters {
  return { q, formats, categories, licenses, tags, sort };
}
