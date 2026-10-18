import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHomeData } from "@/features/catalog/home";
import { jsonLd } from "@/features/catalog/seo";
import { messages } from "@/messages";
import { prisma } from "@/tests/setup/backend";
import { requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

// Hors runtime Next : traductions serveur et en-têtes de requête simulés.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "fr", messages, namespace: namespace as never }),
}));
vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock("@/app/fonts", () => ({
  bricolage: { variable: "font-bricolage" },
  figtree: { variable: "font-figtree" },
}));

const now = new Date("2026-10-18T12:00:00Z");
const DAY = 86_400_000;
let authorId: string;
let categoryId: string;
let counter = 0;

async function model({
  daysAgo = 1,
  downloads = 0,
  status = "PUBLISHED" as "PUBLISHED" | "DRAFT",
  deleted = false,
  author = authorId,
} = {}) {
  counter += 1;
  return prisma.model.create({
    data: {
      slug: `modele-${counter}`,
      title: `Modèle ${counter}`,
      format: "SVG",
      status,
      license: "CC_BY",
      categoryId,
      authorId: author,
      fileKey: "models/x",
      previewKey: "m/v",
      previewWidth: 1600,
      previewHeight: 1600,
      downloadCount: downloads,
      publishedAt: status === "PUBLISHED" ? new Date(now.getTime() - daysAgo * DAY) : null,
      deletedAt: deleted ? now : null,
    },
  });
}

async function download(modelId: string, daysAgo: number, counted = true) {
  const createdAt = new Date(now.getTime() - daysAgo * DAY);
  await prisma.download.create({
    data: { modelId, userId: authorId, counted, createdAt, day: createdAt },
  });
}

const slugs = (items: { slug: string }[]) => items.map((item) => item.slug);

function renderWithIntl(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(async () => {
  requestContext.reset();
  requestContext.headers.set("x-nonce", "nonce-de-test");
  authorId = (await createMember(prisma)).id;
  categoryId = (await createCategory(prisma)).id;
});

describe("getHomeData", () => {
  it("renvoie des sections vides sur un catalogue vide", async () => {
    await model({ status: "DRAFT" });
    await model({ deleted: true });
    expect(await getHomeData(prisma, now)).toEqual({ latest: [], popular: [] });
  });

  it("classe les populaires par téléchargements comptés des 7 derniers jours", async () => {
    const ancien = await model({ daysAgo: 30, downloads: 50 });
    const tendance = await model({ daysAgo: 20, downloads: 3 });
    const recent = await model({ daysAgo: 2, downloads: 1 });
    await download(tendance.id, 1);
    await download(tendance.id, 2);
    await download(recent.id, 3);
    await download(recent.id, 3, false);
    await download(ancien.id, 10);

    const data = await getHomeData(prisma, now);
    expect(slugs(data.latest)).toEqual([recent.slug, tendance.slug, ancien.slug]);
    expect(slugs(data.popular).slice(0, 2)).toEqual([tendance.slug, recent.slug]);
    expect(data.popular).toHaveLength(3);
  });

  it("se replie sur le total des téléchargements sans activité récente", async () => {
    const vieux = await model({ daysAgo: 40, downloads: 12 });
    const moyen = await model({ daysAgo: 30, downloads: 5 });
    const neuf = await model({ daysAgo: 1 });
    await download(vieux.id, 20);

    const data = await getHomeData(prisma, now);
    expect(slugs(data.popular)).toEqual([vieux.slug, moyen.slug, neuf.slug]);
  });

  it("sans aucun téléchargement, montre des modèles absents des derniers", async () => {
    const created = [];
    for (let day = 12; day >= 1; day -= 1) created.push(await model({ daysAgo: day }));
    const data = await getHomeData(prisma, now);
    expect(data.latest).toHaveLength(8);
    expect(slugs(data.popular)).toEqual(slugs(created.slice(0, 4).reverse()));
  });

  it("masque les populaires sans téléchargement quand tout tient dans les derniers", async () => {
    for (let day = 5; day >= 1; day -= 1) await model({ daysAgo: day });
    const data = await getHomeData(prisma, now);
    expect(data.latest).toHaveLength(5);
    expect(data.popular).toEqual([]);
  });
});

describe("plan du site et robots", () => {
  it("liste les pages publiques, catégories, modèles publiés et profils actifs", async () => {
    const published = await model();
    const draft = await model({ status: "DRAFT" });
    const deleted = await model({ deleted: true });
    const banned = await createMember(prisma, { banned: true });
    await model({ author: banned.id });
    const idle = await createMember(prisma);
    const system = await prisma.user.create({
      data: {
        pseudo: "Auteur supprimé",
        pseudoSlug: "auteur-supprime",
        email: "systeme@exemple.fr",
        isSystem: true,
        tosAcceptedAt: now,
      },
    });
    await model({ author: system.id });
    const author = await prisma.user.findUniqueOrThrow({ where: { id: authorId } });

    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls.slice(0, 3)).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/models",
      "http://localhost:3000/categories",
    ]);
    expect(urls).toContain("http://localhost:3000/categories/decoration");
    expect(urls).toContain(`http://localhost:3000/models/${published.slug}`);
    expect(urls).not.toContain(`http://localhost:3000/models/${draft.slug}`);
    expect(urls).not.toContain(`http://localhost:3000/models/${deleted.slug}`);
    expect(urls).toContain(`http://localhost:3000/members/${author.pseudoSlug}`);
    expect(urls).not.toContain(`http://localhost:3000/members/${banned.pseudoSlug}`);
    expect(urls).not.toContain(`http://localhost:3000/members/${idle.pseudoSlug}`);
    expect(urls).not.toContain("http://localhost:3000/members/auteur-supprime");
    const entry = entries.find((e) => e.url.endsWith(`/models/${published.slug}`));
    expect(entry?.lastModified).toEqual(published.updatedAt);
  });

  it("exclut les pages privées et annonce le plan du site", async () => {
    const { default: robots } = await import("@/app/robots");
    const result = robots();
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: expect.arrayContaining(["/api/", "/me$", "/me/", "/models/*/edit", "/admin"]),
    });
    const disallow = (result.rules as { disallow: string[] }).disallow;
    // « /members/… » reste indexable.
    expect(disallow).not.toContain("/me");
  });
});

