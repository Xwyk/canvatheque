import { expect, test, type Locator, type Page } from "@playwright/test";
import { signUp } from "./support/members";

/**
 * Parcours au clavier (étape 8) : modales (focus piégé, Échap, retour du focus sur le
 * déclencheur), filtres de la galerie et commandes de la fiche, sans souris.
 */

test.skip(
  ({ isMobile }) => isMobile,
  "parcours clavier vérifiés sur ordinateur (le mobile n'a pas de clavier physique)",
);

/** Le focus reste dans `dialog` pendant `steps` tabulations (avant et arrière). */
async function expectFocusTrapped(page: Page, dialog: Locator, steps = 8) {
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < steps; i += 1) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
  }
}

async function openWithKeyboard(trigger: Locator) {
  await trigger.focus();
  await trigger.press("Enter");
}

test("modale visiteur : focus piégé, Échap ferme et rend le focus", async ({ page }) => {
  await page.goto("/models/papillon-monarque");
  const favorite = page.getByRole("button", { name: "Favori", exact: true });
  await openWithKeyboard(favorite);
  const dialog = page.getByRole("dialog", { name: /garder vos favoris/ });
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);

  // Onglets au clavier : flèches entre Connexion et Inscription.
  const signUpTab = dialog.getByRole("tab", { name: "Inscription" });
  await signUpTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("tab", { name: "Connexion" })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "Connexion" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(favorite).toBeFocused();
});

test("signalement et partage au clavier depuis la fiche", async ({ page }, testInfo) => {
  await signUp(page, testInfo, "clavier");
  await page.goto("/models/papillon-monarque");
  const report = page.getByRole("button", { name: "Signaler" });
  await openWithKeyboard(report);
  const dialog = page.getByRole("dialog", { name: "Signaler « Papillon monarque »" });
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);

  // Choix du motif aux flèches (groupe de boutons radio), puis fermeture par Échap.
  const first = dialog.getByRole("radio").first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("radio").nth(1)).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(report).toBeFocused();
});

test("galerie : filtres cochés à la barre d'espace, état dans l'URL", async ({ page }) => {
  await page.goto("/models");
  const filters = page.getByRole("complementary", { name: "Filtres" });
  const svg = filters.getByRole("checkbox", { name: /SVG/ });
  await svg.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/format=svg/i);
  await expect(svg).toBeChecked();
  await expect(svg).toBeFocused();
});

test("menu du compte : ouverture, flèches et Échap", async ({ page }, testInfo) => {
  const member = await signUp(page, testInfo, "menu");
  const trigger = page.getByRole("button", { name: `Compte de ${member.pseudo}` });
  await openWithKeyboard(trigger);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Ouvert au clavier : focus sur la première entrée, puis flèche vers la suivante.
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
