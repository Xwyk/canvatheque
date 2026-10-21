import "server-only";
import sharp from "sharp";
import type { CwprjKey } from "@/lib/cwprj-keys";
import { MAX_INPUT_PIXELS } from "@/lib/images/preview";

/**
 * Miniature des projets CanvasWorkspace (ADR-013). Un `.cwprj` est un document XML `<FCMX>`
 * chiffré en AES-256-CBC (remplissage PKCS7) ; son en-tête `FileHeaderSection` porte la
 * miniature (`ThumbnailImage`, base64) et le nom du motif (`DesignName`). Déchiffrement
 * côté serveur uniquement, à la vérification de l'envoi : la clé ne quitte jamais le serveur.
 */

/** Taille maximale du base64 de la miniature (≈ 5 Mo d'image, comme une image d'aperçu). */
export const THUMBNAIL_BASE64_MAX = 7 * 1024 * 1024;

/** Ancien format CanvasWorkspace (non chiffré de la même façon) : non pris en charge. */
const LEGACY_HEADERS = ["#FCM", "#RCM", "#VCM", "#FCN", "#RCN", "#VCN", "#FTN"];

export type CwprjFailure =
  | "legacyFormat"
  | "notEncrypted"
  | "decryptFailed"
  | "notFcmx"
  | "noThumbnail"
  | "thumbnailTooLarge"
  | "thumbnailInvalid"
  | "thumbnailType"
  | "bmpUnsupported";

export class CwprjError extends Error {
  constructor(public readonly reason: CwprjFailure) {
    super(reason);
    this.name = "CwprjError";
  }
}

// --- Déchiffrement -------------------------------------------------------------------------

async function decryptWith(
  data: Uint8Array<ArrayBuffer>,
  { key, iv }: CwprjKey,
): Promise<string | null> {
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-CBC", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, data);
    // TextDecoder retire aussi un éventuel BOM UTF-8.
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    return null; // remplissage invalide ou texte non UTF-8 : autre clé
  }
}

/** Vrai si le texte est un document `<FCMX>` (après BOM et déclaration XML éventuels). */
function isFcmx(xml: string): boolean {
  const start = xml.trimStart();
  const body = start.startsWith("<?xml") ? start.slice(start.indexOf("?>") + 2).trimStart() : start;
  return /^<FCMX[\s>]/.test(body);
}

/**
 * Déchiffre un `.cwprj` et renvoie son XML. Chaque paire clé/IV est essayée dans l'ordre ;
 * un déchiffrement qui ne donne pas un document `<FCMX>` (mauvaise clé passée par hasard au
 * contrôle du remplissage) est rejeté.
 */
export async function decryptCwprj(data: Uint8Array, keys: CwprjKey[]): Promise<string> {
  const head = new TextDecoder("latin1").decode(data.subarray(0, 4));
  if (LEGACY_HEADERS.includes(head)) throw new CwprjError("legacyFormat");
  if (data.length === 0 || data.length % 16 !== 0) throw new CwprjError("notEncrypted");
  // Copie dans un ArrayBuffer dédié (Web Crypto refuse les vues sur un tampon partagé).
  const bytes = new Uint8Array(data);
  let decrypted = false;
  for (const key of keys) {
    const xml = await decryptWith(bytes, key);
    if (xml === null) continue;
    decrypted = true;
    if (isFcmx(xml)) return xml;
  }
  throw new CwprjError(decrypted ? "notFcmx" : "decryptFailed");
}

// --- Lecture de l'en-tête ------------------------------------------------------------------

/**
 * Contenu du premier élément `<tag>` (avec ou sans attributs), sans expression régulière à
 * retour arrière ; élément vide ou auto-fermant : chaîne vide ; absent : null.
 */
