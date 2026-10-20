import type { S3Client } from "@aws-sdk/client-s3";
import { ensureSystemUser } from "@/features/account/bootstrap";
import { buildSearchText } from "@/features/models/service";
import { verifyPassword } from "@/lib/auth/password";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { Mailer } from "@/lib/mail/mailer";
import { accountDeletedNotice } from "@/lib/mail/templates";
import { fail, ok, type Result } from "@/lib/result";
import { deleteObjects, listKeys } from "@/lib/storage/objects";

/**
 * Données personnelles (RGPD, étape 6) : export JSON et suppression du compte, indépendants
 * de Next.js (base, stockage et e-mails injectés).
 */

export type AccountDeps = {
  prisma: PrismaClient;
  s3: S3Client;
  buckets: { models: string; previews: string };
  mailer: Mailer;
};

export const EXPORT_FORMAT_VERSION = 1;

/** Toutes les données rattachées au compte, lisibles et sans secret (ni hachage, ni jeton). */
export async function exportUserData(prisma: PrismaClient, userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      pseudo: true,
      email: true,
      bio: true,
      website: true,
      role: true,
      emailVerifiedAt: true,
      tosAcceptedAt: true,
      createdAt: true,
      updatedAt: true,
      models: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          slug: true,
          title: true,
          description: true,
          format: true,
          status: true,
          license: true,
          fileName: true,
          fileSize: true,
          fileChecksum: true,
          hiddenReason: true,
          downloadCount: true,
          favoriteCount: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          category: { select: { name: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
      favorites: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, model: { select: { slug: true, title: true } } },
      },
      downloads: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, model: { select: { slug: true, title: true } } },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { content: true, createdAt: true, model: { select: { slug: true, title: true } } },
      },
      reports: {
        orderBy: { createdAt: "asc" },
        select: {
          reason: true,
          details: true,
          status: true,
          createdAt: true,
          model: { select: { slug: true, title: true } },
        },
      },
      sessions: { orderBy: { expires: "asc" }, select: { expires: true } },
    },
  });

  const modelRef = (model: { slug: string; title: string }) => ({
    slug: model.slug,
    title: model.title,
  });
  return {
    format: "canvatheque-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    account: {
      pseudo: user.pseudo,
      email: user.email,
      bio: user.bio,
      website: user.website,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      termsAcceptedAt: user.tosAcceptedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    models: user.models.map(({ category, tags, ...model }) => ({
      ...model,
      category: category?.name ?? null,
      tags: tags.map(({ tag }) => tag.name).sort((a, b) => a.localeCompare(b, "fr")),
    })),
    favorites: user.favorites.map((f) => ({ ...modelRef(f.model), addedAt: f.createdAt })),
    downloads: user.downloads.map((d) => ({ ...modelRef(d.model), downloadedAt: d.createdAt })),
    comments: user.comments.map((c) => ({
      ...modelRef(c.model),
      content: c.content,
      createdAt: c.createdAt,
    })),
    reports: user.reports.map((r) => ({
      ...modelRef(r.model),
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
    })),
    activeSessions: user.sessions.map((s) => ({ expiresAt: s.expires })),
  };
}

export type UserExport = Awaited<ReturnType<typeof exportUserData>>;

export type DeleteMode = "DELETE_ALL" | "TRANSFER";

/**
 * Suppression définitive du compte, après confirmation du mot de passe :
 * - modèles : tous supprimés (`DELETE_ALL`), ou les modèles publiés transférés au compte
 *   « Auteur supprimé » (`TRANSFER`) ; brouillons, modèles masqués et déjà supprimés le sont
 *   toujours, fichiers et aperçus compris ;
 * - favoris, téléchargements, sessions, jetons et envois : supprimés avec le compte
 *   (compteurs de favoris mis à jour) ;
 * - signalements et commentaires : conservés mais anonymisés (rattachés au compte système).
 * Un administrateur ne supprime pas son compte lui-même (journal de modération).
 */
