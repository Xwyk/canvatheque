import { LICENSE_GROUPS, type LicenseValue } from "@/features/models/licenses";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import { MAX_TAGS, normalizeTags } from "@/lib/tags";

/**
 * Filtres du catalogue, partagés par la galerie (URL), `GET /api/models` et le serveur.
 * Format d'URL : `q`, `format` (cwprj|svg), `category` (slug), `license` (free|noncommercial|
 * personal), `tag`, `sort`, `cursor` ; les filtres multiples sont répétés (`format=svg&format=cwprj`).
 */

export const SORTS = ["relevance", "recent", "popular", "downloads"] as const;
export type CatalogSort = (typeof SORTS)[number];
export const FORMATS = ["cwprj", "svg"] as const;
export const LICENSE_GROUP_KEYS = ["free", "noncommercial", "personal"] as const;
export type LicenseGroup = (typeof LICENSE_GROUP_KEYS)[number];

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;

export type CatalogFilters = {
  q: string;
  formats: ("cwprj" | "svg")[];
  categories: string[];
  licenses: LicenseGroup[];
  tags: string[];
  sort: CatalogSort;
  cursor: string | null;
  limit: number;
};

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function all(input: SearchParamsInput, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const value = input[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const unique = <T extends string>(values: T[]) => [...new Set(values)];
const slugPattern = /^[a-z0-9-]{1,80}$/;

/** Lit les filtres d'une URL ; les valeurs inconnues sont ignorées (jamais d'erreur). */
export function parseCatalogParams(input: SearchParamsInput): CatalogFilters {
  const q = (all(input, "q")[0] ?? "").trim().slice(0, 100);
  const sortValue = all(input, "sort")[0];
  const known = (SORTS as readonly string[]).includes(sortValue ?? "");
  // La pertinence n'a de sens qu'avec une recherche.
  let sort: CatalogSort = known ? (sortValue as CatalogSort) : q ? "relevance" : "recent";
  if (sort === "relevance" && !q) sort = "recent";
  const limit = Number.parseInt(all(input, "limit")[0] ?? "", 10);
  return {
    q,
    formats: unique(
      all(input, "format").filter((f): f is "cwprj" | "svg" =>
        (FORMATS as readonly string[]).includes(f),
      ),
    ),
    categories: unique(all(input, "category").filter((c) => slugPattern.test(c))).slice(0, 20),
    licenses: unique(
      all(input, "license").filter((l): l is LicenseGroup =>
        (LICENSE_GROUP_KEYS as readonly string[]).includes(l),
      ),
    ),
    tags: normalizeTags(all(input, "tag")).slice(0, MAX_TAGS),
    sort,
    cursor: all(input, "cursor")[0] ?? null,
    limit: Number.isFinite(limit) ? Math.min(MAX_PAGE_SIZE, Math.max(1, limit)) : PAGE_SIZE,
  };
}

/**
 * Paramètres d'URL des filtres (sans curseur ni taille de page), dans un ordre stable.
 * `sort` est omis quand il vaut la valeur par défaut.
 */
export function catalogSearchParams(
  filters: Pick<CatalogFilters, "q" | "formats" | "categories" | "licenses" | "tags" | "sort">,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const format of filters.formats) params.append("format", format);
  for (const category of filters.categories) params.append("category", category);
  for (const license of filters.licenses) params.append("license", license);
  for (const tag of filters.tags) params.append("tag", tag);
  const defaultSort = filters.q ? "relevance" : "recent";
  if (filters.sort !== defaultSort) params.set("sort", filters.sort);
  return params;
}

export function activeFilterCount(filters: CatalogFilters): number {
  return (
    filters.formats.length +
    filters.categories.length +
    filters.licenses.length +
    filters.tags.length
  );
}

export const formatEnum = (format: "cwprj" | "svg"): ModelFormat =>
  format === "svg" ? "SVG" : "CWPRJ";

export function licensesOf(groups: LicenseGroup[]): LicenseValue[] {
  return groups.flatMap((group) => [...LICENSE_GROUPS[group]]);
}