function elementContent(xml: string, tag: string): string | null {
  let from = 0;
  for (;;) {
    const open = xml.indexOf(`<${tag}`, from);
    if (open === -1) return null;
    const next = xml[open + tag.length + 1];
    if (
      next === ">" ||
      next === "/" ||
      next === " " ||
      next === "\t" ||
      next === "\n" ||
      next === "\r"
    ) {
      const end = xml.indexOf(">", open);
      if (end === -1) return null;
      if (xml[end - 1] === "/") return "";
      const close = xml.indexOf(`</${tag}>`, end + 1);
      return close === -1 ? null : xml.slice(end + 1, close);
    }
    from = open + 1; // « <TagSuite » : un autre élément
  }
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Texte d'un élément : sections CDATA conservées telles quelles, entités XML décodées. */
export function xmlText(raw: string): string {
  let text = "";
  let index = 0;
  while (index < raw.length) {
    const cdata = raw.indexOf("<![CDATA[", index);
    const plain = cdata === -1 ? raw.slice(index) : raw.slice(index, cdata);
    text += plain.replace(
      /&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]{2,4});/g,
      (whole, entity: string) => {
        if (entity.startsWith("#x"))
          return safeCodePoint(Number.parseInt(entity.slice(2), 16), whole);
        if (entity.startsWith("#"))
          return safeCodePoint(Number.parseInt(entity.slice(1), 10), whole);
        return ENTITIES[entity] ?? whole;
      },
    );
    if (cdata === -1) break;
    const end = raw.indexOf("]]>", cdata + 9);
    text += end === -1 ? raw.slice(cdata + 9) : raw.slice(cdata + 9, end);
    index = end === -1 ? raw.length : end + 3;
  }
  return text;
}

function safeCodePoint(code: number, fallback: string): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

export type CwprjThumbnail = { bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/bmp" };
export type CwprjHeader = { designName: string | null; thumbnail: CwprjThumbnail | null };

function thumbnailMime(bytes: Buffer): CwprjThumbnail["mime"] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

/** Nom du motif et miniature de l'en-tête `FCMX/FileHeaderSection`. */
export function readCwprjHeader(xml: string): CwprjHeader {
  const fcmx = elementContent(xml, "FCMX");
  const section = fcmx === null ? null : elementContent(fcmx, "FileHeaderSection");
  if (section === null) return { designName: null, thumbnail: null };

  const nameRaw = elementContent(section, "DesignName");
  const designName = nameRaw === null ? "" : xmlText(nameRaw).replace(/\s+/g, " ").trim();

  const imageRaw = elementContent(section, "ThumbnailImage");
  if (imageRaw === null) return { designName: designName || null, thumbnail: null };
  if (imageRaw.length > THUMBNAIL_BASE64_MAX * 2) throw new CwprjError("thumbnailTooLarge");
  const base64 = xmlText(imageRaw)
    .replace(/\s+/g, "")
    .replace(/^data:[^,]{0,100},/, "");
  if (base64.length === 0) return { designName: designName || null, thumbnail: null };
  if (base64.length > THUMBNAIL_BASE64_MAX) throw new CwprjError("thumbnailTooLarge");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new CwprjError("thumbnailInvalid");
  const bytes = Buffer.from(base64, "base64");
  const mime = thumbnailMime(bytes);
  if (!mime) throw new CwprjError("thumbnailType");
  return { designName: designName || null, thumbnail: { bytes, mime } };
}

// --- BMP -----------------------------------------------------------------------------------

export type RawImage = { data: Buffer; width: number; height: number };

/**
 * BMP non compressé 24 ou 32 bits (en-tête BITMAPINFOHEADER ou plus récent), lignes de bas
 * en haut ou de haut en bas, converti en pixels RGBA : sharp ne lit pas le BMP.
 */
export function bmpToRaw(bytes: Buffer): RawImage {
  const fail = (): never => {
    throw new CwprjError("bmpUnsupported");
  };
  if (bytes.length < 54) fail();
  const pixelOffset = bytes.readUInt32LE(10);
  const headerSize = bytes.readUInt32LE(14);
  const width = bytes.readInt32LE(18);
  const signedHeight = bytes.readInt32LE(22);
  const bitsPerPixel = bytes.readUInt16LE(28);
  const compression = bytes.readUInt32LE(30);
  const height = Math.abs(signedHeight);
  if (headerSize < 40 || compression !== 0 || (bitsPerPixel !== 24 && bitsPerPixel !== 32)) fail();
  if (width <= 0 || height <= 0 || width * height > MAX_INPUT_PIXELS) fail();

  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  if (pixelOffset + rowSize * height > bytes.length) fail();

  const data = Buffer.alloc(width * height * 4);
  let opaque = bitsPerPixel === 24;
  for (let y = 0; y < height; y += 1) {
    // Hauteur positive : la première ligne stockée est le bas de l'image.
    const source = pixelOffset + rowSize * (signedHeight > 0 ? height - 1 - y : y);
    for (let x = 0; x < width; x += 1) {
      const from = source + x * bytesPerPixel;
      const to = (y * width + x) * 4;
      data[to] = bytes[from + 2]!;
      data[to + 1] = bytes[from + 1]!;
      data[to + 2] = bytes[from]!;
      data[to + 3] = bitsPerPixel === 32 ? bytes[from + 3]! : 255;
      if (data[to + 3] !== 0) opaque = true;
    }
  }
  // BMP 32 bits dont le quatrième octet est inutilisé (tout à 0) : image opaque.
  if (!opaque) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width, height };
}

