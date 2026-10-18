import type { PrismaClient } from "@/lib/generated/prisma/client";

export async function getCategories(prisma: PrismaClient) {
  return prisma.category.findMany({
    orderBy: { order: "asc" },
    select: { slug: true, name: true, color: true, icon: true },
  });
}

/** Tags les plus utilisés par des modèles publiés (hors modèles supprimés). */
export async function getPopularTagNames(prisma: PrismaClient, limit = 4): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT t."name"
    FROM "Tag" t
    JOIN "ModelTag" mt ON mt."tagId" = t."id"
    JOIN "Model" m ON m."id" = mt."modelId"
    WHERE m."status" = 'PUBLISHED' AND m."deletedAt" IS NULL
    GROUP BY t."id", t."name"
    ORDER BY COUNT(*) DESC, t."name" ASC
    LIMIT ${limit}`;
  return rows.map((row) => row.name);
}

/** Complète les tags populaires par des suggestions éditoriales tant que le catalogue est jeune. */
export function withFallbackSuggestions(
  popular: string[],
  fallback: string[],
  limit = 4,
): string[] {
  const seen = new Set(popular.map((name) => name.toLowerCase()));
  const extra = fallback.filter((name) => !seen.has(name.toLowerCase()));
  return [...popular, ...extra].slice(0, limit);
}