describe("page d'accueil", () => {
  it("affiche les sections de modèles et les données structurées", async () => {
    const top = await model({ daysAgo: 3, downloads: 4 });
    await download(top.id, 1);
    const fresh = await model({ daysAgo: 1 });

    const { default: HomePage } = await import("@/app/page");
    const html = renderWithIntl(await HomePage());

    expect(html).toContain("Populaires cette semaine");
    expect(html).toContain("Derniers modèles");
    expect(html).toContain(`href="/models/${fresh.slug}"`);
    expect(html).toContain('href="/models?sort=popular"');
    expect(html).not.toContain("Le catalogue attend ses premiers modèles");
    expect(html.indexOf("Populaires cette semaine")).toBeLessThan(html.indexOf("Derniers modèles"));

    const script =
      /<script type="application\/ld\+json" nonce="nonce-de-test">(.*?)<\/script>/.exec(html);
    expect(script).not.toBeNull();
    const data = JSON.parse(script![1]!) as Record<string, unknown>[];
    expect(data[0]).toMatchObject({
      "@type": "WebSite",
      url: "http://localhost:3000/",
      potentialAction: {
        "@type": "SearchAction",
        target: { urlTemplate: "http://localhost:3000/models?q={search_term_string}" },
      },
    });
    expect(data[1]).toMatchObject({ "@type": "Organization", name: "Canvathèque" });
  });

  it("invite à publier et masque les populaires quand le catalogue est vide", async () => {
    const { default: HomePage } = await import("@/app/page");
    const html = renderWithIntl(await HomePage());
    expect(html).toContain("Le catalogue attend ses premiers modèles");
    expect(html).not.toContain("Populaires cette semaine");
  });

  it("déclare l'adresse canonique", async () => {
    const { metadata } = await import("@/app/page");
    expect(metadata.alternates?.canonical).toBe("/");
  });
});

describe("métadonnées par défaut", () => {
  it("décrivent le partage Open Graph et Twitter avec l'image par défaut", async () => {
    const { generateMetadata } = await import("@/app/layout");
    const metadata = await generateMetadata();
    const image = {
      url: "/og-default.png",
      width: 1200,
      height: 630,
      alt: "Canvathèque, modèles de découpe gratuits pour ScanNCut",
    };
    expect(metadata.openGraph).toMatchObject({
      siteName: "Canvathèque",
      locale: "fr_FR",
      type: "website",
      images: [image],
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
  });
});

describe("jsonLd", () => {
  it("échappe « < » pour ne jamais fermer la balise script", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
