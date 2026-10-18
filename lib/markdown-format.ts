export type MarkdownFormat = "bold" | "italic" | "list" | "link";

export type FormatResult = { value: string; selectionStart: number; selectionEnd: number };

const PLACEHOLDER: Record<MarkdownFormat, string> = {
  bold: "texte en gras",
  italic: "texte en italique",
  list: "élément",
  link: "texte du lien",
};

/**
 * Applique une mise en forme Markdown à la sélection d'une zone de texte (barre d'outils de
 * la description). Renvoie le nouveau texte et la sélection à restaurer.
 */
export function applyMarkdownFormat(
  value: string,
  start: number,
  end: number,
  format: MarkdownFormat,
): FormatResult {
  const selected = value.slice(start, end) || PLACEHOLDER[format];
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (format === "list") {
    const lineStart = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    const items = selected
      .split("\n")
      .map((line) => `- ${line.replace(/^\s*[-*]\s+/, "")}`)
      .join("\n");
    const inserted = `${lineStart}${items}`;
    return {
      value: `${before}${inserted}${after}`,
      selectionStart: start + lineStart.length,
      selectionEnd: start + inserted.length,
    };
  }

  const [open, close] =
    format === "bold" ? ["**", "**"] : format === "italic" ? ["*", "*"] : ["[", "](https://)"];
  return {
    value: `${before}${open}${selected}${close}${after}`,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + selected.length,
  };
}