export async function deleteAccount(
  deps: AccountDeps,
  userId: string,
  input: { password: string; mode: DeleteMode },
): Promise<Result<{ deletedModels: number; transferredModels: number }>> {
  const user = await deps.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, pseudo: true, role: true, isSystem: true, passwordHash: true },
  });
  if (!user || user.isSystem) return fail("NOT_FOUND", "errors.generic");
  if (user.role === "ADMIN") return fail("FORBIDDEN", "errors.account.adminDelete");
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    return fail("UNAUTHORIZED", "errors.wrongPassword", { fields: { password: "wrongPassword" } });
  }

  const system = await ensureSystemUser(deps.prisma);
  const models = await deps.prisma.model.findMany({
    where: { authorId: user.id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      deletedAt: true,
      fileKey: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  const keep = (model: (typeof models)[number]) =>
    input.mode === "TRANSFER" && model.status === "PUBLISHED" && model.deletedAt === null;
  const transferred = models.filter(keep);
  const removed = models.filter((model) => !keep(model));
  const removedIds = removed.map((model) => model.id);
  const pendingUploads = await deps.prisma.upload.findMany({
    where: { userId: user.id, status: "PENDING" },
    select: { kind: true, key: true },
  });

  await deps.prisma.$transaction(async (tx) => {
    // Compteur dénormalisé des modèles que le membre avait mis en favori.
    await tx.$executeRaw`
      UPDATE "Model" SET "favoriteCount" = GREATEST("favoriteCount" - 1, 0)
      WHERE "id" IN (SELECT "modelId" FROM "Favorite" WHERE "userId" = ${user.id})`;

    for (const model of transferred) {
      await tx.model.update({
        where: { id: model.id },
        data: {
          authorId: system.id,
          searchText: buildSearchText(
            model.title,
            model.description,
            model.tags.map(({ tag }) => tag.name),
            system.pseudo,
          ),
        },
      });
    }
    if (removedIds.length > 0) await tx.model.deleteMany({ where: { id: { in: removedIds } } });

    // Un seul signalement ouvert par auteur et par modèle : celui du compte système prime.
    await tx.$executeRaw`
      DELETE FROM "Report" WHERE "reporterId" = ${user.id} AND "status" = 'OPEN'
        AND "modelId" IN (
          SELECT "modelId" FROM "Report" WHERE "reporterId" = ${system.id} AND "status" = 'OPEN')`;
    await tx.report.updateMany({ where: { reporterId: user.id }, data: { reporterId: system.id } });
    await tx.comment.updateMany({ where: { authorId: user.id }, data: { authorId: system.id } });
    await tx.adminAction.updateMany({ where: { adminId: user.id }, data: { adminId: system.id } });
    await tx.user.delete({ where: { id: user.id } });
  });

  await purgeObjects(deps, removed, pendingUploads);
  await deps.mailer.send(accountDeletedNotice({ to: user.email, pseudo: user.pseudo }));
  logger.info(
    {
      event: "account_deleted",
      mode: input.mode,
      deletedModels: removed.length,
      transferredModels: transferred.length,
    },
    "Compte supprimé",
  );
  return ok({ deletedModels: removed.length, transferredModels: transferred.length });
}

/** Fichiers, aperçus et envois en attente du compte supprimé ; échecs journalisés. */
async function purgeObjects(
  deps: AccountDeps,
  models: { id: string; fileKey: string | null }[],
  uploads: { kind: "MODEL" | "PREVIEW"; key: string }[],
) {
  try {
    const previews: string[] = [];
    for (const model of models) {
      previews.push(...(await listKeys(deps.s3, deps.buckets.previews, `${model.id}/`)));
    }
    await deleteObjects(deps.s3, deps.buckets.previews, [
      ...previews,
      ...uploads.filter((u) => u.kind === "PREVIEW").map((u) => u.key),
    ]);
    await deleteObjects(deps.s3, deps.buckets.models, [
      ...models.flatMap((model) => (model.fileKey ? [model.fileKey] : [])),
      ...uploads.filter((u) => u.kind === "MODEL").map((u) => u.key),
    ]);
  } catch (error) {
    logger.error({ event: "storage_cleanup_failed", err: error }, "Purge MinIO du compte");
  }
}

/** Nom du fichier d'export (`canvatheque-<pseudo>-<date>.json`). */
export function exportFileName(pseudoSlug: string, now = new Date()): string {
  return `canvatheque-${pseudoSlug}-${now.toISOString().slice(0, 10)}.json`;
}
