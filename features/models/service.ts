import type { S3Client } from "@aws-sdk/client-s3";
import type { ModelDetails } from "@/features/models/schemas";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { License, ModelFormat, ModelStatus } from "@/lib/generated/prisma/enums";
import { logger } from "@/lib/logger";
import { can, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import { markdownToText } from "@/lib/security/markdown";
import { slugify } from "@/lib/slug";
import { deleteObjects, listKeys } from "@/lib/storage/objects";
import { previewInfo, type PreviewInfo } from "@/lib/storage/previews";
import { normalizeTags } from "@/lib/tags";

/**
 * Cycle de vie d'un modèle (brouillon, publication, modification, suppression),
 * indépendant de Next.js : base, stockage et horloge injectés.
 */

export type ModelDeps = {
  prisma: PrismaClient;
  s3: S3Client;
  buckets: { models: string; previews: string };
  maxFileBytes: number;
  maxModels: number;
  now?: () => Date;
};

export type ModelActor = NonNullable<Actor> & { pseudo: string };

export const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** Données d'un modèle pour l'assistant de publication (sérialisables vers le client). */
export type EditableModel = {
  id: string;
  slug: string;
  status: ModelStatus;
  format: ModelFormat;
  fileName: string | null;
  fileSize: number | null;
  title: string;
  description: string;
  categoryId: string | null;
  license: License | null;
  tags: string[];
  preview: PreviewInfo | null;
  previewCustom: boolean;
  publishedAt: string | null;
  updatedAt: string;
  authorPseudo: string;
};

export const EDITABLE_SELECT = {
  id: true,
  slug: true,
  status: true,
  format: true,
  fileName: true,
  fileSize: true,
  title: true,
  description: true,
  categoryId: true,
  license: true,
  previewKey: true,
  previewWidth: true,
  previewHeight: true,
  previewCustom: true,
  publishedAt: true,
  updatedAt: true,
  authorId: true,
  author: { select: { pseudo: true } },
  tags: { select: { tag: { select: { name: true } } }, orderBy: { tag: { name: "asc" } } },
} as const;

type EditableRow = {
  id: string;
  slug: string;
  status: ModelStatus;
  format: ModelFormat;
  fileName: string | null;
  fileSize: number | null;
  title: string;
  description: string;
  categoryId: string | null;
  license: License | null;
  previewKey: string | null;
  previewWidth: number | null;
  previewHeight: number | null;
  previewCustom: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  author: { pseudo: string };
  tags: { tag: { name: string } }[];
};

export function toEditable(row: EditableRow): EditableModel {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    format: row.format,
    fileName: row.fileName,
    fileSize: row.fileSize,
    title: row.title,
    description: row.description,
    categoryId: row.categoryId,
    license: row.license,
    tags: row.tags.map(({ tag }) => tag.name),
    preview: previewInfo(row),
    previewCustom: row.previewCustom,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    authorPseudo: row.author.pseudo,
  };
}

/** Modèle modifiable par l'acteur (propriétaire ou administrateur), sinon null. */
export async function getEditableModel(
  prisma: PrismaClient,
  actor: Actor,
  slug: string,
): Promise<EditableModel | null> {
  const row = await prisma.model.findFirst({
    where: { slug, deletedAt: null },
    select: EDITABLE_SELECT,
  });
  if (!row || !can(actor, "model:update", { ownerId: row.authorId, status: row.status })) {
    return null;
  }
  return toEditable(row);
}

/** Modèle non supprimé sur lequel l'acteur peut agir. */
export async function findActionableModel(
  prisma: PrismaClient,
  actor: Actor,
  modelId: string,
  action: "model:update" | "model:delete" = "model:update",
) {
  const model = await prisma.model.findFirst({ where: { id: modelId, deletedAt: null } });
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  if (!can(actor, action, { ownerId: model.authorId, status: model.status })) {
    return fail("FORBIDDEN", "errors.forbidden");
  }
  return ok(model);
}

