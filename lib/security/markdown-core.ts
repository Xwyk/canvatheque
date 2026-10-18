import type { DOMPurify } from "dompurify";
import { Marked } from "marked";

/**
 * Markdown limité des descriptions (gras, italique, listes, liens) : le HTML brut est
 * échappé par marked puis tout passe par une liste blanche DOMPurify. Partagé entre le
 * serveur (jsdom) et le navigateur (aperçu de l'étape Relecture).
 */

export const MARKDOWN_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "a", "code"];

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Aucun HTML brut : affiché tel quel, échappé.
    html: ({ text }) => escapeHtml(text),
    // Titres, citations, images, tableaux : réduits à leur texte (liste blanche courte).
    heading({ tokens }) {
      return `<p><strong>${this.parser.parseInline(tokens)}</strong></p>`;
    },
    image: ({ text }) => escapeHtml(text),
  },
});

/** Liens http(s) et mailto uniquement. */
const SAFE_LINK = /^(https?:|mailto:)/i;

export function renderMarkdownWith(purify: DOMPurify, markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (SAFE_LINK.test(href)) {
        node.setAttribute("rel", "nofollow noopener noreferrer ugc");
        node.setAttribute("target", "_blank");
      } else {
        node.removeAttribute("href");
      }
    }
  });
  try {
    return purify.sanitize(html, {
      ALLOWED_TAGS: MARKDOWN_TAGS,
      ALLOWED_ATTR: ["href", "rel", "target"],
    });
  } finally {
    purify.removeHook("afterSanitizeAttributes");
  }
}

/** Texte brut d'une description (recherche, résumés). */
export function markdownToTextWith(purify: DOMPurify, markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  const text = purify.sanitize(html.replace(/<\/(p|li)>/g, " </$1>"), {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
