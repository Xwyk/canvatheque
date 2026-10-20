import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { acceptTerms } from "./support/members";
import { linkFrom, uniqueEmail, waitForMail } from "./support/mailpit";
import { useColorScheme } from "./support/theme";

const PASSWORD = "papillon-de-nuit-42";
const NEW_PASSWORD = "nouvelle-phrase-secrete-2026";

async function signUp(page: Page, pseudo: string, email: string, redirectTo = "/") {
  await page.goto(`/signup?redirectTo=${encodeURIComponent(redirectTo)}`);
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await acceptTerms(page);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /^Compte de / }).click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page.getByText("Vous êtes déconnecté·e.")).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test.describe("comptes", () => {
  test("inscription, confirmation d'adresse, déconnexion et reconnexion", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inscription", testInfo.project.name);
    const pseudo = `e2e${Date.now().toString(36)}${testInfo.project.name.slice(0, 3)}`;

    await signUp(page, pseudo, email, "/me/settings");
    await expect(page).toHaveURL(/\/me\/settings$/);
    await expect(page.getByText(`Bienvenue ${pseudo} !`)).toBeVisible();
    await expect(
      page.getByText(/Confirmez votre adresse e-mail pour pouvoir publier/),
    ).toBeVisible();
    await expect(page.getByText("non confirmée")).toBeVisible();

    const mail = await waitForMail(request, email, /Confirmez votre adresse/);
    await page.goto(linkFrom(mail, "check-mail"));
    await expect(page).toHaveURL(/\/check-mail\?result=verified$/);
    await expect(page.getByRole("heading", { name: "Adresse confirmée" })).toBeVisible();
    await expect(
      page.getByText(/Confirmez votre adresse e-mail pour pouvoir publier/),
    ).toBeHidden();

    await signOut(page);
    await expect(page.getByRole("link", { name: /Se connecter|Connexion/ }).first()).toBeVisible();

    await signIn(page, email, "mauvais-mot-de-passe");
    // Le premier « alert » est le message du formulaire (Next ajoute un annonceur de route).
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Vous êtes connecté·e.")).toBeVisible();
    await expect(page.getByRole("button", { name: `Compte de ${pseudo}` })).toBeVisible();
  });

  test("mot de passe oublié puis changement depuis les paramètres", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reset", testInfo.project.name);
    const pseudo = `rst${Date.now().toString(36)}${testInfo.project.name.slice(0, 3)}`;
    await signUp(page, pseudo, email);
    await expect(page.getByRole("button", { name: `Compte de ${pseudo}` })).toBeVisible();
    await signOut(page);

    await page.goto("/forgot-password");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Si un compte existe pour cette adresse",
    );

    const mail = await waitForMail(request, email, /Réinitialisation/);
    const resetPath = linkFrom(mail, "reset");
    await page.goto(resetPath);
    await page.getByRole("textbox", { name: "Nouveau mot de passe" }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Enregistrer et me connecter" }).click();
    await expect(page.getByText("Mot de passe modifié. Vous êtes connecté·e.")).toBeVisible();

    // Le lien ne sert qu'une fois.
    await page.goto(resetPath);
    await expect(page.getByRole("link", { name: "Demander un nouveau lien" })).toBeVisible();

    await page.goto("/me/settings");
    const card = page.getByRole("region", { name: "Mot de passe", exact: true });
    await card.getByRole("textbox", { name: "Mot de passe actuel" }).fill(NEW_PASSWORD);
    await card.getByRole("textbox", { name: "Nouveau mot de passe" }).fill(PASSWORD);
    await card.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("Mot de passe modifié");
    await waitForMail(request, email, /Votre mot de passe a changé/);
  });

  test("les pages membres redirigent vers la connexion puis reviennent", async ({ page }) => {
    await page.goto("/me/settings");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fme%2Fsettings$/);
    await expect(page.getByRole("heading", { name: "Bon retour parmi nous" })).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`pages d'authentification sans violation axe (${colorScheme})`, async ({ page }) => {
      await useColorScheme(page, colorScheme);
      for (const path of ["/login", "/signup", "/forgot-password", "/reset/jeton-invalide"]) {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
});
