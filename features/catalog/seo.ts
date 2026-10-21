import type { MetadataRoute } from "next";
import { CONTENT_PATHS } from "@/features/content/paths";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

/** Image Open Graph par défaut (public/og-default.png, scripts/generate-og-image.ts). */
export const DEFAULT_OG_IMAGE = { url: "/og-default.png", width: 1200, height: 630 } as const;

/** URL absolue d'un chemin du site (APP_URL), lue à la requête : jamais au build. */
export function absoluteUrl(path = "/", base: string = env().APP_URL): string {
  return new URL(path, base).toString();
}

/**
 * Sérialise des données structurées pour un `<script type="application/ld+json">` :
 * `<` échappé pour qu'aucune valeur ne puisse fermer la balise.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Entrées du plan du site : pages publiques fixes, catégories, modèles publiés non
 * supprimés et profils des membres (non bannis, non système) ayant au moins un modèle publié.
 */
export async function sitemapEntries(
  prisma: PrismaClient,
  base: string = env().APP_URL,
): Promise<MetadataRoute.Sitemap> {
  const published = { status: "PUBLISHED", deletedAt: null } as const;
  const [categories, models, members] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" }, select: { slug: true } }),
    prisma.model.findMany({
      where: published,
      orderBy: { publishedAt: "desc" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: { bannedAt: null, isSystem: false, models: { some: published } },
      orderBy: { pseudoSlug: "asc" },
      select: { pseudoSlug: true },
    }),
  ]);
  const url = (path: string) => absoluteUrl(path, base);
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/models"), changeFrequency: "daily", priority: 0.9 },
    { url: url("/categories"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/local"), changeFrequency: "monthly", priority: 0.4 },
    ...Object.values(CONTENT_PATHS).map((path) => ({
      url: url(path),
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    ...categories.map((category) => ({
      url: url(`/categories/${category.slug}`),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...models.map((model) => ({
      url: url(`/models/${model.slug}`),
      lastModified: model.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...members.map((member) => ({
      url: url(`/members/${member.pseudoSlug}`),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
