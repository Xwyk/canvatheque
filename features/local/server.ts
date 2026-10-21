import "server-only";
import { CwprjError, extractCwprjPreview } from "@/lib/cwprj";
import type { CwprjKey } from "@/lib/cwprj-keys";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { buildPreviewSet, ImageError } from "@/lib/images/preview";
import { checkCwprjContent } from "@/lib/security/file-validation";
import { z } from "@/lib/validation";

/**
 * Points d'accès du mode local (ADR-014), appelés seulement sur action explicite :
 * rapprochement par empreintes, miniature d'un seul `.cwprj`.
 */

export const LOOKUP_MAX_CHECKSUMS = 500;

export const lookupSchema = z.object({
  checksums: z
    .array(z.string().regex(/^[0-9a-f]{64}$/))
    .min(1)
    .max(LOOKUP_MAX_CHECKSUMS),
});

export type LookupMatch = { checksum: string; slug: string; title: string };

/** Modèles publiés dont le fichier a l'une de ces empreintes (le plus ancien par empreinte). */
export async function lookupChecksums(
  prisma: PrismaClient,
  checksums: string[],
): Promise<LookupMatch[]> {
  const rows = await prisma.model.findMany({
    where: { fileChecksum: { in: [...new Set(checksums)] }, status: "PUBLISHED", deletedAt: null },
    orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
    select: { fileChecksum: true, slug: true, title: true },
  });
  const seen = new Set<string>();
  const matches: LookupMatch[] = [];
  for (const row of rows) {
    if (seen.has(row.fileChecksum!)) continue;
    seen.add(row.fileChecksum!);
    matches.push({ checksum: row.fileChecksum!, slug: row.slug, title: row.title });
  }
  return matches;
}

export type CwprjPreviewResult = { ok: true; webp: Buffer } | { ok: false; reason: string };

/**
 * Miniature d'un `.cwprj` envoyé depuis le mode local : variante WebP 800 px du pipeline
 * d'aperçus, rien n'est stocké. Raison de l'échec renvoyée pour un message adapté.
 */
export async function cwprjPreview(buffer: Buffer, keys: CwprjKey[]): Promise<CwprjPreviewResult> {
  const check = await checkCwprjContent(buffer);
  if (!check.ok) return { ok: false, reason: check.error };
  try {
    const { image } = await extractCwprjPreview(buffer, keys);
    if (!image) return { ok: false, reason: "noThumbnail" };
    const set = await buildPreviewSet(image);
    return { ok: true, webp: set.variants.find((variant) => variant.suffix === "md")!.buffer };
  } catch (error) {
    if (error instanceof CwprjError) return { ok: false, reason: error.reason };
    if (error instanceof ImageError) return { ok: false, reason: error.code };
    throw error;
  }
}
