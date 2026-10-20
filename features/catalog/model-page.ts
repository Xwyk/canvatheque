import type { CatalogItem } from "@/features/catalog/search";
import { absoluteUrl } from "@/features/catalog/seo";
import { formatFileSize } from "@/lib/format";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { License, ModelFormat, ModelStatus } from "@/lib/generated/prisma/enums";
import { can, type Actor } from "@/lib/permissions";
import { markdownToText, renderMarkdown } from "@/lib/security/markdown";
import { previewInfo, type PreviewInfo } from "@/lib/storage/previews";

/** Données de la fiche `/models/[slug]` (composant serveur, sérialisables). */
export type ModelPageData = {
  model: {
    id: string;
    slug: string;
    title: string;
    format: ModelFormat;
    status: ModelStatus;
    hiddenReason: string | null;
    license: License | null;
    downloadCount: number;
    publishedAt: Date | null;
    updatedAt: Date;
    /** Taille lisible (« 184 Ko ») ; null tant qu'aucun fichier n'est confirmé. */
    fileSizeLabel: string | null;
    categoryId: string | null;
  };
  author: {
    id: string;
    pseudo: string;
    pseudoSlug: string;
    /** Faux pour le compte système et les comptes bannis (pas de profil public). */
    hasProfile: boolean;
  };
  category: { slug: string; name: string } | null;
  tags: string[];
  /** HTML nettoyé (liste blanche DOMPurify). */
  descriptionHtml: string;
  descriptionText: string;
  preview: PreviewInfo | null;
  canEdit: boolean;
  /** Administrateur : masquer, réafficher, supprimer depuis la fiche. */
  canModerate: boolean;
  /** Pilule « Signaler » : modèle publié, pas celui de l'acteur (visiteur : modale). */
  canReport: boolean;
};

/**
 * Fiche d'un modèle : publiée pour tous ; brouillon ou masquée pour l'auteur et les
 * administrateurs seulement ; supprimée pour personne (null → 404).
 */
export async function getModelPage(
  prisma: PrismaClient,
  actor: Actor,
  slug: string,
): Promise<ModelPageData | null> {
  const model = await prisma.model.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      format: true,
      status: true,
      hiddenReason: true,
      license: true,
      downloadCount: true,
      publishedAt: true,
      updatedAt: true,
      fileSize: true,
      fileKey: true,
      previewKey: true,
      previewWidth: true,
      previewHeight: true,
      categoryId: true,
      author: {
        select: { id: true, pseudo: true, pseudoSlug: true, isSystem: true, bannedAt: true },
      },
      category: { select: { slug: true, name: true } },
      tags: { select: { tag: { select: { name: true } } }, orderBy: { tag: { name: "asc" } } },
    },
  });
  if (!model) return null;
  const resource = { ownerId: model.author.id, status: model.status };
  if (!can(actor, "model:view", resource)) return null;

  const { author } = model;
  return {
    model: {
      id: model.id,
      slug: model.slug,
      title: model.title,
      format: model.format,
      status: model.status,
      hiddenReason: model.hiddenReason,
      license: model.license,
      downloadCount: model.downloadCount,
      publishedAt: model.publishedAt,
      updatedAt: model.updatedAt,
      fileSizeLabel:
        model.fileKey && model.fileSize !== null ? formatFileSize(model.fileSize) : null,
      categoryId: model.categoryId,
    },
    author: {
      id: author.id,
      pseudo: author.pseudo,
      pseudoSlug: author.pseudoSlug,
      hasProfile: !author.isSystem && author.bannedAt === null,
    },
    category: model.category,
    tags: model.tags.map(({ tag }) => tag.name),
    descriptionHtml: model.description ? renderMarkdown(model.description) : "",
    descriptionText: model.description ? markdownToText(model.description) : "",
    preview: previewInfo(model),
    canEdit: can(actor, "model:update", { ownerId: author.id }),
    canModerate: can(actor, "model:hide"),
    canReport: model.status === "PUBLISHED" && actor?.id !== author.id,
  };
}

type ItemRow = {
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
};

