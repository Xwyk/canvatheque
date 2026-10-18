import {
  formatEnum,
  licensesOf,
  type CatalogFilters,
  type CatalogSort,
} from "@/features/catalog/params";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { previewInfo, type PreviewInfo } from "@/lib/storage/previews";

/**
 * Recherche du catalogue (ADR-005, ADR-007) : modèles publiés uniquement, plein texte
 * `french_unaccent` (accents et pluriels), filtres cumulés, tri stable par curseur
 * (valeur de tri, id) décroissants.
 */

/** Carte de modèle du catalogue (sérialisable : API JSON et composants client). */
export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  format: ModelFormat;
  preview: PreviewInfo | null;
  authorPseudo: string;
  authorSlug: string;
  downloadCount: number;
};

export type CatalogPage = {
  items: CatalogItem[];
  nextCursor: string | null;
  /** Nombre total de résultats, calculé pour la première page seulement. */
  total: number | null;
};

/** Fenêtre de « Populaires cette semaine » (téléchargements comptés). */
export const POPULAR_WINDOW_DAYS = 7;

type Row = {
  id: string;
  slug: string;
  title: string;
  format: ModelFormat;
  previewKey: string | null;
  previewWidth: number | null;
  previewHeight: number | null;
  downloadCount: number;
  pseudo: string;
  pseudoSlug: string;
  sort_value: string;
};

function sortExpression(sort: CatalogSort, query: Prisma.Sql | null, since: Date): Prisma.Sql {
  switch (sort) {
    case "relevance":
      // Score arrondi : comparable exactement d'une page à l'autre.
      return Prisma.sql`round(ts_rank(m."searchVector", ${query!})::numeric, 6)`;
    case "downloads":
      return Prisma.sql`m."downloadCount"`;
    case "popular":
      return Prisma.sql`(SELECT COUNT(*) FROM "Download" d
        WHERE d."modelId" = m."id" AND d."counted" AND d."createdAt" >= ${since})::int`;
    default:
      return Prisma.sql`m."publishedAt"`;
  }
}

/** Conversion SQL de la valeur de curseur selon le tri. */
function cursorValue(sort: CatalogSort, value: string): Prisma.Sql {
  // Colonne « timestamp(3) » sans fuseau, en UTC (convention Prisma).
  if (sort === "recent") return Prisma.sql`${value}::timestamp(3)`;
  if (sort === "relevance") return Prisma.sql`${value}::numeric`;
  return Prisma.sql`${value}::int`;
}

function whereClause(filters: CatalogFilters, query: Prisma.Sql | null): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`m."status" = 'PUBLISHED'`,
    Prisma.sql`m."deletedAt" IS NULL`,
  ];
  if (query) conditions.push(Prisma.sql`m."searchVector" @@ ${query}`);
  if (filters.formats.length > 0) {
    const formats = filters.formats.map(formatEnum);
    conditions.push(Prisma.sql`m."format"::text = ANY(${formats})`);
  }
  if (filters.categories.length > 0) {
    conditions.push(
      Prisma.sql`m."categoryId" IN (SELECT c."id" FROM "Category" c WHERE c."slug" = ANY(${filters.categories}))`,
    );
  }
  if (filters.licenses.length > 0) {
    conditions.push(Prisma.sql`m."license"::text = ANY(${licensesOf(filters.licenses)})`);
  }
  // Mots-clés cumulés : le modèle doit les porter tous.
  for (const tag of filters.tags) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "ModelTag" mt JOIN "Tag" t ON t."id" = mt."tagId"
      WHERE mt."modelId" = m."id" AND t."name" = ${tag})`);
  }
  return Prisma.join(conditions, " AND ");
}

export async function searchModels(
  prisma: PrismaClient,
  filters: CatalogFilters,
  now: Date = new Date(),
): Promise<CatalogPage> {
  const query = filters.q
    ? Prisma.sql`websearch_to_tsquery('french_unaccent', ${filters.q})`
    : null;
  const since = new Date(now.getTime() - POPULAR_WINDOW_DAYS * 24 * 3600 * 1000);
  const where = whereClause(filters, query);
  const sortValue = sortExpression(filters.sort, query, since);
  const cursor = decodeCursor(filters.cursor);
  const after = cursor
    ? Prisma.sql`WHERE (s."sort_value", s."id") < (${cursorValue(filters.sort, cursor.value)}, ${cursor.id})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT * FROM (
      SELECT m."id", m."slug", m."title", m."format", m."previewKey", m."previewWidth",
             m."previewHeight", m."downloadCount", u."pseudo", u."pseudoSlug",
             ${sortValue} AS "sort_value"
      FROM "Model" m JOIN "User" u ON u."id" = m."authorId"
      WHERE ${where}
    ) s
    ${after}
    ORDER BY s."sort_value" DESC NULLS LAST, s."id" DESC
    LIMIT ${filters.limit + 1}`;

  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > filters.limit && last
      ? encodeCursor({ value: serializeSortValue(last.sort_value), id: last.id })
      : null;

  let total: number | null = null;
  if (!cursor) {
    const [count] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count" FROM "Model" m WHERE ${where}`;
    total = count?.count ?? 0;
  }

  return { items: page.map(toItem), nextCursor, total };
}

function serializeSortValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toItem(row: Row): CatalogItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    format: row.format,
    preview: previewInfo(row),
    authorPseudo: row.pseudo,
    authorSlug: row.pseudoSlug,
    downloadCount: row.downloadCount,
  };
}