/** Nombre de modèles (brouillons compris, hors supprimés) comptant dans le quota. */
export function countActiveModels(prisma: PrismaClient, authorId: string): Promise<number> {
  return prisma.model.count({ where: { authorId, deletedAt: null } });
}

export function canCreateModel(deps: ModelDeps, actor: Actor, modelCount: number): boolean {
  return can(actor, "model:create", { modelCount, maxModels: deps.maxModels });
}

/** Slug libre dérivé du titre (« papillon-ajoure », puis « papillon-ajoure-2 »…). */
export async function uniqueSlug(
  prisma: PrismaClient,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title, 60) || "modele";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const existing = await prisma.model.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Texte dénormalisé source de la recherche plein texte (titre, description, tags, pseudo). */
export function buildSearchText(
  title: string,
  description: string,
  tags: readonly string[],
  authorPseudo: string,
): string {
  return [title, markdownToText(description), tags.join(" "), authorPseudo]
    .filter(Boolean)
    .join(" ")
    .slice(0, 10_000);
}

// --- Brouillon et informations -------------------------------------------------------------

export async function saveModelDetails(
  deps: ModelDeps,
  actor: ModelActor,
  input: ModelDetails,
): Promise<Result<{ updatedAt: string; tags: string[] }>> {
  const found = await findActionableModel(deps.prisma, actor, input.modelId);
  if (!found.ok) return found;
  const model = found.data;

  // Un modèle publié (ou masqué) doit rester complet.
  if (model.status !== "DRAFT") {
    const fields: Record<string, string> = {};
    if (!input.categoryId) fields.categoryId = "category";
    if (!input.license) fields.license = "license";
    if (Object.keys(fields).length > 0) return fail("VALIDATION", "errors.validation", { fields });
  }
  if (input.categoryId) {
    const category = await deps.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      return fail("VALIDATION", "errors.validation", { fields: { categoryId: "category" } });
    }
  }

  const tags = normalizeTags(input.tags);
  const author = await deps.prisma.user.findUniqueOrThrow({
    where: { id: model.authorId },
    select: { pseudo: true },
  });
  const updated = await deps.prisma.$transaction(async (tx) => {
    const tagIds: string[] = [];
    for (const name of tags) {
      const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
      tagIds.push(tag.id);
    }
    await tx.modelTag.deleteMany({ where: { modelId: model.id } });
    if (tagIds.length > 0) {
      await tx.modelTag.createMany({ data: tagIds.map((tagId) => ({ modelId: model.id, tagId })) });
    }
    return tx.model.update({
      where: { id: model.id },
      data: {
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        license: input.license,
        searchText: buildSearchText(input.title, input.description, tags, author.pseudo),
      },
      select: { updatedAt: true },
    });
  });
  return ok({ updatedAt: updated.updatedAt.toISOString(), tags });
}

// --- Publication -------------------------------------------------------------------------

export async function publishModel(
  deps: ModelDeps,
  actor: ModelActor,
  modelId: string,
): Promise<Result<{ slug: string }>> {
  const found = await findActionableModel(deps.prisma, actor, modelId);
  if (!found.ok) return found;
  const model = found.data;

  if (model.status === "HIDDEN") return fail("FORBIDDEN", "errors.publish.hidden");
  if (model.status === "PUBLISHED") return ok({ slug: model.slug });
  if (!can(actor, "model:publish", { ownerId: model.authorId })) {
    return fail("FORBIDDEN", "errors.publish.unverified");
  }

  const fields: Record<string, string> = {};
  if (!model.fileKey) fields.file = "fileRequired";
  if (!model.previewKey) fields.preview = "previewRequired";
  if (!model.categoryId) fields.categoryId = "category";
  if (!model.license) fields.license = "license";
  if (Object.keys(fields).length > 0) {
    return fail("VALIDATION", "errors.publish.incomplete", { fields });
  }

  const slug = model.publishedAt
    ? model.slug
    : await uniqueSlug(deps.prisma, model.title, model.id);
  const updated = await deps.prisma.model.update({
    where: { id: model.id },
    data: { status: "PUBLISHED", slug, publishedAt: model.publishedAt ?? clock(deps) },
    select: { slug: true },
  });
  logger.info({ event: "model_published", modelId: model.id }, "Modèle publié");
  return ok({ slug: updated.slug });
}

