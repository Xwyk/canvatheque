import { PREVIEW_VARIANTS, type PreviewSize } from "@/lib/images/preview";
import { buckets, publicObjectUrl } from "@/lib/storage/s3";

/**
 * Aperçus d'un modèle dans le bucket public : `<modelId>/<version>-{sm,md,lg}.webp`.
 * `Model.previewKey` vaut `<modelId>/<version>` ; une nouvelle version change l'URL (cache).
 */

export type PreviewInfo = Record<PreviewSize, string> & { width: number; height: number };

export function previewObjectKey(previewKey: string, size: PreviewSize): string {
  return `${previewKey}-${size}.webp`;
}

export function previewObjectKeys(previewKey: string): string[] {
  return PREVIEW_VARIANTS.map(({ suffix }) => previewObjectKey(previewKey, suffix));
}

export function previewInfo(model: {
  previewKey: string | null;
  previewWidth: number | null;
  previewHeight: number | null;
}): PreviewInfo | null {
  if (!model.previewKey) return null;
  const bucket = buckets().previews;
  const url = (size: PreviewSize) =>
    publicObjectUrl(bucket, previewObjectKey(model.previewKey!, size));
  return {
    sm: url("sm"),
    md: url("md"),
    lg: url("lg"),
    width: model.previewWidth ?? 0,
    height: model.previewHeight ?? 0,
  };
}
