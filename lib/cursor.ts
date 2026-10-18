/**
 * Curseur de pagination opaque (ADR-007) : couple (valeur de tri, id) encodé en base64url.
 * La valeur est une chaîne pour rester exacte (date ISO, entier, score arrondi).
 */
export type Cursor = { value: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.value, cursor.id]), "utf8").toString("base64url");
}

/** Curseur décodé, ou null s'il est absent ou altéré. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      parsed[1].length > 0 &&
      parsed[1].length <= 64
    ) {
      return { value: parsed[0], id: parsed[1] };
    }
  } catch {
    // curseur altéré : première page
  }
  return null;
}