function itemFrom(row: ItemRow): CatalogItem {
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

/**
 * « Dans le même esprit » : modèles publiés partageant la catégorie ou des mots-clés,
 * classés par nombre de mots-clés communs, même catégorie, puis téléchargements.
 */
export async function getSimilarModels(
  prisma: PrismaClient,
  model: { id: string; categoryId: string | null },
  limit = 4,
): Promise<CatalogItem[]> {
  const sameCategory = model.categoryId
    ? Prisma.sql`m."categoryId" = ${model.categoryId}`
    : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<ItemRow[]>`
    SELECT * FROM (
      SELECT m."id", m."slug", m."title", m."format", m."previewKey", m."previewWidth",
             m."previewHeight", m."downloadCount", u."pseudo", u."pseudoSlug",
             (SELECT COUNT(*) FROM "ModelTag" mt
               WHERE mt."modelId" = m."id"
                 AND mt."tagId" IN (SELECT o."tagId" FROM "ModelTag" o WHERE o."modelId" = ${model.id})
             )::int AS "shared",
             COALESCE(${sameCategory}, FALSE) AS "same_category"
      FROM "Model" m JOIN "User" u ON u."id" = m."authorId"
      WHERE m."status" = 'PUBLISHED' AND m."deletedAt" IS NULL AND m."id" <> ${model.id}
    ) s
    WHERE s."shared" > 0 OR s."same_category"
    ORDER BY s."shared" DESC, s."same_category" DESC, s."downloadCount" DESC, s."id" DESC
    LIMIT ${limit}`;
  return rows.map(itemFrom);
}

/** Sélection Prisma d'une carte du catalogue (voir `catalogItem`). */
export const itemSelect = {
  id: true,
  slug: true,
  title: true,
  format: true,
  previewKey: true,
  previewWidth: true,
  previewHeight: true,
  downloadCount: true,
  author: { select: { pseudo: true, pseudoSlug: true } },
} as const;

type ItemResult = Omit<ItemRow, "pseudo" | "pseudoSlug"> & {
  author: { pseudo: string; pseudoSlug: string };
};

/** Conversion d'un résultat Prisma (`itemSelect`) en carte du catalogue. */
export function catalogItem({ author, ...model }: ItemResult): CatalogItem {
  return itemFrom({ ...model, pseudo: author.pseudo, pseudoSlug: author.pseudoSlug });
}

/** Modèles publiés d'un auteur, du plus récent au plus ancien. */
export async function listAuthorModels(
  prisma: PrismaClient,
  authorId: string,
  { limit, excludeId }: { limit: number; excludeId?: string },
): Promise<CatalogItem[]> {
  const models = await prisma.model.findMany({
    where: {
      authorId,
      status: "PUBLISHED",
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: itemSelect,
  });
  return models.map(catalogItem);
}

/** « Autres modèles de {pseudo} » (hors modèle affiché). */
export function getAuthorModels(
  prisma: PrismaClient,
  model: { id: string; authorId: string },
  limit = 4,
): Promise<CatalogItem[]> {
  return listAuthorModels(prisma, model.authorId, { limit, excludeId: model.id });
}

/** Adresse des textes de licence Creative Commons (aucune pour l'usage personnel). */
export const LICENSE_URLS: Partial<Record<License, string>> = {
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  CC_BY: "https://creativecommons.org/licenses/by/4.0/",
  CC_BY_SA: "https://creativecommons.org/licenses/by-sa/4.0/",
  CC_BY_NC: "https://creativecommons.org/licenses/by-nc/4.0/",
  CC_BY_NC_SA: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

/** Résumé pour les métadonnées : texte coupé sur un mot, 160 caractères au plus. */
export function summarize(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  let end = space > max / 2 ? space : cut.length;
  // Ponctuation et espaces finaux retirés (boucle plutôt qu'une expression ancrée en fin).
  while (end > 0 && " ,;:.!?-".includes(cut.charAt(end - 1))) end -= 1;
  return `${cut.slice(0, end)}…`;
}

/** Données structurées schema.org (CreativeWork) de la fiche. */
export function modelJsonLd(data: ModelPageData, appUrl: string, description: string) {
  const { model, author, preview } = data;
  const absolute = (path: string) => absoluteUrl(path, appUrl);
  const license = model.license ? LICENSE_URLS[model.license] : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: model.title,
    description,
    url: absolute(`/models/${model.slug}`),
    ...(preview ? { image: preview.lg } : {}),
    author: {
      "@type": "Person",
      name: author.pseudo,
      ...(author.hasProfile ? { url: absolute(`/members/${author.pseudoSlug}`) } : {}),
    },
    ...(model.publishedAt ? { datePublished: model.publishedAt.toISOString() } : {}),
    dateModified: model.updatedAt.toISOString(),
    ...(license ? { license } : {}),
    ...(data.tags.length > 0 ? { keywords: data.tags.join(", ") } : {}),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/DownloadAction",
      userInteractionCount: model.downloadCount,
    },
  };
}
