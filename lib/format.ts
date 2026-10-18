const UNITS = ["o", "Ko", "Mo", "Go"] as const;

/** Taille lisible en français (base 1024) : 188 416 → « 184 Ko », 1 258 291 → « 1,2 Mo ». */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
  return `${number} ${UNITS[unit]}`;
}

/** Titre de départ d'un brouillon à partir du nom de fichier (« papillon-ajoure.svg » → « Papillon ajoure »). */
export function titleFromFileName(fileName: string, maxLength = 80): string {
  const base = fileName
    .replace(/\.[^.]*$/, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = base.charAt(0).toLocaleUpperCase("fr") + base.slice(1);
  return (title || "Sans titre").slice(0, maxLength).trim();
}
