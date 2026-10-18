import { createPurifier } from "@/lib/security/dom";
import { markdownToTextWith, renderMarkdownWith } from "@/lib/security/markdown-core";

/** Rendu serveur d'une description Markdown (HTML nettoyé). */
export function renderMarkdown(markdown: string): string {
  return renderMarkdownWith(createPurifier().purify, markdown);
}

export function markdownToText(markdown: string): string {
  return markdownToTextWith(createPurifier().purify, markdown);
}
