import { parseCatalogParams } from "@/features/catalog/params";
import { POPULAR_WINDOW_DAYS, searchModels, type CatalogItem } from "@/features/catalog/search";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const HOME_LATEST_COUNT = 8;
export const HOME_POPULAR_COUNT = 4;

export type HomeData = { latest: CatalogItem[]; popular: CatalogItem[] };

const search = (prisma: PrismaClient, sort: string, limit: number, now: Date) =>
  searchModels(prisma, parseCatalogParams({ sort, limit: String(limit) }), now).then(
    (page) => page.items,
  );

/**
 * Sections de l'accueil. « Populaires cette semaine » : téléchargements comptés sur 7 jours ;
 * sans aucun téléchargement récent, repli sur le total des téléchargements ; sans aucun
 * téléchargement du tout, modèles récents absents de « Derniers modèles » (section masquée
 * s'il n'en reste aucun).
 */
export async function getHomeData(prisma: PrismaClient, now: Date = new Date()): Promise<HomeData> {
  const latest = await search(prisma, "recent", HOME_LATEST_COUNT, now);
  if (latest.length === 0) return { latest, popular: [] };
  return { latest, popular: await popularModels(prisma, latest, now) };
}

async function popularModels(
  prisma: PrismaClient,
  latest: CatalogItem[],
  now: Date,
): Promise<CatalogItem[]> {
  const since = new Date(now.getTime() - POPULAR_WINDOW_DAYS * 24 * 3600 * 1000);
  const recentDownload = await prisma.download.findFirst({
    where: {
      counted: true,
      createdAt: { gte: since },
      model: { status: "PUBLISHED", deletedAt: null },
    },
    select: { id: true },
  });
  if (recentDownload) return search(prisma, "popular", HOME_POPULAR_COUNT, now);

  const byDownloads = await search(prisma, "downloads", HOME_POPULAR_COUNT, now);
  if (byDownloads.some((item) => item.downloadCount > 0)) return byDownloads;

  if (latest.length < HOME_LATEST_COUNT) return [];
  const shown = new Set(latest.map((item) => item.id));
  const more = await search(prisma, "recent", HOME_LATEST_COUNT + HOME_POPULAR_COUNT, now);
  return more.filter((item) => !shown.has(item.id)).slice(0, HOME_POPULAR_COUNT);
}
