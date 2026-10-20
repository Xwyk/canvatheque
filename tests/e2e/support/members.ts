import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { promoteToAdmin } from "./database";
import { linkFrom, uniqueEmail, waitForMail } from "./mailpit";

export const PASSWORD = "papillon-de-nuit-42";

/**
 * Coche « J'accepte les conditions ». La jauge de robustesse du mot de passe, chargée à la
 * demande, peut décaler la case au moment du clic (Firefox sous charge) : on réessaie.
 */
export async function acceptTerms(scope: Page | Locator): Promise<void> {
  const box = scope.getByRole("checkbox", { name: /J'accepte les conditions/ });
  await expect(async () => {
    await box.check({ timeout: 2000 });
  }).toPass({ timeout: 10_000 });
}

export type TestMember = { pseudo: string; email: string };

/** Inscription par la page /signup ; la session reste ouverte sur `page`. */
export async function signUp(
  page: Page,
  testInfo: TestInfo,
  prefix: string,
  redirectTo = "/",
): Promise<TestMember> {
  const email = uniqueEmail(prefix, testInfo.project.name);
  const pseudo = `${prefix.slice(0, 6)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await page.goto(`/signup?redirectTo=${encodeURIComponent(redirectTo)}`);
  await page.getByLabel("Pseudo").fill(pseudo);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await acceptTerms(page);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${pseudo}` })).toBeVisible();
  return { pseudo, email };
}

/** Membre inscrit dont l'adresse est confirmée (la publication l'exige). */
export async function verifiedMember(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  prefix = "publication",
): Promise<TestMember> {
  const member = await signUp(page, testInfo, prefix);
  const mail = await waitForMail(request, member.email, /Confirmez votre adresse/);
  await page.goto(linkFrom(mail, "check-mail"));
  await expect(page.getByRole("heading", { name: "Adresse confirmée" })).toBeVisible();
  return member;
}

/** Administrateur de test : inscription puis rôle donné en base. */
export async function adminMember(page: Page, testInfo: TestInfo): Promise<TestMember> {
  const admin = await signUp(page, testInfo, "admin");
  await promoteToAdmin(admin.email);
  return admin;
}

const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="#0F7C7E"/></svg>';

/** Publie un SVG minimal (membre confirmé) et renvoie l'adresse de sa fiche. */
export async function publishSvg(page: Page, title: string): Promise<string> {
  await page.goto("/publish");
  // Dépôt géré par React : attendre l'hydratation (sinon le fichier choisi est ignoré).
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("main")
    .locator("input[type=file]")
    .setInputFiles({ name: "etoile.svg", mimeType: "image/svg+xml", buffer: Buffer.from(STAR) });
  await expect(page.getByText("Fichier vérifié : etoile.svg")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("textbox", { name: "Titre" }).fill(title);
  await page.getByRole("combobox", { name: "Catégorie" }).selectOption({ label: "Décoration" });
  await page.getByRole("radio", { name: /CC BY-SA/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("checkbox", { name: /Je certifie/ }).check();
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: title });
  const href = await card.getByRole("link", { name: title }).first().getAttribute("href");
  // Lien de la carte « Mes modèles » : la fiche publique, ou sa page de modification.
  return href!.replace(/\/edit$/, "");
}
