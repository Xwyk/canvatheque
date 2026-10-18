import DOMPurify from "dompurify";
import { renderMarkdownWith } from "@/lib/security/markdown-core";

/** Rendu navigateur (aperçu de l'étape Relecture) ; chaîne vide hors navigateur. */
export function renderMarkdownInBrowser(markdown: string): string {
  if (typeof window === "undefined" || !DOMPurify.isSupported) return "";
  return renderMarkdownWith(DOMPurify, markdown);
}
