import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { waitForMail } from "./support/mailpit";
import { PASSWORD, publishSvg, signUp, verifiedMember } from "./support/members";

test("exporter ses données au format JSON", async ({ page }, testInfo) => {
  const member = await signUp(page, testInfo, "export");
  await page.goto("/me/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exporter mes données" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^canvatheque-[\w-]+-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.account).toMatchObject({ pseudo: member.pseudo, email: member.email });
});

test("supprimer son compte en transférant ses modèles publiés", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const member = await verifiedMember(page, request, testInfo, "depart");
  const title = `Étoile transférée ${testInfo.project.name} ${Date.now().toString(36)}`;
  const modelUrl = await publishSvg(page, title);

  await page.goto("/me/settings");
  const zone = page.getByRole("region", { name: "Supprimer mon compte" });
  await expect(zone.getByRole("radio", { name: /Les transférer/ })).toBeChecked();
  await zone.getByLabel("Mot de passe actuel").fill(PASSWORD);
  await zone.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Supprimer définitivement" })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Votre compte est supprimé.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Compte de ${member.pseudo}` })).toHaveCount(0);
  expect(await waitForMail(request, member.email, /est supprimé/)).toContain("dernier");

  // Le modèle reste en ligne, sans le pseudo de son auteur.
  await page.goto(modelUrl);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Auteur supprimé").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(member.pseudo)).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(member.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
});

const PAGES = [
  ["/about", "À propos de Canvathèque"],
  ["/help", "Aide"],
  ["/legal", "Mentions légales"],
  ["/legal/privacy", "Politique de confidentialité"],
  ["/legal/terms", "Conditions générales d'utilisation"],
] as const;

for (const colorScheme of ["light", "dark"] as const) {
  test(`pages de contenu sans violation axe en thème ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const [path, title] of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations, path).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  });
}

test("le pied de page mène à l'aide, dont le sommaire mène au pas à pas CanvasWorkspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Aide" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page
    .getByRole("navigation", { name: "Sommaire" })
    .getByRole("link", { name: "Ouvrir un .cwprj dans CanvasWorkspace" })
    .click();
  await expect(page).toHaveURL(/#canvasworkspace$/);
  await expect(
    page.getByRole("heading", { name: "Ouvrir un .cwprj dans CanvasWorkspace" }),
  ).toBeInViewport();
});
