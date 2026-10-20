import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminMember, publishSvg, signUp, verifiedMember } from "./support/members";

/** Commentaires (étape 7) : un contexte de navigation par acteur. */

async function newPage(browser: Browser, page: Page): Promise<Page> {
  const { use } = test.info().project;
  const context = await browser.newContext({
    ...(page.viewportSize() ? { viewport: page.viewportSize()! } : {}),
    baseURL: use.baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
  return context.newPage();
}

async function comment(page: Page, text: string) {
  // Formulaire géré par React : attendre l'hydratation (envoi natif sinon, sous forte charge).
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Votre commentaire").fill(text);
  await page.getByRole("button", { name: "Publier le commentaire" }).click();
  await expect(page.getByText("Commentaire publié.")).toBeVisible();
}

async function deleteComment(page: Page, pseudo: string) {
  await page.getByRole("button", { name: `Supprimer le commentaire de ${pseudo}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByText("Commentaire supprimé.")).toBeVisible();
}

test("commenter un modèle, puis l'auteur du modèle modère", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  await verifiedMember(page, request, testInfo, "auteur");
  const modelUrl = await publishSvg(page, `Étoile commentée ${Date.now().toString(36)}`);

  const readerPage = await newPage(browser, page);
  const reader = await signUp(readerPage, testInfo, "lecteur");
  await readerPage.goto(modelUrl);
  const section = readerPage.getByRole("region", { name: "Commentaires" });
  await expect(section).toContainText("Aucun commentaire pour l'instant");
  const text = `Découpé sur du papier 160 g, superbe ! ${testInfo.project.name}`;
  await comment(readerPage, text);
  await expect(readerPage.getByRole("heading", { name: "1 commentaire" })).toBeVisible();
  const axe = await new AxeBuilder({ page: readerPage }).include("#comments").analyze();
  expect(axe.violations).toEqual([]);

  // Visible pour tous après rechargement ; l'auteur du modèle peut le supprimer.
  await page.goto(modelUrl);
  const item = page.getByRole("article", { name: reader.pseudo });
  await expect(item).toContainText(text);
  await deleteComment(page, reader.pseudo);
  await expect(page.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  await readerPage.reload();
  await expect(readerPage.getByText(text)).toHaveCount(0);
});

test("un administrateur supprime un commentaire : action journalisée", async ({
  page,
  browser,
}, testInfo) => {
  const writer = await signUp(page, testInfo, "bavard");
  await page.goto("/models/papillon-monarque");
  const text = `Visitez ma boutique ${Date.now().toString(36)} ${testInfo.project.name}`;
  await comment(page, text);

  const adminPage = await newPage(browser, page);
  await adminMember(adminPage, testInfo);
  await adminPage.goto("/models/papillon-monarque#comments");
  await expect(adminPage.getByText(text)).toBeVisible();
  await deleteComment(adminPage, writer.pseudo);
  await adminPage.goto("/admin/log?type=COMMENT_DELETE");
  await expect(adminPage.getByText(`Extrait : « ${text} »`)).toBeVisible();
});

test("visiteur : invitation à se connecter pour commenter", async ({ page }) => {
  await page.goto("/models/papillon-monarque");
  await expect(page.getByLabel("Votre commentaire")).toHaveCount(0);
  await page.getByRole("button", { name: "Se connecter pour commenter" }).click();
  await expect(page.getByRole("dialog", { name: "Connectez-vous pour commenter" })).toBeVisible();
});
