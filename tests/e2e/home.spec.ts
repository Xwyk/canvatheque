import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Le contenu du catalogue dépend des autres scénarios (exécution parallèle) : les assertions
// acceptent un catalogue vide comme rempli.
test.describe("accueil et référencement", () => {
  test("affiche « Derniers modèles » (cartes ou invitation à publier)", async ({ page }) => {
    await page.goto("/");
    const latest = page.getByRole("region", { name: "Derniers modèles" });
    await expect(latest.getByRole("heading", { level: 2, name: "Derniers modèles" })).toBeVisible();

    const cards = latest.getByRole("article");
    if ((await cards.count()) > 0) {
      expect(await cards.count()).toBeLessThanOrEqual(8);
      await expect(
        latest.getByRole("link", { name: "Tout voir les derniers modèles" }),
      ).toHaveAttribute("href", "/models");
      const first = cards.first().getByRole("link").first();
      await expect(first).toHaveAttribute("href", /^\/models\/[a-z0-9-]+$/);
      // Populaires : au plus 4 cartes, avant les derniers modèles.
      const popular = page.getByRole("region", { name: "Populaires cette semaine" });
      if ((await popular.count()) > 0) {
        expect(await popular.getByRole("article").count()).toBeLessThanOrEqual(4);
      }
    } else {
      await expect(latest.getByText("Le catalogue attend ses premiers modèles")).toBeVisible();
      await expect(latest.getByRole("link", { name: "Publier un modèle" })).toBeVisible();
    }

    const results = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("pas de défilement horizontal à 360 px ni à 1440 px", async ({ page }) => {
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test("expose les métadonnées de partage et les données structurées", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    // Next écrit l'URL racine sans barre finale.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /^https?:\/\/[^/]+\/?$/,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Canvathèque",
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "fr_FR");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toMatch(/\/og-default\.png$/);
    const image = await request.get(new URL(ogImage!).pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");

    const json = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(json!) as { "@type": string }[];
    expect(data.map((entry) => entry["@type"])).toEqual(["WebSite", "Organization"]);
  });

  test("robots.txt exclut les pages privées et annonce le plan du site", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Disallow: /models/*/edit");
    expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("sitemap.xml liste les pages publiques", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("<urlset");
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/models<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/categories\/[a-z0-9-]+<\/loc>/);
  });
});
