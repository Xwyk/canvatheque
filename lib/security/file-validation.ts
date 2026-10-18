import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { ModelFormat } from "@/lib/generated/prisma/enums";

/** Règles déclaratives des fichiers envoyés (plan § 8). Les messages sont des clés `errors.upload.*`. */

export const FILE_NAME_MAX_LENGTH = 120;
export const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
export const PREVIEW_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type PreviewMime = (typeof PREVIEW_MIME_TYPES)[number];

const MODEL_EXTENSIONS: Record<string, ModelFormat> = { cwprj: "CWPRJ", svg: "SVG" };
const PREVIEW_EXTENSIONS: Record<string, PreviewMime> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Extensions intermédiaires refusées (« modele.exe.svg ») : exécutables, scripts, pages web.
 * Un point dans le nom reste permis (« carte.noel.svg »).
 */
const DANGEROUS_INNER_EXTENSIONS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "scr",
  "pif",
  "msi",
  "dll",
  "jar",
  "apk",
  "app",
  "dmg",
  "sh",
  "ps1",
  "vbs",
  "js",
  "mjs",
  "php",
  "py",
  "pl",
  "rb",
  "html",
  "htm",
  "xhtml",
  "hta",
]);

/** Nom de fichier affichable et sûr : sans chemin, sans caractères de contrôle, 1 à 120 caractères. */
export function sanitizeFileName(input: string): string | null {
  const base = input.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}"<>|:*?]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.startsWith(".") || cleaned.length > FILE_NAME_MAX_LENGTH) return null;
  return cleaned;
}

function extensions(fileName: string): { last: string; inner: string[] } {
  const parts = fileName.toLowerCase().split(".");
  return { last: parts.length > 1 ? parts.at(-1)! : "", inner: parts.slice(1, -1) };
}

function hasDangerousInnerExtension(fileName: string): boolean {
  return extensions(fileName).inner.some((ext) => DANGEROUS_INNER_EXTENSIONS.has(ext));
}

export type DeclaredFile = { fileName: string; size: number; mime: string };
export type FileCheck<T> = { ok: true; value: T } | { ok: false; error: string };

const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

function checkName(fileName: string): FileCheck<string> {
  const name = sanitizeFileName(fileName);
  if (!name) return refuse("fileName");
  if (hasDangerousInnerExtension(name)) return refuse("doubleExtension");
  return { ok: true, value: name };
}

/** Contrôle déclaratif d'un fichier de modèle avant l'envoi (extension, nom, taille). */
export function checkDeclaredModel(
  file: DeclaredFile,
  maxBytes: number,
): FileCheck<{ name: string; format: ModelFormat }> {
  const name = checkName(file.fileName);
  if (!name.ok) return name;
  const format = MODEL_EXTENSIONS[extensions(name.value).last];
  if (!format) return refuse("extension");
  if (file.size < 1) return refuse("empty");
  if (file.size > maxBytes) return refuse("tooLarge");
  return { ok: true, value: { name: name.value, format } };
}

/** Contrôle déclaratif d'une image d'aperçu (PNG, JPEG ou WebP, 5 Mo au plus). */
export function checkDeclaredPreview(file: DeclaredFile): FileCheck<{ name: string }> {
  const name = checkName(file.fileName);
  if (!name.ok) return name;
  const expected = PREVIEW_EXTENSIONS[extensions(name.value).last];
  if (!expected || !(PREVIEW_MIME_TYPES as readonly string[]).includes(file.mime)) {
    return refuse("imageType");
  }
  if (file.size < 1) return refuse("empty");
  if (file.size > PREVIEW_MAX_BYTES) return refuse("imageTooLarge");
  return { ok: true, value: { name: name.value } };
}

export function formatFromFileName(fileName: string): ModelFormat | null {
  return MODEL_EXTENSIONS[extensions(fileName).last] ?? null;
}

export function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Débuts de fichiers exécutables ou de scripts. Signatures d'au moins 3 octets : un vrai
 * `.cwprj` est un bloc opaque (octets quasi aléatoires) qu'une signature de 2 octets
 * rejetterait à tort une fois sur 65 536.
 */
const EXECUTABLE_SIGNATURES: readonly number[][] = [
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32 bits
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64 bits
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O universel / classe Java
  [0x23, 0x21, 0x2f], // « #!/ » : script
  [0x23, 0x21, 0x20], // « #! / »
];

/** Exécutable Windows : « MZ » puis en-tête « PE\0\0 » à l'adresse lue en 0x3C. */
function isPortableExecutable(buffer: Uint8Array): boolean {
  if (buffer.length < 0x40 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) return false;
  const offset = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(
    0x3c,
    true,
  );
  if (offset + 4 > buffer.length) return false;
  return startsWith(buffer.subarray(offset), [0x50, 0x45, 0x00, 0x00]);
}

/** Types détectés par file-type ; « MZ » seul (x-msdownload) est traité par isPortableExecutable. */
const EXECUTABLE_MIME = new Set([
  "application/x-elf",
  "application/x-mach-binary",
  "application/x-sharedlib",
  "application/x-msi",
  "application/java-archive",
  "application/vnd.android.package-archive",
  "application/wasm",
]);

function startsWith(buffer: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}

/** Début textuel du fichier, sans BOM ni espaces, en minuscules. */
function textHead(buffer: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false })
    .decode(buffer.subarray(0, 512))
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();
}

const MARKUP_PATTERN = /<(!doctype\s+html|html[\s>]|head[\s>]|body[\s>]|script[\s>]|svg[\s>])/;

/**
 * Contenu d'un `.cwprj`. Format non documenté ; un fichier réel examiné le 18/10/2026 est un
 * bloc opaque (entropie 8 bits/octet, taille multiple de 16 : chiffré) sans signature. Règle :
 * non vide, ni exécutable, ni script, ni page HTML ou SVG ; tout autre contenu est admis.
 */
export async function checkCwprjContent(buffer: Uint8Array): Promise<FileCheck<null>> {
  if (buffer.length === 0) return refuse("empty");
  if (
    isPortableExecutable(buffer) ||
    EXECUTABLE_SIGNATURES.some((signature) => startsWith(buffer, signature))
  ) {
    return refuse("signature");
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && EXECUTABLE_MIME.has(detected.mime)) return refuse("signature");
  if (MARKUP_PATTERN.test(textHead(buffer))) return refuse("signature");
  return { ok: true, value: null };
}

/** Image d'aperçu : la signature réelle doit être PNG, JPEG ou WebP. */
export async function detectPreviewImage(buffer: Uint8Array): Promise<FileCheck<PreviewMime>> {
  if (buffer.length === 0) return refuse("empty");
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !(PREVIEW_MIME_TYPES as readonly string[]).includes(detected.mime)) {
    return refuse("imageType");
  }
  return { ok: true, value: detected.mime as PreviewMime };
}
