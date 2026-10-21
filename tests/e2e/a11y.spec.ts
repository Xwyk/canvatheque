import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./support/members";
import { useColorScheme } from "./support/theme";

/**
 * Balayage d'accessibilité (étape 8) : chaque écran de l'application, en thème clair et
 * sombre, sans violation axe (WCAG 2.2 AA) ni défilement horizontal. Données : seed de
 * démonstration (npm run db:seed).
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

const PUBLIC_PAGES = [
  "/",
  "/models",
  "/models?q=papillon&format=SVG",
  "/categories",
  "/categories/nature-et-animaux",
  "/models/papillon-monarque",
  "/models/rosace-de-fenetre",
  "/members/claire-cuts",
  "/local",
  "/about",
  "/help",
  "/legal",
  "/legal/privacy",
  "/legal/terms",
  "/login",
  "/signup",
  "/forgot-password",
  "/page-inconnue",
];

const MEMBER_PAGES = ["/me", "/me/favorites", "/me/downloads", "/me/settings", "/publish"];

async function audit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, path).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} : défilement horizontal`).toBeLessThanOrEqual(0);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`thème ${colorScheme}`, () => {
    test("pages publiques et d'authentification", async ({ page }) => {
      test.slow();
      await useColorScheme(page, colorScheme);
      for (const path of PUBLIC_PAGES) await audit(page, path);
    });

    test("espace membre et publication", async ({ page }, testInfo) => {
      await signUp(page, testInfo, `a11y${colorScheme}`);
      await useColorScheme(page, colorScheme);
      for (const path of MEMBER_PAGES) await audit(page, path);
    });
  });
}
