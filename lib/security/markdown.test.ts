import { describe, expect, it } from "vitest";
import { markdownToText, renderMarkdown } from "@/lib/security/markdown";
import { renderMarkdownInBrowser } from "@/lib/security/markdown-client";

describe("renderMarkdown", () => {
  it("rend gras, italique, listes et liens sûrs", () => {
    const html = renderMarkdown(
      "**gras** et *italique*\n\n- un\n- deux\n\n[site](https://example.com)",
    );
    expect(html).toContain("<strong>gras</strong>");
    expect(html).toContain("<em>italique</em>");
    expect(html).toMatch(/<ul>\s*<li>un<\/li>/);
    expect(html).toContain(
      '<a href="https://example.com" rel="nofollow noopener noreferrer ugc" target="_blank">site</a>',
    );
  });

  it("échappe le HTML brut et neutralise les liens dangereux", () => {
    const html = renderMarkdown(
      "<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html,1)",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/href="(javascript|data):/);
  });

  it("réduit titres et images à du texte", () => {
    const html = renderMarkdown("# Titre\n\n![photo](https://example.com/a.png)");
    expect(html).toContain("<p><strong>Titre</strong></p>");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<img");
    expect(html).toContain("photo");
  });

  it("accepte mailto", () => {
    expect(renderMarkdown("[écrire](mailto:a@b.fr)")).toContain('href="mailto:a@b.fr"');
  });
});

describe("markdownToText", () => {
  it("donne le texte brut pour la recherche", () => {
    expect(
      markdownToText("**Cœur** ajouré\n\n- papier 160 g\n- [tuto](https://x.fr) <b>x</b>"),
    ).toBe("Cœur ajouré papier 160 g tuto <b>x</b>");
  });
});

describe("renderMarkdownInBrowser", () => {
  it("renvoie une chaîne vide hors navigateur", () => {
    expect(renderMarkdownInBrowser("**x**")).toBe("");
  });
});
