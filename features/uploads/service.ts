import { randomUUID } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  canCreateModel,
  clock,
  countActiveModels,
  findActionableModel,
  uniqueSlug,
  type ModelActor,
  type ModelDeps,
} from "@/features/models/service";
import { formatFileSize, titleFromFileName } from "@/lib/format";
import type { Model, Upload } from "@/lib/generated/prisma/client";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import {
  buildPreviewSet,
  ImageError,
  rasterizeSvg,
  type Crop,
  type PreviewSet,
} from "@/lib/images/preview";
import { logger } from "@/lib/logger";
import { fail, ok, type Result } from "@/lib/result";
import {
  checkCwprjContent,
  checkDeclaredModel,
  checkDeclaredPreview,
  detectPreviewImage,
  formatFromFileName,
  PREVIEW_MAX_BYTES,
  sha256,
} from "@/lib/security/file-validation";
import { sanitizeSvg } from "@/lib/security/svg-sanitizer";
import {
  deleteObjects,
  objectSize,
  presignUpload,
  readObject,
  writeObject,
} from "@/lib/storage/objects";
import {
  previewInfo,
  previewObjectKey,
  previewObjectKeys,
  type PreviewInfo,
} from "@/lib/storage/previews";

/**
 * Envoi direct navigateur → MinIO (plan § 2.3, ADR-006) : le serveur émet un formulaire
 * présigné, puis vérifie et traite l'objet reçu. Il ne relaie jamais le binaire entrant.
 */

export type UploadDeps = ModelDeps & { publicS3: S3Client };

/** Durée de validité d'un envoi en attente (et du formulaire présigné). */
export const UPLOAD_TTL_MS = 15 * 60 * 1000;

const PREVIEW_CACHE = "public, max-age=31536000, immutable";

const uploadError = (code: string) =>
  fail("VALIDATION", `errors.upload.${code}`, { fields: { file: code } });

const bucketFor = (deps: UploadDeps, kind: Upload["kind"]) =>
  kind === "MODEL" ? deps.buckets.models : deps.buckets.previews;

// --- 1. Demande d'envoi --------------------------------------------------------------------

export type UploadRequest = {
  kind: "MODEL" | "PREVIEW";
  fileName: string;
  size: number;
  mime: string;
  modelId?: string;
};

export type UploadTicket = {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
};

export async function createUpload(
  deps: UploadDeps,
  actor: ModelActor,
  input: UploadRequest,
): Promise<Result<UploadTicket>> {
  if (actor.bannedAt) return fail("FORBIDDEN", "errors.forbidden");

  let model: Model | null = null;
  if (input.modelId) {
    const found = await findActionableModel(deps.prisma, actor, input.modelId);
    if (!found.ok) return found;
    model = found.data;
  } else if (input.kind === "PREVIEW") {
    return fail("VALIDATION", "errors.validation");
  } else if (!canCreateModel(deps, actor, await countActiveModels(deps.prisma, actor.id))) {
    return fail("FORBIDDEN", "errors.upload.quota", { fields: { file: "quota" } });
  }

  let maxBytes: number;
  let declaredName: string;
  if (input.kind === "MODEL") {
    const check = checkDeclaredModel(input, deps.maxFileBytes);
    if (!check.ok) return uploadError(check.error);
    if (model && model.status !== "DRAFT" && model.format !== check.value.format) {
      return uploadError("formatChange");
    }
    maxBytes = deps.maxFileBytes;
    declaredName = check.value.name;
  } else {
    const check = checkDeclaredPreview(input);
    if (!check.ok) return uploadError(check.error);
    maxBytes = PREVIEW_MAX_BYTES;
    declaredName = check.value.name;
  }

  const now = clock(deps);
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS);
  const key = `uploads/${randomUUID()}`;
  const upload = await deps.prisma.upload.create({
    data: {
      userId: actor.id,
      kind: input.kind,
      key,
      declaredName,
      declaredSize: input.size,
      declaredMime: input.mime.slice(0, 255),
      modelId: model?.id,
      expiresAt,
    },
  });
  const form = await presignUpload(deps.publicS3, bucketFor(deps, input.kind), key, {
    maxBytes,
    expiresSeconds: UPLOAD_TTL_MS / 1000,
  });
  return ok({
    uploadId: upload.id,
    url: form.url,
    fields: form.fields,
    expiresAt: expiresAt.toISOString(),
  });
}

// --- 2. Confirmation -----------------------------------------------------------------------

export type ConfirmedFile = {
  modelId: string;
  slug: string;
  /** Vrai si l'envoi a créé le brouillon. */
  created: boolean;
  title: string;
  format: ModelFormat;
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  preview: PreviewInfo | null;
  previewCustom: boolean;
  /** Modèle publié au contenu identique (avertissement non bloquant). */
  duplicateOf: { slug: string; title: string } | null;
};

export type ConfirmedPreview = { modelId: string; preview: PreviewInfo; previewCustom: true };

/** Fichier vérifié, prêt à être stocké. */
type ProcessedModelFile = {
  format: ModelFormat;
  body: Buffer;
  contentType: string;
  previews: PreviewSet | null;
};

