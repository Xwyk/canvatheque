import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseXml } from "@/lib/security/dom";
import { SVG_MAX_NODES, sanitizeSvg } from "@/lib/security/svg-sanitizer";

const fixture = (name: string) => readFileSync(`tests/fixtures/svg/${name}`);
const MAX = 20 * 1024 * 1024;

function clean(name: string): string {
  const result = sanitizeSvg(fixture(name), MAX);
  if (!result.ok) throw new Error(`refusé : ${result.error}`);
  return result.svg;
}

describe("sanitizeSvg", () => {
  it("conserve un SVG légitime (DOCTYPE externe, dégradé, use local, casse des attributs)", () => {
    const svg = clean("valid-illustrator.svg");
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 120 80"');
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('clip-path="url(#c)"');
    expect(svg).toContain('xlink:href="#petale"');
    expect(svg).toContain('href="#petale"');
    expect(svg).toContain(".trait{stroke:#221F3A;fill:url(#g)}");
    expect(svg).not.toContain("DOCTYPE");
    // La sortie reste un XML bien formé.
    expect(parseXml(svg).documentElement.localName).toBe("svg");
  });

  it.each([
    ["script.svg", ["<script", "alert"]],
    ["event-handler.svg", ["onload", "onclick", "onmouseover"]],
    ["foreign-object.svg", ["foreignObject", "iframe", "evil"]],
    ["javascript-href.svg", ["javascript:", "<a"]],
    ["external-use.svg", ["evil.example"]],
    ["external-image.svg", ["evil.example", "file:"]],
    ["style-import.svg", ["@import", "evil.example"]],
    ["style-attribute.svg", ["evil.example"]],
    ["animate-href.svg", ["javascript:", "<animate", "<set", "onmouseover"]],
  ])("neutralise %s", (name, forbidden) => {
    const svg = clean(name);
    for (const fragment of forbidden) expect(svg).not.toContain(fragment);
  });

  it("garde les styles et images PNG embarquées sûrs, retire les autres data:", () => {
    expect(clean("style-import.svg")).toContain("circle{fill:#C81E4B}");
    expect(clean("style-attribute.svg")).toContain('style="fill:#0F7C7E"');
    const svg = clean("data-uri.svg");
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).not.toContain("data:image/svg+xml");
    expect(svg).not.toContain("data:text/html");
  });

  it.each([
    ["entity-xxe.svg", "svgEntities"],
    ["billion-laughs.svg", "svgEntities"],
    ["doctype-internal-subset.svg", "svgEntities"],
    ["malformed.svg", "svgInvalid"],
    ["not-svg.svg", "svgInvalid"],
    ["no-namespace.svg", "svgInvalid"],
    ["invalid-utf8.svg", "svgInvalid"],
    ["too-many-nodes.svg", "svgTooComplex"],
  ])("refuse %s (%s)", (name, error) => {
    expect(sanitizeSvg(fixture(name), MAX)).toEqual({ ok: false, error });
  });

  it("refuse un fichier vide ou trop lourd", () => {
    expect(sanitizeSvg(new Uint8Array(), MAX)).toEqual({ ok: false, error: "empty" });
    expect(sanitizeSvg(fixture("script.svg"), 10)).toEqual({ ok: false, error: "tooLarge" });
  });

  it("borne la complexité à SVG_MAX_NODES éléments", () => {
    expect(SVG_MAX_NODES).toBe(50_000);
    const ok = `<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(SVG_MAX_NODES - 1)}</svg>`;
    expect(sanitizeSvg(Buffer.from(ok), MAX).ok).toBe(true);
  });
});
