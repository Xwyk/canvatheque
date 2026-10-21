import { createCipheriv, randomBytes } from "node:crypto";
import sharp from "sharp";
import { parseCwprjKeys, type CwprjKey } from "@/lib/cwprj-keys";

/**
 * Projets CanvasWorkspace synthétiques pour les tests (ADR-013) : clé et IV générés par le
 * test, XML minimal chiffré comme un vrai `.cwprj`. Aucun fichier ni clé réels dans le dépôt.
 */

export type TestCwprjKey = { hexKey: string; hexIv: string; keys: CwprjKey[] };

export function testCwprjKey(): TestCwprjKey {
  const hexKey = randomBytes(32).toString("hex");
  const hexIv = randomBytes(16).toString("hex");
  return { hexKey, hexIv, keys: parseCwprjKeys(hexKey, hexIv) };
}

/** Chiffre un texte en AES-256-CBC avec remplissage PKCS7 (format d'un `.cwprj`). */
export function encryptCwprj(text: string | Buffer, { hexKey, hexIv }: TestCwprjKey): Buffer {
  const cipher = createCipheriv(
    "aes-256-cbc",
    Buffer.from(hexKey, "hex"),
    Buffer.from(hexIv, "hex"),
  );
  return Buffer.concat([cipher.update(text), cipher.final()]);
}

/** Document `<FCMX>` minimal ; `header` remplace tout le contenu de FileHeaderSection. */
export function fcmxXml({
  designName,
  thumbnail,
  header,
}: {
  designName?: string;
  thumbnail?: Buffer | string;
  header?: string;
} = {}): string {
  const content =
    header ??
    [
      designName === undefined ? "" : `<DesignName>${designName}</DesignName>`,
      "<AuthorName>Nom Réel</AuthorName>",
      thumbnail === undefined
        ? ""
        : `<ThumbnailImage>${typeof thumbnail === "string" ? thumbnail : thumbnail.toString("base64")}</ThumbnailImage>`,
    ].join("");
  return `<?xml version="1.0" encoding="utf-8"?>\n<FCMX version="3"><FileHeaderSection>${content}</FileHeaderSection><PageSection><Shape/></PageSection></FCMX>`;
}

/** `.cwprj` synthétique complet. */
export function cwprjFile(key: TestCwprjKey, options: Parameters<typeof fcmxXml>[0] = {}): Buffer {
  return encryptCwprj(fcmxXml(options), key);
}

/** Petite image unie (PNG ou JPEG) servant de miniature. */
export async function thumbnailImage(format: "png" | "jpeg" = "png", width = 40, height = 30) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 75 } },
  })
    [format]()
    .toBuffer();
}

/**
 * BMP non compressé : pixel (0, 0) rouge, les autres bleus ; `topDown` = hauteur négative ;
 * 32 bits : `alpha` appliqué à chaque pixel.
 */
export function bmpImage({
  width = 3,
  height = 2,
  bitsPerPixel = 24,
  topDown = false,
  alpha = 255,
  compression = 0,
}: {
  width?: number;
  height?: number;
  bitsPerPixel?: 24 | 32;
  topDown?: boolean;
  alpha?: number;
  compression?: number;
} = {}): Buffer {
  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const offset = 54;
  const buffer = Buffer.alloc(offset + rowSize * height);
  buffer.write("BM", 0, "latin1");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(offset, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(topDown ? -height : height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bitsPerPixel, 28);
  buffer.writeUInt32LE(compression, 30);
  for (let y = 0; y < height; y += 1) {
    const stored = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const at = offset + stored * rowSize + x * bytesPerPixel;
      const red = x === 0 && y === 0;
      buffer[at] = red ? 0 : 255; // B
      buffer[at + 1] = 0; // G
      buffer[at + 2] = red ? 255 : 0; // R
      if (bitsPerPixel === 32) buffer[at + 3] = alpha;
    }
  }
  return buffer;
}
