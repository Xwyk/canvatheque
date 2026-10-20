import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { acceptTerms } from "./support/members";
import { linkFrom, uniqueEmail, waitForMail } from "./support/mailpit";

const PASSWORD = "papillon-de-nuit-42";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="#0F7C7E"/></svg>`;

/** Membre inscrit, adresse confirmée (la publication l'exige). */
async function verifiedMember(page: Page, request: APIRequestContext, testInfo: TestInfo) {
  const email = uniqueEmail("fiche", testInfo.project.name);
  const pseudo = `fiche${Date.now().toString(36)}${testInfo.project.name.slice(0, 3)}`;
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

/** Publie un SVG par l'interface et renvoie l'adresse de sa fiche. */
async function publishSvg(page: Page, title: string): Promise<string> {
  await page.goto("/publish");
  // Dépôt géré par React : attendre l'hydratation (sinon le fichier choisi est ignoré).
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("main")
    .locator("input[type=file]")
    .setInputFiles({ name: "etoile.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG) });
  await expect(page).toHaveURL(/\/models\/[\w-]+\/edit$/);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("textbox", { name: "Titre" }).fill(title);
  await page.getByRole("textbox", { name: "Description" }).fill("Une étoile **pleine**.");
  await page.getByRole("combobox", { name: "Catégorie" }).selectOption({ label: "Décoration" });
  await page.getByRole("textbox", { name: "Mots-clés" }).fill("etoile");
  await page.getByRole("textbox", { name: "Mots-clés" }).press("Enter");
  await page.getByRole("radio", { name: /CC BY-SA/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("checkbox", { name: /Je certifie/ }).check();
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  // Le slug suit le titre à la publication : on le lit depuis « Mes modèles ».
  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: title });
  const href = await card.getByRole("link", { name: title }).getAttribute("href");
  expect(href).toMatch(/\/edit$/);
  return href!.replace(/\/edit$/, "");
}

test.describe("fiche d'un modèle et profil public", () => {
  test("fiche publiée : contenu, SEO, accessibilité, profil de l'auteur", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    const pseudo = await verifiedMember(page, request, testInfo);
    const title = `Étoile fiche ${testInfo.project.name} ${Date.now().toString(36)}`;
    const path = await publishSvg(page, title);

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("SVG", { exact: true }).first()).toBeVisible();
    await expect(page.locator("img[fetchpriority=high]")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path}$`),
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}",
    );
    expect(jsonLd).toMatchObject({ "@type": "CreativeWork", name: title });
    await expect(page.getByRole("link", { name: "Modifier" })).toBeVisible();

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations).toEqual([]);

    // Visiteur anonyme : pas d'actions de propriétaire, profil de l'auteur accessible.
    // Visiteur : contexte vierge (sans session), même configuration que le projet.
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      locale: "fr-FR",
    });
    const visitor = await context.newPage();
    await visitor.goto(path);
    await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Modifier" })).toHaveCount(0);
    await expect(visitor.getByRole("link", { name: "Télécharger le SVG" }).first()).toHaveAttribute(
      "href",
      /\/api\/models\/.+\/download$/,
    );
    await visitor.goto(`/members/${pseudo}`);
    await expect(visitor.getByRole("heading", { level: 1, name: pseudo })).toBeVisible();
    await expect(visitor.getByRole("link", { name: title })).toBeVisible();
    const profileAxe = await new AxeBuilder({ page: visitor }).include("main").analyze();
    expect(profileAxe.violations).toEqual([]);
    await context.close();
  });

  test("le propriétaire supprime son modèle depuis la fiche", async ({
    page,
    request,
  }, testInfo) => {
    await verifiedMember(page, request, testInfo);
    const title = `Étoile éphémère ${testInfo.project.name} ${Date.now().toString(36)}`;
    const path = await publishSvg(page, title);
    await page.goto(path);
    await page.getByRole("button", { name: "Supprimer" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByText(`« ${title} » a été supprimé.`)).toBeVisible();
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Ce modèle est introuvable" })).toBeVisible();
  });

  test("modèle ou membre inconnu : 404", async ({ page }) => {
    expect((await page.goto("/models/modele-qui-n-existe-pas"))?.status()).toBe(404);
    expect((await page.goto("/members/membre-qui-n-existe-pas"))?.status()).toBe(404);
  });
});
