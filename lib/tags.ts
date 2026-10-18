export const MAX_TAGS = 10;
export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 30;

/** Forme canonique d'un mot-clé : minuscules, sans accents, espaces simples (« Carte de Vœux » → « carte de voeux »). */
export function normalizeTag(input: string): string {
  return input
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isValidTag(tag: string): boolean {
  return tag.length >= TAG_MIN_LENGTH && tag.length <= TAG_MAX_LENGTH;
}

/** Normalise, filtre et dédoublonne une liste de mots-clés (ordre conservé, MAX_TAGS au plus). */
export function normalizeTags(inputs: readonly string[]): string[] {
  const result: string[] = [];
  for (const input of inputs) {
    const tag = normalizeTag(input);
    if (isValidTag(tag) && !result.includes(tag)) result.push(tag);
    if (result.length === MAX_TAGS) break;
  }
  return result;
}
