import { Resvg, renderAsync } from "@resvg/resvg-js";
import sharp, { type OutputInfo } from "sharp";

/** Pipeline d'aperçus (plan § 2.3, ADR-003). */

export const PREVIEW_VARIANTS = [
  { suffix: "sm", width: 400 },
  { suffix: "md", width: 800 },
  { suffix: "lg", width: 1600 },
] as const;
export type PreviewSize = (typeof PREVIEW_VARIANTS)[number]["suffix"];

/** Plus grand côté du rendu d'un SVG (résolution de la variante lg). */
export const RASTER_MAX_SIDE = 1600;
/** Garde-fou mémoire : 40 mégapixels en entrée de sharp. */
export const MAX_INPUT_PIXELS = 40_000_000;

/** Recadrage en proportions de l'image (0 à 1), après rotation EXIF. */
export type Crop = { x: number; y: number; width: number; height: number };

export class ImageError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ImageError";
  }
}

/**
 * Rasterise un SVG déjà nettoyé : fond transparent, aucune police système ni ressource
 * externe, plus grand côté ramené à RASTER_MAX_SIDE.
 */
export async function rasterizeSvg(svg: string): Promise<Buffer> {
  const options = {
    font: { loadSystemFonts: false },
    shapeRendering: 2 as const,
    textRendering: 1 as const,
    imageRendering: 0 as const,
    logLevel: "off" as const,
  };
  try {
    const probe = new Resvg(svg, options);
    const fitTo =
      probe.width >= probe.height
        ? { mode: "width" as const, value: RASTER_MAX_SIDE }
        : { mode: "height" as const, value: RASTER_MAX_SIDE };
    // Rendu hors du fil principal : le serveur reste disponible pendant la rasterisation.
    return (await renderAsync(svg, { ...options, fitTo })).asPng();
  } catch {
    throw new ImageError("svgRender");
  }
}

function cropBox(crop: Crop, width: number, height: number) {
  const left = Math.min(width - 1, Math.max(0, Math.round(crop.x * width)));
  const top = Math.min(height - 1, Math.max(0, Math.round(crop.y * height)));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(crop.width * width))),
    height: Math.max(1, Math.min(height - top, Math.round(crop.height * height))),
  };
}

export type PreviewVariant = { suffix: PreviewSize; buffer: Buffer };
export type PreviewSet = { variants: PreviewVariant[]; width: number; height: number };

/**
 * Produit les variantes WebP 400 / 800 / 1600 px de large : rotation EXIF appliquée,
 * métadonnées supprimées (comportement par défaut de sharp), recadrage optionnel,
 * jamais d'agrandissement, transparence conservée.
 */
export async function buildPreviewSet(input: Buffer, crop?: Crop): Promise<PreviewSet> {
  let base: { data: Buffer; info: OutputInfo };
  try {
    const oriented = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    base = crop
      ? await sharp(oriented.data)
          .extract(cropBox(crop, oriented.info.width, oriented.info.height))
          .png()
          .toBuffer({ resolveWithObject: true })
      : oriented;
  } catch {
    throw new ImageError("imageInvalid");
  }

  const variants: PreviewVariant[] = [];
  let width = base.info.width;
  let height = base.info.height;
  for (const { suffix, width: target } of PREVIEW_VARIANTS) {
    const { data, info } = await sharp(base.data)
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ suffix, buffer: data });
    if (suffix === "lg") {
      width = info.width;
      height = info.height;
    }
  }
  return { variants, width, height };
}
