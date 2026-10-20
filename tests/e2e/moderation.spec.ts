import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { waitForMail } from "./support/mailpit";
import { adminMember, PASSWORD, publishSvg, signUp, verifiedMember } from "./support/members";

/**
 * Modération (étape 5) : chaque acteur a son propre contexte de navigation (sessions
 * distinctes). L'administrateur de test est promu en base (support/database.ts).
 */

async function newPage(browser: Browser, page: Page): Promise<Page> {
  const context = await browser.newContext({
    ...(page.viewportSize() ? { viewport: page.viewportSize()! } : {}),
    baseURL: test.info().project.use.baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    isMobile: test.info().project.use.isMobile,
    hasTouch: test.info().project.use.hasTouch,
    userAgent: test.info().project.use.userAgent,
  });
  return context.newPage();
}

async function confirmModeration(page: Page, button: string, confirm: string, reason: string) {
  await page.getByRole("button", { name: button, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Raison").fill(reason);
  await dialog.getByRole("button", { name: confirm }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("signaler un modèle puis le masquer depuis la file des signalements", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  // Auteur : publie un modèle.
  const author = await verifiedMember(page, request, testInfo, "auteur");
  const title = `Étoile signalée ${testInfo.project.name} ${Date.now().toString(36)}`;
  const modelUrl = await publishSvg(page, title);

  // Membre : signale le modèle.
  const reporterPage = await newPage(browser, page);
  await signUp(reporterPage, testInfo, "signale");
  await reporterPage.goto(modelUrl);
  await reporterPage.getByRole("button", { name: "Signaler" }).click();
  const dialog = reporterPage.getByRole("dialog", { name: `Signaler « ${title} »` });
  await expect(dialog).toBeVisible();
  const axe = await new AxeBuilder({ page: reporterPage }).include('[role="dialog"]').analyze();
  expect(axe.violations).toEqual([]);
  await dialog.getByRole("radio", { name: /Atteinte aux droits d'auteur/ }).check();
  await dialog.getByLabel("Précisions (facultatif)").fill("Copie d'un modèle du commerce.");
  await dialog.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(reporterPage.getByText(/votre signalement a été envoyé/)).toBeVisible();

  // Administrateur : traite le signalement.
  const adminPage = await newPage(browser, page);
  await adminMember(adminPage, testInfo);
  await adminPage.goto("/admin/reports");
  await expect(adminPage.getByRole("heading", { level: 1, name: "Signalements" })).toBeVisible();
  const card = adminPage.getByRole("article", { name: title });
  await expect(card).toContainText("Copie d'un modèle du commerce.");
  const adminAxe = await new AxeBuilder({ page: adminPage }).include("main").analyze();
  expect(adminAxe.violations).toEqual([]);
  await card.getByRole("button", { name: "Masquer le modèle" }).click();
  const hide = adminPage.getByRole("dialog", { name: `Masquer « ${title} » ?` });
  await hide.getByLabel("Raison").fill("Droits d'auteur non respectés");
  await hide.getByRole("button", { name: "Masquer le modèle" }).click();
  await expect(adminPage.getByText(`« ${title} » est masqué, signalement traité.`)).toBeVisible();
  await expect(card).toHaveCount(0);

  // L'auteur est prévenu, voit le bandeau ; le modèle n'est plus public.
  const mail = await waitForMail(request, author.email, /a été masqué/);
  expect(mail).toContain("Motif : Droits d'auteur non respectés");
  await page.goto(modelUrl);
  await expect(page.getByText("Droits d'auteur non respectés")).toBeVisible();
  const missing = await reporterPage.goto(modelUrl);
  expect(missing?.status()).toBe(404);

  // Journal, puis réaffichage depuis la fiche.
  await adminPage.goto("/admin/log");
  await expect(adminPage.getByText(`Modèle masqué · « ${title} »`)).toBeVisible();
  await adminPage.goto(modelUrl);
  await confirmModeration(adminPage, "Réafficher", "Réafficher le modèle", "Licence vérifiée");
  await expect(adminPage.getByText(`« ${title} » est de nouveau visible.`)).toBeVisible();
  expect((await reporterPage.goto(modelUrl))?.status()).toBe(200);
});

test("bannir un membre puis lever le bannissement", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const target = await signUp(page, testInfo, "banni");

  const adminPage = await newPage(browser, page);
  await adminMember(adminPage, testInfo);
  await adminPage.goto(`/admin/members?q=${encodeURIComponent(target.pseudo)}`);
  const row = adminPage.getByRole("row", { name: new RegExp(target.pseudo) });
  await expect(row).toContainText("Actif");
  await row.getByRole("button", { name: "Bannir" }).click();
  const dialog = adminPage.getByRole("dialog", { name: `Bannir ${target.pseudo} ?` });
  await dialog.getByLabel("Raison").fill("Spam répété dans les descriptions");
  await dialog.getByRole("checkbox", { name: /Masquer aussi/ }).check();
  await dialog.getByRole("button", { name: "Bannir le membre" }).click();
  await expect(adminPage.getByText(`${target.pseudo} est banni.`)).toBeVisible();
  await expect(row).toContainText("Banni : Spam répété dans les descriptions");

  // Session révoquée, connexion refusée, e-mail reçu.
  await page.reload();
  await expect(page.getByRole("button", { name: `Compte de ${target.pseudo}` })).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(target.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Ce compte a été suspendu.")).toBeVisible();
  expect(await waitForMail(request, target.email, /suspendu/)).toContain("Motif : Spam répété");

  await row.getByRole("button", { name: "Lever le bannissement" }).click();
  const unban = adminPage.getByRole("dialog");
  await unban.getByLabel("Raison").fill("Contestation acceptée");
  await unban.getByRole("button", { name: "Lever le bannissement" }).click();
  await expect(adminPage.getByText(`${target.pseudo} n'est plus banni.`)).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(target.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${target.pseudo}` })).toBeVisible();
});

test("un membre sans rôle d'administrateur ne voit pas l'administration", async ({
  page,
}, testInfo) => {
  await signUp(page, testInfo, "curieux");
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`pages d'administration sans violation axe en thème ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await adminMember(page, testInfo);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const path of ["/admin", "/admin/members", "/admin/models", "/admin/log"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(
        colorScheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      const axe = await new AxeBuilder({ page }).include("main").analyze();
      expect(axe.violations, path).toEqual([]);
      // Tableaux : défilement horizontal dans leur conteneur, jamais sur la page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  });
}
