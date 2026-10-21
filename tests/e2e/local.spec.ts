import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eCwprj } from "./support/cwprj";
import { verifiedMember } from "./support/members";
import { useColorScheme } from "./support/theme";

/**
 * Mode local (issue #2, ADR-014) : dossier de fixtures généré par le test (SVG, doublon,
 * sous-dossier, dossier caché, autre extension, CWPRJ synthétique chiffré avec la clé de
 * test), choisi par le champ `webkitdirectory`. Aucun fichier ni aucune empreinte ne doit
 * partir avant un clic.
 */

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const star = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="${color}"/></svg>`;

function fixtureFolder(tag: string): string {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "canvatheque-local-")), "Mes modèles");
  mkdirSync(path.join(root, "Noël", "anciens"), { recursive: true });
  mkdirSync(path.join(root, ".cache"));
  writeFileSync(path.join(root, "etoile.svg"), star("#C81E4B"));
  writeFileSync(path.join(root, "Noël", "etoile-copie.svg"), star("#C81E4B"));
  writeFileSync(path.join(root, "Noël", "anciens", "sapin.svg"), star(`#0F7C7E`));
  writeFileSync(
    path.join(root, "Noël", `couronne-${tag}.cwprj`),
    e2eCwprj(`Couronne ${tag}`, PNG_1PX),
  );
  writeFileSync(path.join(root, ".cache", "cache.svg"), star("#000000"));
  writeFileSync(path.join(root, "notes.txt"), "à ignorer");
  return root;
}

/** Requêtes portant un fichier ou des empreintes vers le serveur. */
function watchUploads(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/local/") || (request.postData() ?? "").includes("etoile")) {
      sent.push(url.pathname);
    }
  });
  return sent;
}

async function chooseFolder(page: Page, folder: string) {
  await page.goto("/local");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dossier à analyser").setInputFiles(folder);
  await expect(page.getByRole("heading", { name: "Dossier « Mes modèles »" })).toBeVisible();
}

test("téléphone : le mode local explique qu'il est réservé à l'ordinateur", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "vérifié sur le profil mobile");
  await page.goto("/local");
  await expect(page.getByText(/disponible sur ordinateur/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choisir un dossier" })).toHaveCount(0);
});

test.describe("ordinateur", () => {
  test.skip(({ isMobile }) => isMobile, "mode local réservé à l'ordinateur");

  test("analyse d'un dossier sans rien envoyer : synthèse, doublons, aperçus, filtres", async ({
    page,
  }, testInfo) => {
    const sent = watchUploads(page);
    await chooseFolder(page, fixtureFolder(testInfo.project.name));
    await expect(page.getByRole("note")).toContainText("Tout reste sur votre ordinateur");

    const summary = page.getByRole("region", { name: "Synthèse" });
    await expect(summary).toContainText("4 modèles");
    await expect(summary).toContainText("3 SVG · 1 CWPRJ");
    await expect(summary).toContainText("2 fichiers en double");

    const duplicates = page.getByRole("region", { name: "Doublons" });
    await duplicates.getByText(/2 copies identiques/).click();
    await expect(duplicates).toContainText("Noël/etoile-copie.svg");

    // Aperçus SVG : images locales (blob:), jamais d'appel réseau pour les afficher.
    const card = page.getByRole("article", { name: "sapin.svg" });
    await expect(card.locator("img")).toHaveAttribute("src", /^blob:/);
    await expect(card).toContainText("Dans Noël/anciens");
    await expect(page.getByRole("article", { name: "cache.svg" })).toHaveCount(0);

    // Arborescence : déplier « Noël », sélectionner « anciens ».
    const tree = page.getByRole("navigation", { name: "Dossiers" });
    await tree.getByRole("button", { name: "Déplier « Noël »" }).click();
    await tree.getByRole("button", { name: /^anciens/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await tree.getByRole("button", { name: /^Mes modèles/ }).click();
    await expect(page.getByRole("article")).toHaveCount(4);

    await card.getByRole("button", { name: "Afficher le chemin de « sapin.svg »" }).click();
    await expect(page.getByRole("dialog", { name: "Chemin de « sapin.svg »" })).toContainText(
      "Mes modèles/Noël/anciens/sapin.svg",
    );
    await page.keyboard.press("Escape");

    await page.getByRole("searchbox", { name: "Rechercher un fichier" }).fill("sapin");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Rechercher un fichier" }).fill("");
    await page.getByRole("combobox", { name: "Format" }).selectOption("CWPRJ");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page.getByRole("table", { name: "Fichiers du dossier" })).toBeVisible();

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations).toEqual([]);
    expect(sent).toEqual([]);
  });

  test("vérifier sur Canvathèque n'envoie que des empreintes ; miniature et publication sur clic", async ({
    page,
    request,
  }, testInfo) => {
    test.slow();
    await verifiedMember(page, request, testInfo, "local");
    const folder = fixtureFolder(testInfo.project.name);
    const bodies: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/local/lookup")) bodies.push(req.postData() ?? "");
    });
    await chooseFolder(page, folder);

    await page.getByRole("button", { name: "Vérifier sur Canvathèque" }).click();
    await expect(
      page.getByText(/publié sur Canvathèque|est déjà publié|sont déjà publiés/),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    const sentChecksums = (JSON.parse(bodies[0]!) as { checksums: string[] }).checksums;
    expect(sentChecksums.every((checksum) => /^[0-9a-f]{64}$/.test(checksum))).toBe(true);
    expect(sentChecksums).toHaveLength(3); // 4 fichiers, dont 2 identiques

    // Miniature d'un projet CanvasWorkspace : ce seul fichier est envoyé, sur demande.
    const project = page.getByRole("article", { name: /couronne/ });
    await project.getByRole("button", { name: /Afficher la miniature/ }).click();
    await expect(project.locator("img")).toHaveAttribute("src", /^blob:/);

    // Publier : l'assistant s'ouvre avec ce fichier déjà envoyé et vérifié.
    await page.getByRole("button", { name: "Publier « sapin.svg »" }).click();
    await expect(page).toHaveURL(/\/models\/[\w-]+\/edit$/);
    await expect(page.getByText("Fichier vérifié : sapin.svg")).toBeVisible();
  });

  test("visiteur : publier ouvre la modale d'inscription", async ({ page }, testInfo) => {
    await chooseFolder(page, fixtureFolder(testInfo.project.name));
    await page.getByRole("button", { name: "Publier « etoile.svg »" }).click();
    await expect(
      page.getByRole("dialog", { name: "Créez un compte gratuit pour publier" }),
    ).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`page d'accueil du mode local sans violation axe (${colorScheme})`, async ({ page }) => {
      await useColorScheme(page, colorScheme);
      await page.goto("/local");
      await expect(page.getByRole("button", { name: "Choisir un dossier" })).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
    });
  }
});
