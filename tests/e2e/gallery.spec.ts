import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { useColorScheme } from "./support/theme";

/** Pile Docker avec le seed de démonstration (30 modèles publiés, 9 catégories). */

const cards = (page: Page) => page.locator("main ul li article");

async function openFilters(page: Page, isMobile: boolean) {
  if (!isMobile) return page.getByRole("complementary", { name: "Filtres" });
  await page.getByRole("button", { name: /^Filtres/ }).click();
  return page.getByRole("dialog", { name: "Filtres" });
}

test.describe("galerie", () => {
  test("affiche la première page, puis charge la suite au défilement", async ({ page }) => {
    await page.goto("/models");
    await expect(page.getByRole("heading", { level: 1, name: "Tous les modèles" })).toBeVisible();
    await expect(page.getByText(/^\d+ modèles$/)).toBeVisible();
    await expect(cards(page)).toHaveCount(24);

    await page.getByRole("link", { name: "Charger plus de modèles" }).scrollIntoViewIfNeeded();
    await expect.poll(() => cards(page).count()).toBeGreaterThan(24);
    // Le lien disparaît à la dernière page (le nombre exact dépend des E2E déjà passés).
    const total = Number((await page.getByText(/^\d+ modèles$/).textContent())!.split(" ")[0]);
    if (total <= 48) {
      await expect(page.getByRole("link", { name: "Charger plus de modèles" })).toHaveCount(0);
    }
  });

  test("filtre sans recharger la page et garde les filtres dans l'URL", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/models");
    const marker = await page.evaluate(() => ((window as { marker?: number }).marker = 42));
    const filters = await openFilters(page, isMobile);
    await filters.getByRole("checkbox", { name: "SVG" }).check();
    await expect(page).toHaveURL(/\/models\?format=svg$/);
    await filters.getByRole("checkbox", { name: "Libre, même commercial" }).check();
    await expect(page).toHaveURL(/format=svg&license=free/);
    // Navigation côté client : l'état de la page JavaScript est conservé.
    expect(await page.evaluate(() => (window as { marker?: number }).marker)).toBe(marker);
    if (isMobile) await page.getByRole("button", { name: /^Voir|Aucun modèle/ }).click();

    await expect(page.getByRole("link", { name: "Retirer le filtre SVG" })).toBeVisible();
    await page.getByRole("link", { name: "Retirer le filtre SVG" }).click();
    await expect(page).toHaveURL(/\/models\?license=free$/);

    await page.getByRole("combobox", { name: "Trier par" }).selectOption("downloads");
    await expect(page).toHaveURL(/license=free&sort=downloads/);

    await page.goBack();
    await expect(page).toHaveURL(/\/models\?license=free$/);
  });

  test("cherche avec accents en conservant les filtres", async ({ page }) => {
    await page.goto("/models?format=svg");
    const search = page.getByRole("searchbox", { name: "Rechercher un modèle" });
    await search.fill("etoile");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/models\?q=etoile&format=svg$/);
    await expect(page.getByRole("combobox", { name: "Trier par" })).toHaveValue("relevance");
  });

  test("affiche l'état vide illustré", async ({ page }) => {
    await page.goto("/models?q=zzzzzzzz");
    await expect(page.getByRole("heading", { name: "Aucun modèle ne correspond" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Voir tous les modèles" }).click();
    await expect(page).toHaveURL(/\/models$/);
  });

  test("fonctionne sans JavaScript (formulaire GET)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/models");
    // Page suivante : simple lien avec curseur.
    await page.getByRole("link", { name: "Charger plus de modèles" }).click();
    await expect(page).toHaveURL(/\/models\?cursor=/);
    await expect(cards(page).first()).toBeVisible();

    const filters = page.getByRole("complementary", { name: "Filtres" });
    await expect(filters).toBeVisible();
    await filters.getByRole("checkbox", { name: "SVG" }).check();
    await filters.getByRole("button", { name: "Appliquer les filtres" }).click();
    await expect(page).toHaveURL(/\/models\?format=svg$/);
    await context.close();
  });

  test("pas de défilement horizontal à 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/models?format=svg");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Filtres (1)" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Filtres" })).toBeHidden();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`galerie sans violation axe en thème ${colorScheme}`, async ({ page }) => {
      await useColorScheme(page, colorScheme);
      await page.goto("/models?format=svg");
      await expect(cards(page).first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("catégories", () => {
  test("l'index mène à la galerie préfiltrée de la catégorie", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1, name: "Catégories" })).toBeVisible();
    const list = page.getByRole("list", { name: "Liste des catégories" });
    await expect(list.getByRole("link")).toHaveCount(9);
    await list.getByRole("link", { name: /Nature et animaux/ }).click();

    await expect(page).toHaveURL(/\/categories\/nature-et-animaux$/);
    await expect(page.getByRole("heading", { level: 1, name: "Nature et animaux" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Retirer le filtre Nature et animaux" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Retirer le filtre Nature et animaux" }).click();
    await expect(page).toHaveURL(/\/models$/);
  });

  test("index sans violation axe", async ({ page }) => {
    await page.goto("/categories");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
