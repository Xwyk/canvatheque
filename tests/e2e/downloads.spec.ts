import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { waitForAnimations } from "./support/animations";
import { acceptTerms } from "./support/members";
import { uniqueEmail } from "./support/mailpit";

/** Pile Docker avec le seed de démonstration (« Papillon monarque » en SVG, « Rosace de fenêtre » en CWPRJ). */

const PASSWORD = "papillon-de-nuit-42";
const SVG_MODEL = "/models/papillon-monarque";
const CWPRJ_MODEL = "/models/rosace-de-fenetre";

const pseudoFor = (testInfo: TestInfo, prefix: string) =>
  `${prefix}${Date.now().toString(36)}${testInfo.project.name.slice(0, 3)}`;

/** Inscription depuis la modale visiteur (onglet Inscription ouvert par défaut). */
async function signUpInDialog(page: Page, testInfo: TestInfo, submit: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Pseudo").fill(pseudoFor(testInfo, "dl"));
  await dialog
    .getByLabel("Adresse e-mail")
    .fill(uniqueEmail("telechargement", testInfo.project.name));
  await dialog.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await acceptTerms(dialog);
  await dialog.getByRole("button", { name: submit }).click();
}

async function signUp(page: Page, testInfo: TestInfo) {
  await page.goto("/signup");
  await page.getByLabel("Pseudo").fill(pseudoFor(testInfo, "fav"));
  await page.getByLabel("Adresse e-mail").fill(uniqueEmail("favoris", testInfo.project.name));
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await acceptTerms(page);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("button", { name: /^Compte de / })).toBeVisible();
}

const downloadButton = (page: Page, isMobile: boolean, name: RegExp) =>
  isMobile
    ? page.getByRole("link", { name }).last()
    : page.getByRole("complementary").getByRole("link", { name });

test.describe("téléchargement", () => {
  test("visiteur : inscription depuis la modale puis téléchargement automatique", async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.goto(SVG_MODEL);
    await downloadButton(page, isMobile, /Télécharger le SVG/).click();
    const dialog = page.getByRole("dialog", { name: "Créez un compte gratuit pour télécharger" });
    await expect(dialog).toBeVisible();
    await waitForAnimations(dialog);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations).toEqual([]);

    const download = page.waitForEvent("download");
    await signUpInDialog(page, testInfo, "Créer mon compte et télécharger");
    const file = await download;
    expect(file.suggestedFilename()).toBe("papillon-monarque.svg");
    await expect(page).toHaveURL(new RegExp(`${SVG_MODEL}$`));
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/me/downloads");
    await expect(page.getByRole("link", { name: "Papillon monarque" })).toBeVisible();
  });

  test("CWPRJ : ouverture dans CanvasWorkspace = téléchargement et explications", async ({
    page,
    isMobile,
  }, testInfo) => {
    await signUp(page, testInfo);
    await page.goto(CWPRJ_MODEL);
    const download = page.waitForEvent("download");
    await downloadButton(page, isMobile, /Ouvrir dans CanvasWorkspace/).click();
    expect((await download).suggestedFilename()).toBe("rosace-de-fenetre.cwprj");
    const help = page.getByRole("dialog", { name: "Ouvrir le modèle dans CanvasWorkspace" });
    await expect(help).toContainText("rosace-de-fenetre.cwprj");
    await help.getByRole("checkbox", { name: "Ne plus afficher ces explications" }).check();
    await help.getByRole("button", { name: "J'ai compris" }).click();

    // Explications masquées au téléchargement suivant.
    const again = page.waitForEvent("download");
    await downloadButton(page, isMobile, /Ouvrir dans CanvasWorkspace/).click();
    await again;
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("lien de téléchargement ouvert directement par un visiteur : page de connexion", async ({
  page,
}) => {
  await page.goto("/api/models/papillon-monarque/download");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fmodels%2Fpapillon-monarque%3Fdownload%3D1$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("favoris", () => {
  test("visiteur : le cœur ouvre la modale", async ({ page }) => {
    await page.goto("/models");
    await page
      .getByRole("button", { name: /^Ajouter « .+ » aux favoris$/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: /garder vos favoris/ })).toBeVisible();
  });

  test("membre : ajouter depuis la galerie, retrouver dans Mes favoris, retirer", async ({
    page,
  }, testInfo) => {
    await signUp(page, testInfo);
    await page.goto("/models?q=monarque");
    const heart = page.getByRole("button", { name: "Ajouter « Papillon monarque » aux favoris" });
    // Mise à jour optimiste immédiate : attendre aussi la confirmation du serveur.
    const saved = page.waitForResponse((response) => response.request().method() === "POST");
    await heart.click();
    await saved;
    await expect(
      page.getByRole("button", { name: "Retirer « Papillon monarque » des favoris" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/me/favorites");
    await expect(page.getByText("1 favori")).toBeVisible();
    const removed = page.waitForResponse((response) => response.request().method() === "POST");
    await page.getByRole("button", { name: "Retirer « Papillon monarque » des favoris" }).click();
    await removed;
    await expect(
      page.getByRole("button", { name: "Ajouter « Papillon monarque » aux favoris" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pas encore de favori")).toBeVisible();
  });
});