// --- Aperçu --------------------------------------------------------------------------------

export type CwprjPreview = {
  designName: string | null;
  /** Image PNG ou JPEG prête pour le pipeline d'aperçus ; null si le projet n'en a pas. */
  image: Buffer | null;
};

/**
 * Miniature et nom du motif d'un `.cwprj`. Lève une CwprjError (raison journalisée par
 * l'appelant) si le fichier ne peut pas être lu ; l'envoi reste alors accepté sans aperçu.
 */
export async function extractCwprjPreview(
  data: Uint8Array,
  keys: CwprjKey[],
): Promise<CwprjPreview> {
  const { designName, thumbnail } = readCwprjHeader(await decryptCwprj(data, keys));
  if (!thumbnail) return { designName, image: null };
  const raw =
    thumbnail.mime === "image/bmp" ? bmpToRaw(thumbnail.bytes) : await decode(thumbnail.bytes);
  roundTopLeftCorner(raw);
  const image = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { designName, image };
}

/** PNG ou JPEG décodé en pixels RGBA (mêmes bornes que le pipeline d'aperçus). */
async function decode(bytes: Buffer): Promise<RawImage> {
  try {
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new CwprjError("thumbnailInvalid");
  }
}

/** Rayon de l'angle arrondi, en part de la largeur : celui des cartes (20 px pour ~250 px). */
export const CORNER_RADIUS_RATIO = 0.08;

/**
 * Arrondit l'angle supérieur gauche de la partie visible de la miniature. CanvasWorkspace
 * dessine la page blanche du projet, à angle droit, après une marge transparente en haut et à
 * gauche : arrondie, elle épouse les coins du cadre qui l'affiche. Bord anticrénelé ; image
 * entièrement transparente laissée telle quelle.
 */
export function roundTopLeftCorner(image: RawImage, ratio = CORNER_RADIUS_RATIO): void {
  const { data, width, height } = image;
  let left = width;
  let top = height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < Math.min(left, width); x += 1) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        left = x;
        if (top === height) top = y;
        break;
      }
    }
  }
  if (left === width) return;
  const radius = Math.min(Math.round(width * ratio), width - left, height - top);
  const centerX = left + radius;
  const centerY = top + radius;
  for (let y = top; y < centerY; y += 1) {
    for (let x = left; x < centerX; x += 1) {
      const distance = Math.hypot(centerX - (x + 0.5), centerY - (y + 0.5));
      const coverage = Math.min(1, Math.max(0, radius - distance + 0.5));
      if (coverage < 1) {
        const alpha = (y * width + x) * 4 + 3;
        data[alpha] = Math.round(data[alpha]! * coverage);
      }
    }
  }
}
