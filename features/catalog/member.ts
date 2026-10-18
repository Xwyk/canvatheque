import { listAuthorModels } from "@/features/catalog/model-page";
import type { CatalogItem } from "@/features/catalog/search";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/** Nombre maximal de modèles affichés sur un profil public. */
export const MEMBER_MODELS_LIMIT = 48;

export type MemberProfile = {
  pseudo: string;
  pseudoSlug: string;
  bio: string | null;
  /** Adresse http(s) uniquement (sinon null). */
  website: string | null;
  createdAt: Date;
  stats: { models: number; downloads: number };
  models: CatalogItem[];
};

function safeWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Profil public : introuvable pour le compte système et les comptes bannis. */
export async function getMemberProfile(
  prisma: PrismaClient,
  pseudoSlug: string,
): Promise<MemberProfile | null> {
  const user = await prisma.user.findUnique({
    where: { pseudoSlug },
    select: {
      id: true,
      pseudo: true,
      pseudoSlug: true,
      bio: true,
      website: true,
      createdAt: true,
      isSystem: true,
      bannedAt: true,
    },
  });
  if (!user || user.isSystem || user.bannedAt) return null;

  const [models, totals] = await Promise.all([
    listAuthorModels(prisma, user.id, { limit: MEMBER_MODELS_LIMIT }),
    prisma.model.aggregate({
      where: { authorId: user.id, status: "PUBLISHED", deletedAt: null },
      _count: { _all: true },
      _sum: { downloadCount: true },
    }),
  ]);

  return {
    pseudo: user.pseudo,
    pseudoSlug: user.pseudoSlug,
    bio: user.bio?.trim() || null,
    website: safeWebsite(user.website),
    createdAt: user.createdAt,
    stats: { models: totals._count._all, downloads: totals._sum.downloadCount ?? 0 },
    models,
  };
}
