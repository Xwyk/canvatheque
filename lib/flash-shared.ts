/** Partagé client/serveur : nom du cookie flash et lecture sûre de son contenu. */
export const FLASH_COOKIE = "canvatheque.flash";

export type Flash = { key: string; values?: Record<string, string> };

export function parseFlash(raw: string | undefined): Flash | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (value && typeof value === "object" && typeof (value as Flash).key === "string") {
      const { key, values } = value as Flash;
      // Seules les clés de la section auth.flash sont acceptées.
      if (!/^auth\.flash\.[a-zA-Z]+$/.test(key)) return null;
      return { key, values: values && typeof values === "object" ? values : undefined };
    }
  } catch {
    // cookie altéré : ignoré
  }
  return null;
}
