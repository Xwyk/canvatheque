import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Texte de contenu (messages) avec deux balisages en ligne : `**gras**` et
 * `[libellé](/chemin)` (lien interne) ou `[libellé](https://…)` / `mailto:` (lien externe).
 * Aucun HTML n'est interprété.
 */
type Token = { start: number; end: number; bold?: string; label?: string; href?: string };

/** Prochain balisage à partir de `from` (lecture linéaire, sans expression régulière). */
function nextToken(text: string, from: number): Token | null {
  for (let i = from; i < text.length; i += 1) {
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) return { start: i, end: close + 2, bold: text.slice(i + 2, close) };
    } else if (text[i] === "[") {
      const middle = text.indexOf("](", i + 1);
      const close = middle === -1 ? -1 : text.indexOf(")", middle + 2);
      const label = middle === -1 ? "" : text.slice(i + 1, middle);
      const href = close === -1 ? "" : text.slice(middle + 2, close);
      if (label && href && !label.includes("[") && !/\s/.test(href)) {
        return { start: i, end: close + 1, label, href };
      }
    }
  }
  return null;
}

const linkClass = "font-semibold text-primary underline";

function renderToken({ start, bold, label, href }: Token): ReactNode {
  const key = String(start);
  if (bold !== undefined) return <strong key={key}>{bold}</strong>;
  if (href!.startsWith("/")) {
    return (
      <Link key={key} href={href!} className={linkClass}>
        {label}
      </Link>
    );
  }
  if (href!.startsWith("https:") || href!.startsWith("mailto:")) {
    return (
      <a key={key} href={href} className={linkClass} rel="noopener">
        {label}
      </a>
    );
  }
  return label;
}

export function inlineText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (let token = nextToken(text, 0); token; token = nextToken(text, token.end)) {
    if (token.start > last) nodes.push(text.slice(last, token.start));
    nodes.push(renderToken(token));
    last = token.end;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Remplace `{nom}` par la valeur fournie (valeurs d'environnement des pages légales). */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}
