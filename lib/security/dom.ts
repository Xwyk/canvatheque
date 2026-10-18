import createDOMPurify, { type DOMPurify } from "dompurify";
import { JSDOM } from "jsdom";

/**
 * DOMPurify côté serveur sur une fenêtre jsdom. Chaque appel crée une instance neuve :
 * les hooks d'un nettoyage (SVG, Markdown) ne se mélangent pas.
 */
export function createPurifier(): { purify: DOMPurify; window: JSDOM["window"] } {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  return { purify: createDOMPurify(window), window };
}

/** Analyse XML stricte (les erreurs de bonne formation lèvent une exception). */
export function parseXml(text: string): Document {
  return new JSDOM(text, { contentType: "image/svg+xml" }).window.document;
}
