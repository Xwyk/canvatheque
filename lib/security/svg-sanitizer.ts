import { createPurifier, parseXml } from "@/lib/security/dom";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const SVG_MAX_NODES = 50_000;

export type SvgCheck = { ok: true; svg: string } | { ok: false; error: string };

const refuse = (error: string): SvgCheck => ({ ok: false, error });

/** `url(…)` vers autre chose qu'un fragment local (`url(#degrade)`). */
const EXTERNAL_URL = /url\s*\(\s*(?!["']?#)/i;
const SAFE_IMAGE_DATA = /^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i;

/** Retire la déclaration XML et un DOCTYPE externe simple ; refuse toute déclaration d'entité. */
function stripPrologue(text: string): string | null {
  const withoutDeclaration = text.replace(/^﻿/, "").replace(/^\s*<\?xml[^?]*\?>/i, "");
  if (/<!ENTITY/i.test(withoutDeclaration)) return null;
  // DOCTYPE des exports Illustrator / Inkscape (DTD externe, jamais chargée) : sans sous-ensemble interne.
  const withoutDoctype = withoutDeclaration.replace(/<!DOCTYPE[^>[]*>/i, "");
  return /<!DOCTYPE/i.test(withoutDoctype) ? null : withoutDoctype;
}

function isAllowedReference(element: Element, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return true;
  return element.localName === "image" && SAFE_IMAGE_DATA.test(trimmed);
}

/**
 * Nettoie un SVG envoyé par un membre (plan § 8) : analyse XML stricte, refus des entités et
 * des fichiers trop complexes, puis DOMPurify (profil SVG) complété de règles propres :
 * pas de `foreignObject`, liens et `url()` limités aux fragments locaux, images embarquées
 * PNG/JPEG seulement, `<style>` sans `@import` ni ressource externe.
 */
export function sanitizeSvg(buffer: Uint8Array, maxBytes: number): SvgCheck {
  if (buffer.length === 0) return refuse("empty");
  if (buffer.length > maxBytes) return refuse("tooLarge");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return refuse("svgInvalid");
  }
  const body = stripPrologue(text);
  if (body === null) return refuse("svgEntities");

  let document: Document;
  try {
    document = parseXml(body);
  } catch {
    return refuse("svgInvalid");
  }
  const root = document.documentElement;
  if (root?.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE) {
    return refuse("svgInvalid");
  }
  if (document.getElementsByTagName("*").length > SVG_MAX_NODES) return refuse("svgTooComplex");

  const { purify, window } = createPurifier();
  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style") {
      const css = node.textContent ?? "";
      if (/@import/i.test(css) || EXTERNAL_URL.test(css)) node.parentNode?.removeChild(node);
    }
  });
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    const name = data.attrName.toLowerCase();
    if (name === "href" || name === "xlink:href") {
      data.keepAttr = isAllowedReference(node, data.attrValue);
    } else if (EXTERNAL_URL.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });

  const fragment = purify.sanitize(new window.XMLSerializer().serializeToString(root), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    FORBID_TAGS: ["foreignObject", "script", "iframe", "a"],
    RETURN_DOM: true,
  });
  const container = fragment as unknown as Element;
  const svg = container.localName === "svg" ? container : container.querySelector("svg");
  if (!svg) return refuse("svgInvalid");

  const output = `<?xml version="1.0" encoding="UTF-8"?>\n${new window.XMLSerializer().serializeToString(svg)}`;
  try {
    parseXml(output);
  } catch {
    return refuse("svgInvalid");
  }
  return { ok: true, svg: output };
}
