import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { useColorScheme } from "./support/theme";

const HOME_TITLE = "Des modèles de découpe, partagés par celles et ceux qui les créent.";

test.describe("socle", () => {
  test("l'API de santé répond", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", checks: { db: "ok", storage: "ok" } });
  });

  test("l'accueil s'affiche avec ses en-têtes de sécurité", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-request-id"]).toBeTruthy();

    await expect(page.getByRole("heading", { level: 1, name: HOME_TITLE })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Parcourir par catégorie" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cartes et papeterie" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Un compte gratuit, et tout s'ouvre." }),
    ).toBeVisible();
  });

  test("la recherche mène à la galerie", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Rechercher un modèle" }).fill("papillon");
    await page.getByRole("searchbox", { name: "Rechercher un modèle" }).press("Enter");
    await expect(page).toHaveURL(/\/models\?q=papillon$/);
  });

  test("le lien d'évitement mène au contenu au clavier", async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      isMobile || browserName === "webkit",
      "Tab ne parcourt pas les liens par défaut sur Safari/mobile",
    );
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Aller au contenu principal" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#contenu")).toBeFocused();
  });

  test("animations réduites : l'illustration du hero reste visible", async ({ page, isMobile }) => {
    test.skip(isMobile, "illustration masquée sous 1024 px");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const cards = page.locator("section [aria-hidden=true] > div");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) await expect(card).toHaveCSS("opacity", "1");
  });

  test("une page inconnue renvoie la 404 illustrée", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page s'est envolée" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
  });

  test("pas de défilement horizontal à 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Navigation mobile" })).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`accueil sans violation axe en thème ${colorScheme}`, async ({ page }) => {
      await useColorScheme(page, colorScheme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveClass(
        colorScheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
