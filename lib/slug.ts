/** Minuscules, sans accents, mots séparés par des tirets (ex. « Cœur d'été » → « coeur-d-ete »). */
export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-")
    .slice(0, maxLength);
  return slug.endsWith("-") ? slug.slice(0, -1) : slug;
}
