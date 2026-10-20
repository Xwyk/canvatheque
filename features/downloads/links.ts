/** Page de téléchargement officielle de CanvasWorkspace (Brother, Windows et macOS). */
export const CANVAS_WORKSPACE_URL =
  "https://support.canvasworkspace.brother.com/cwsinfo/download_cws/en.html";

/** Système du visiteur, pour l'ordre « Windows ou macOS ». */
export type ClientOs = "mac" | "windows";

export function clientOs(userAgent: string | null): ClientOs {
  return /Mac OS X|Macintosh/i.test(userAgent ?? "") ? "mac" : "windows";
}

/** Point de téléchargement (302 vers une URL présignée ; JSON avec `Accept: application/json`). */
export const downloadHref = (slug: string) => `/api/models/${encodeURIComponent(slug)}/download`;

/** Fiche avec relance du téléchargement (retour après connexion ou inscription). */
export const downloadReturnPath = (slug: string) =>
  `/models/${encodeURIComponent(slug)}?download=1`;
