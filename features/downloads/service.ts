import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { catalogItem, itemSelect } from "@/features/catalog/model-page";
import type { CatalogItem } from "@/features/catalog/search";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import { can, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

/**
 * Téléchargement d'un fichier de modèle (plan § 2.3) : modèle visible, ligne `Download`
 * (comptée une fois par jour et par couple membre/modèle), URL présignée courte en pièce jointe.
 */

export type DownloadDeps = {
  prisma: PrismaClient;
  /** Client signant pour l'origine publique du stockage. */
  publicS3: S3Client;
  bucket: string;
  ttlSeconds: number;
  now?: () => Date;
};

export type DownloadTicket = { url: string; counted: boolean; format: ModelFormat };

const EXTENSIONS: Record<ModelFormat, string> = { CWPRJ: "cwprj", SVG: "svg" };

/** Jour UTC (colonne `Download.day`). */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** En-tête Content-Disposition : nom ASCII de repli et nom UTF-8 (RFC 6266). */
export function attachmentHeader(slug: string, format: ModelFormat): string {
  const name = `${slug}.${EXTENSIONS[format]}`;
  return `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Enregistre le téléchargement : compté si c'est le premier du jour pour ce couple. */
async function recordDownload(
  prisma: PrismaClient,
  userId: string,
  modelId: string,
  now: Date,
): Promise<boolean> {
  const day = utcDay(now);
  const already = await prisma.download.findFirst({
    where: { userId, modelId, day, counted: true },
    select: { id: true },
  });
  if (!already) {
    try {
      await prisma.$transaction([
        prisma.download.create({ data: { userId, modelId, day, counted: true, createdAt: now } }),
        prisma.model.update({ where: { id: modelId }, data: { downloadCount: { increment: 1 } } }),
      ]);
      return true;
    } catch (error) {
      // Téléchargement simultané déjà compté (index unique partiel) : enregistré non compté.
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!duplicate) throw error;
    }
  }
  await prisma.download.create({ data: { userId, modelId, day, counted: false, createdAt: now } });
  return false;
}

export async function requestDownload(
  deps: DownloadDeps,
  actor: Actor,
  slug: string,
): Promise<Result<DownloadTicket>> {
  if (!actor) return fail("UNAUTHORIZED", "errors.unauthorized");
  if (!can(actor, "model:download")) return fail("FORBIDDEN", "errors.forbidden");
  const model = await deps.prisma.model.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, slug: true, format: true, status: true, authorId: true, fileKey: true },
  });
  if (
    !model?.fileKey ||
    !can(actor, "model:view", { ownerId: model.authorId, status: model.status })
  ) {
    return fail("NOT_FOUND", "errors.notFound");
  }

  const now = (deps.now ?? (() => new Date()))();
  const counted = await recordDownload(deps.prisma, actor.id, model.id, now);
  const url = await getSignedUrl(
    deps.publicS3,
    new GetObjectCommand({
      Bucket: deps.bucket,
      Key: model.fileKey,
      // Jamais affiché par le navigateur (SVG compris) : toujours enregistré comme fichier.
      ResponseContentDisposition: attachmentHeader(model.slug, model.format),
      ResponseContentType: "application/octet-stream",
    }),
    { expiresIn: deps.ttlSeconds },
  );
  return ok({ url, counted, format: model.format });
}

export type RecentDownload = CatalogItem & { downloadedAt: string };

export const RECENT_DOWNLOADS_LIMIT = 48;

/** « Mes téléchargements » : dernier téléchargement de chaque modèle encore publié. */
export async function listMyDownloads(
  prisma: PrismaClient,
  userId: string,
): Promise<RecentDownload[]> {
  const latest = await prisma.download.groupBy({
    by: ["modelId"],
    where: { userId, model: { status: "PUBLISHED", deletedAt: null } },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: RECENT_DOWNLOADS_LIMIT,
  });
  if (latest.length === 0) return [];
  const models = await prisma.model.findMany({
    where: { id: { in: latest.map((row) => row.modelId) } },
    select: itemSelect,
  });
  const byId = new Map(models.map((model) => [model.id, model]));
  return latest.flatMap((row) => {
    const model = byId.get(row.modelId);
    return model
      ? [{ ...catalogItem(model), downloadedAt: row._max.createdAt!.toISOString() }]
      : [];
  });
}
