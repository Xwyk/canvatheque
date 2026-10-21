/** Appels réseau du mode local, déclenchés uniquement par un clic (ADR-014). */

export type LookupMatch = { checksum: string; slug: string; title: string };

/** Nombre maximal d'empreintes par vérification (même borne que le serveur). */
export const LOOKUP_LIMIT = 500;

/** Envoie les seules empreintes et renvoie les modèles publiés correspondants. */
export async function lookupOnCanvatheque(checksums: string[]): Promise<LookupMatch[]> {
  const response = await fetch("/api/local/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checksums: checksums.slice(0, LOOKUP_LIMIT) }),
  });
  if (!response.ok) throw new Error(`lookup ${response.status}`);
  return ((await response.json()) as { matches: LookupMatch[] }).matches;
}

export type ThumbnailResult =
  | { ok: true; image: Blob }
  | { ok: false; reason: "unauthorized" | "noThumbnail" | "unreadable" | "rateLimited" | "error" };

/** Envoie ce seul fichier `.cwprj` et reçoit sa miniature WebP (rien n'est conservé). */
export async function fetchCwprjThumbnail(file: File): Promise<ThumbnailResult> {
  try {
    const response = await fetch("/api/local/cwprj-preview", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (response.ok) return { ok: true, image: await response.blob() };
    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    if (response.status === 429) return { ok: false, reason: "rateLimited" };
    if (response.status === 422) {
      const { reason } = (await response.json()) as { reason?: string };
      return { ok: false, reason: reason === "noThumbnail" ? "noThumbnail" : "unreadable" };
    }
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