export async function unpublishModel(
  deps: ModelDeps,
  actor: ModelActor,
  modelId: string,
): Promise<Result<{ slug: string }>> {
  const found = await findActionableModel(deps.prisma, actor, modelId);
  if (!found.ok) return found;
  if (found.data.status !== "PUBLISHED") return ok({ slug: found.data.slug });
  const updated = await deps.prisma.model.update({
    where: { id: modelId },
    data: { status: "DRAFT" },
    select: { slug: true },
  });
  return ok({ slug: updated.slug });
}

// --- Suppression -------------------------------------------------------------------------

/** Supprime les objets d'un modèle (fichier, aperçus, envois en attente). Erreurs journalisées. */
export async function purgeModelObjects(
  deps: Pick<ModelDeps, "s3" | "buckets">,
  model: { id: string; fileKey: string | null },
  pendingUploads: { kind: "MODEL" | "PREVIEW"; key: string }[] = [],
): Promise<void> {
  try {
    const previews = await listKeys(deps.s3, deps.buckets.previews, `${model.id}/`);
    await deleteObjects(deps.s3, deps.buckets.previews, [
      ...previews,
      ...pendingUploads.filter((u) => u.kind === "PREVIEW").map((u) => u.key),
    ]);
    await deleteObjects(deps.s3, deps.buckets.models, [
      ...(model.fileKey ? [model.fileKey] : []),
      ...pendingUploads.filter((u) => u.kind === "MODEL").map((u) => u.key),
    ]);
  } catch (error) {
    logger.error({ event: "storage_cleanup_failed", modelId: model.id, err: error }, "Purge MinIO");
  }
}

/** Suppression logique du modèle puis effacement de ses objets dans MinIO. */
export async function deleteModel(
  deps: ModelDeps,
  actor: ModelActor,
  modelId: string,
): Promise<Result<{ title: string }>> {
  const found = await findActionableModel(deps.prisma, actor, modelId, "model:delete");
  if (!found.ok) return found;
  const model = found.data;

  const pending = await deps.prisma.upload.findMany({
    where: { modelId, status: "PENDING" },
    select: { kind: true, key: true },
  });
  await deps.prisma.$transaction([
    deps.prisma.model.update({ where: { id: modelId }, data: { deletedAt: clock(deps) } }),
    deps.prisma.upload.updateMany({
      where: { modelId, status: "PENDING" },
      data: { status: "ABANDONED" },
    }),
  ]);
  await purgeModelObjects(deps, model, pending);
  logger.info({ event: "model_deleted", modelId }, "Modèle supprimé");
  return ok({ title: model.title });
}

// --- Lectures ------------------------------------------------------------------------------

export type MyModel = {
  id: string;
  slug: string;
  title: string;
  status: ModelStatus;
  format: ModelFormat;
  preview: PreviewInfo | null;
  downloadCount: number;
  updatedAt: string;
  hiddenReason: string | null;
};

export async function listMyModels(prisma: PrismaClient, authorId: string): Promise<MyModel[]> {
  const rows = await prisma.model.findMany({
    where: { authorId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      format: true,
      previewKey: true,
      previewWidth: true,
      previewHeight: true,
      downloadCount: true,
      updatedAt: true,
      hiddenReason: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    format: row.format,
    preview: previewInfo(row),
    downloadCount: row.downloadCount,
    updatedAt: row.updatedAt.toISOString(),
    hiddenReason: row.hiddenReason,
  }));
}

/** Suggestions de mots-clés par préfixe, les plus utilisés d'abord. */
export async function suggestTags(prisma: PrismaClient, prefix: string, limit = 8) {
  if (prefix.length < 1) return [];
  const rows = await prisma.tag.findMany({
    where: { name: { startsWith: prefix } },
    orderBy: [{ models: { _count: "desc" } }, { name: "asc" }],
    take: limit,
    select: { name: true },
  });
  return rows.map((row) => row.name);
}