async function processModelFile(
  deps: UploadDeps,
  name: string,
  buffer: Buffer,
): Promise<Result<ProcessedModelFile>> {
  const format = formatFromFileName(name);
  if (format === "SVG") {
    const clean = sanitizeSvg(buffer, deps.maxFileBytes);
    if (!clean.ok) return uploadError(clean.error);
    const raster = await rasterizeSvg(clean.svg);
    return ok({
      format,
      body: Buffer.from(clean.svg, "utf8"),
      contentType: "image/svg+xml",
      previews: await buildPreviewSet(raster),
    });
  }
  if (format === "CWPRJ") {
    const check = await checkCwprjContent(buffer);
    if (!check.ok) return uploadError(check.error);
    return ok({ format, body: buffer, contentType: "application/octet-stream", previews: null });
  }
  return uploadError("extension");
}

async function storePreviews(deps: UploadDeps, modelId: string, set: PreviewSet) {
  const previewKey = `${modelId}/${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  for (const variant of set.variants) {
    await writeObject(
      deps.s3,
      deps.buckets.previews,
      previewObjectKey(previewKey, variant.suffix),
      variant.buffer,
      "image/webp",
      PREVIEW_CACHE,
    );
  }
  return { previewKey, previewWidth: set.width, previewHeight: set.height };
}

async function loadPendingUpload(
  deps: UploadDeps,
  actor: ModelActor,
  uploadId: string,
): Promise<Result<{ upload: Upload; buffer: Buffer }>> {
  const upload = await deps.prisma.upload.findFirst({
    where: { id: uploadId, userId: actor.id, status: "PENDING" },
  });
  if (!upload) return fail("NOT_FOUND", "errors.upload.notFound");
  const bucket = bucketFor(deps, upload.kind);
  const abandon = async () => {
    await deps.prisma.upload.update({ where: { id: upload.id }, data: { status: "ABANDONED" } });
    await deleteObjects(deps.s3, bucket, [upload.key]);
  };

  if (upload.expiresAt <= clock(deps)) {
    await abandon();
    return fail("NOT_FOUND", "errors.upload.expired");
  }
  const size = await objectSize(deps.s3, bucket, upload.key);
  if (size === null) return uploadError("missing");
  const max = upload.kind === "MODEL" ? deps.maxFileBytes : PREVIEW_MAX_BYTES;
  if (size === 0 || size > max) {
    await abandon();
    return uploadError(size === 0 ? "empty" : "tooLarge");
  }
  return ok({ upload, buffer: await readObject(deps.s3, bucket, upload.key) });
}

async function finishUpload(
  deps: UploadDeps,
  upload: Upload,
  status: "CONFIRMED" | "ABANDONED",
  modelId?: string,
): Promise<void> {
  await deps.prisma.upload.update({
    where: { id: upload.id },
    data: { status, modelId: modelId ?? upload.modelId },
  });
  await deleteObjects(deps.s3, bucketFor(deps, upload.kind), [upload.key]);
}

export async function confirmUpload(
  deps: UploadDeps,
  actor: ModelActor,
  input: { uploadId: string; crop?: Crop },
): Promise<Result<ConfirmedFile | ConfirmedPreview>> {
  if (actor.bannedAt) return fail("FORBIDDEN", "errors.forbidden");
  const loaded = await loadPendingUpload(deps, actor, input.uploadId);
  if (!loaded.ok) return loaded;
  const { upload, buffer } = loaded.data;

  let result: Result<ConfirmedFile | ConfirmedPreview>;
  try {
    result =
      upload.kind === "MODEL"
        ? await confirmModelFile(deps, actor, upload, buffer)
        : await confirmPreview(deps, actor, upload, buffer, input.crop);
  } catch (error) {
    if (error instanceof ImageError) result = uploadError(error.code);
    else {
      await finishUpload(deps, upload, "ABANDONED");
      throw error;
    }
  }
  await finishUpload(
    deps,
    upload,
    result.ok ? "CONFIRMED" : "ABANDONED",
    result.ok ? result.data.modelId : undefined,
  );
  return result;
}

async function confirmModelFile(
  deps: UploadDeps,
  actor: ModelActor,
  upload: Upload,
  buffer: Buffer,
): Promise<Result<ConfirmedFile>> {
  let existing: Model | null = null;
  if (upload.modelId) {
    const found = await findActionableModel(deps.prisma, actor, upload.modelId);
    if (!found.ok) return found;
    existing = found.data;
  }

  const processed = await processModelFile(deps, upload.declaredName, buffer);
  if (!processed.ok) return processed;
  const file = processed.data;
  if (existing && existing.status !== "DRAFT" && existing.format !== file.format) {
    return uploadError("formatChange");
  }

  let model = existing;
  if (!model) {
    if (!canCreateModel(deps, actor, await countActiveModels(deps.prisma, actor.id))) {
      return fail("FORBIDDEN", "errors.upload.quota", { fields: { file: "quota" } });
    }
    const title = titleFromFileName(upload.declaredName);
    model = await deps.prisma.model.create({
      data: {
        title,
        slug: await uniqueSlug(deps.prisma, title),
        format: file.format,
        authorId: actor.id,
        searchText: `${title} ${actor.pseudo}`,
      },
    });
  }

  const extension = file.format === "SVG" ? "svg" : "cwprj";
  const fileKey = `models/${randomUUID()}.${extension}`;
  const written: { bucket: string; keys: string[] }[] = [];
  try {
    await writeObject(deps.s3, deps.buckets.models, fileKey, file.body, file.contentType);
    written.push({ bucket: deps.buckets.models, keys: [fileKey] });

    // Aperçu généré depuis le SVG, sauf si le membre a choisi sa propre image.
    let previewData: {
      previewKey: string | null;
      previewWidth: number | null;
      previewHeight: number | null;
      previewCustom: boolean;
    } | null = null;
    if (file.previews && !model.previewCustom) {
      const stored = await storePreviews(deps, model.id, file.previews);
      written.push({ bucket: deps.buckets.previews, keys: previewObjectKeys(stored.previewKey) });
      previewData = { ...stored, previewCustom: false };
    } else if (!file.previews && !model.previewCustom && model.previewKey) {
      // Brouillon passé de SVG à CWPRJ : l'aperçu généré ne correspond plus au fichier.
      previewData = {
        previewKey: null,
        previewWidth: null,
        previewHeight: null,
        previewCustom: false,
      };
    }

    const checksum = sha256(file.body);
    const updated = await deps.prisma.model.update({
      where: { id: model.id },
      data: {
        format: file.format,
        fileKey,
        fileName: upload.declaredName,
        fileSize: file.body.length,
        fileChecksum: checksum,
        ...previewData,
      },
    });

    // Anciens objets remplacés.
    if (existing?.fileKey) await deleteObjects(deps.s3, deps.buckets.models, [existing.fileKey]);
    if (previewData && existing?.previewKey) {
      await deleteObjects(deps.s3, deps.buckets.previews, previewObjectKeys(existing.previewKey));
    }

    const duplicate = await deps.prisma.model.findFirst({
      where: {
        fileChecksum: checksum,
        id: { not: model.id },
        deletedAt: null,
        status: "PUBLISHED",
      },
      select: { slug: true, title: true },
      orderBy: { publishedAt: "asc" },
    });
    logger.info(
      {
        event: "model_file_confirmed",
        modelId: model.id,
        format: file.format,
        size: file.body.length,
      },
      "Fichier de modèle confirmé",
    );
    return ok({
      modelId: updated.id,
      slug: updated.slug,
      created: !existing,
      title: updated.title,
      format: updated.format,
      fileName: upload.declaredName,
      fileSize: file.body.length,
      fileSizeLabel: formatFileSize(file.body.length),
      preview: previewInfo(updated),
      previewCustom: updated.previewCustom,
      duplicateOf: duplicate,
    });
  } catch (error) {
    for (const { bucket, keys } of written) await deleteObjects(deps.s3, bucket, keys);
    if (!existing) await deps.prisma.model.delete({ where: { id: model.id } });
    throw error;
  }
}

async function confirmPreview(
  deps: UploadDeps,
  actor: ModelActor,
  upload: Upload,
  buffer: Buffer,
  crop?: Crop,
): Promise<Result<ConfirmedPreview>> {
  const found = await findActionableModel(deps.prisma, actor, upload.modelId ?? "");
  if (!found.ok) return found;
  const model = found.data;

  const image = await detectPreviewImage(buffer);
  if (!image.ok) return uploadError(image.error);
  const set = await buildPreviewSet(buffer, crop);
  const stored = await storePreviews(deps, model.id, set);
  const updated = await deps.prisma.model.update({
    where: { id: model.id },
    data: { ...stored, previewCustom: true },
  });
  if (model.previewKey) {
    await deleteObjects(deps.s3, deps.buckets.previews, previewObjectKeys(model.previewKey));
  }
  return ok({ modelId: model.id, preview: previewInfo(updated)!, previewCustom: true });
}

// --- 3. Purge ------------------------------------------------------------------------------

/** Marque abandonnés les envois expirés et supprime leurs objets (démarrage, admin). */
export async function cleanupExpiredUploads(
  deps: Pick<UploadDeps, "prisma" | "s3" | "buckets" | "now">,
): Promise<number> {
  const expired = await deps.prisma.upload.findMany({
    where: { status: "PENDING", expiresAt: { lt: clock(deps) } },
    select: { id: true, kind: true, key: true },
  });
  if (expired.length === 0) return 0;
  for (const kind of ["MODEL", "PREVIEW"] as const) {
    const keys = expired.filter((u) => u.kind === kind).map((u) => u.key);
    if (keys.length > 0) {
      await deleteObjects(
        deps.s3,
        kind === "MODEL" ? deps.buckets.models : deps.buckets.previews,
        keys,
      );
    }
  }
  await deps.prisma.upload.updateMany({
    where: { id: { in: expired.map((u) => u.id) } },
    data: { status: "ABANDONED" },
  });
  return expired.length;
}
