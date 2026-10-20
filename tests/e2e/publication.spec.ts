import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { acceptTerms } from "./support/members";
import { linkFrom, uniqueEmail, waitForMail } from "./support/mailpit";

const PASSWORD = "papillon-de-nuit-42";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const svg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="${color}"/></svg>`;

/** Membre inscrit et adresse confirmée (la publication l'exige). */
async function verifiedMember(page: Page, request: APIRequestContext, testInfo: TestInfo) {
  const email = uniqueEmail("publication", testInfo.project.name);
  const pseudo = `pub${Date.now().toString(36)}${testInfo.project.name.slice(0, 3)}`;
  await page.goto("/signup?redirectTo=%2Fpublish");
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await acceptTerms(page);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/publish$/);
  const mail = await waitForMail(request, email, /Confirmez votre adresse/);
  await page.goto(linkFrom(mail, "check-mail"));
  await expect(page.getByRole("heading", { name: "Adresse confirmée" })).toBeVisible();
  return pseudo;
}

const main = (page: Page) => page.getByRole("main");
const fileInput = (page: Page) => main(page).locator("input[type=file]");

async function fillInformation(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: "Décrivez votre modèle" })).toBeVisible();
  await page.getByRole("textbox", { name: "Titre" }).fill(title);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("Une étoile **pleine**, facile à découper.");
  await page.getByRole("combobox", { name: "Catégorie" }).selectOption({ label: "Décoration" });
  await page.getByRole("textbox", { name: "Mots-clés" }).fill("Étoile");
  await page.getByRole("textbox", { name: "Mots-clés" }).press("Enter");
  await page.getByRole("radio", { name: /CC BY-SA/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
}

test.describe("publication", () => {
  test("publier un SVG, le modifier puis le supprimer", async ({ page, request }, testInfo) => {
    test.slow();
    await verifiedMember(page, request, testInfo);
    await page.goto("/publish");
    // Dépôt géré par React : attendre l'hydratation (sinon le fichier choisi est ignoré).
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: "Publier un modèle" })).toBeVisible();
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations).toEqual([]);

    await fileInput(page).setInputFiles({
      name: "etoile-pleine.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svg("#C81E4B")),
    });
    await expect(page.getByText("Fichier vérifié : etoile-pleine.svg")).toBeVisible();
    await expect(page).toHaveURL(/\/models\/etoile-pleine[\w-]*\/edit$/);
    const recap = page.getByRole("complementary", { name: "Récapitulatif" });
    await expect(recap.locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByText(/généré cet aperçu à partir de votre SVG/)).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    const title = `Étoile ${testInfo.project.name} ${Date.now().toString(36)}`;
    await fillInformation(page, title);

    await expect(page.getByRole("heading", { name: "Relisez avant de publier" })).toBeVisible();
    await expect(main(page).locator("dl strong")).toHaveText("pleine");
    await page.getByRole("checkbox", { name: /Je certifie/ }).check();
    await page.getByRole("button", { name: "Publier", exact: true }).click();

    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByText("Votre modèle est publié. Merci pour ce partage !")).toBeVisible();
    const card = main(page).getByRole("listitem").filter({ hasText: title });
    await expect(card.getByText("Publié")).toBeVisible();

    // Modification : stepper libre, enregistrement direct.
    await card.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier le modèle" })).toBeVisible();
    await page.getByRole("button", { name: /Informations/ }).click();
    await page.getByRole("textbox", { name: "Titre" }).fill(`${title} (v2)`);
    await page.getByRole("button", { name: /Relecture/ }).click();
    await expect(page.getByText(/Ce modèle est publié/)).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(main(page).getByText("Modifications enregistrées").first()).toBeVisible();

    // Suppression depuis « Mes modèles ».
    await page.goto("/me");
    await page.getByRole("button", { name: `Actions pour « ${title} (v2) »` }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("irréversible");
    await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page.getByText(`« ${title} (v2) » a été supprimé.`)).toBeVisible();
    await expect(page.getByText("Aucun modèle pour l'instant")).toBeVisible();
  });

  test("publier un CWPRJ avec une image d'aperçu recadrée", async ({ page, request }, testInfo) => {
    await verifiedMember(page, request, testInfo);
    await page.goto("/publish");
    // Dépôt géré par React : attendre l'hydratation (sinon le fichier choisi est ignoré).
    await page.waitForLoadState("networkidle");

    // Un exécutable déguisé est refusé.
    const exe = Buffer.alloc(256);
    exe.write("MZ", 0, "latin1");
    exe.writeUInt32LE(0x80, 0x3c);
    exe.write("PE\0\0", 0x80, "latin1");
    await fileInput(page).setInputFiles({ name: "setup.cwprj", mimeType: "", buffer: exe });
    await expect(main(page).getByRole("alert")).toContainText(
      "ne correspond pas à un projet CanvasWorkspace",
    );

    // Contenu opaque, comme un vrai projet CanvasWorkspace.
    await fileInput(page).setInputFiles({
      name: "boite-houx.cwprj",
      mimeType: "",
      buffer: randomBytes(4096),
    });
    await expect(page.getByText("Fichier vérifié : boite-houx.cwprj")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/ne peuvent pas s'afficher dans le navigateur/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();

    await fileInput(page).setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: PNG_1PX,
    });
    const crop = page.getByRole("dialog", { name: "Recadrer l'aperçu" });
    await expect(crop).toBeVisible();
    await crop.getByRole("button", { name: "Recadrer" }).click();
    await expect(page.getByText(/Votre image sera affichée dans la galerie/)).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();

    const title = `Boîte houx ${testInfo.project.name} ${Date.now().toString(36)}`;
    await fillInformation(page, title);
    await page.getByRole("checkbox", { name: /Je certifie/ }).check();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(main(page).getByRole("listitem").filter({ hasText: title })).toContainText(
      "CWPRJ",
    );
  });

  test("un visiteur est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/publish");
    // Dépôt géré par React : attendre l'hydratation (sinon le fichier choisi est ignoré).
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpublish$/);
  });
});
