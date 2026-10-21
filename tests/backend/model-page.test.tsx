import { createTranslator, NextIntlClientProvider } from "next-intl";
import type * as NextIntl from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock("next/navigation", async () => ({
  ...(await import("@/tests/support/next-request")).navigationModule,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "fr", messages, namespace: namespace as never }),
}));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const { messages: fr } = await import("@/messages");
  return {
    ...actual,
    NextIntlClientProvider: (props: React.ComponentProps<typeof actual.NextIntlClientProvider>) => (
      <actual.NextIntlClientProvider locale="fr" messages={fr} timeZone="Europe/Paris" {...props} />
    ),
  };
});

import MemberPage, {
  generateMetadata as memberMetadata,
} from "@/app/(public)/members/[pseudo]/page";
import ModelNotFound from "@/app/(public)/models/[slug]/not-found";
import ModelPage, { generateMetadata as modelMetadata } from "@/app/(public)/models/[slug]/page";
import { getMemberProfile } from "@/features/catalog/member";
import {
  getAuthorModels,
  getModelPage,
  getSimilarModels,
  modelJsonLd,
  summarize,
} from "@/features/catalog/model-page";
import { createSession } from "@/lib/auth/session";
import type { License, ModelFormat, ModelStatus } from "@/lib/generated/prisma/enums";
import type { Actor } from "@/lib/permissions";
import { prisma } from "@/tests/setup/backend";
import { requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

type Seed = {
  title: string;
  authorId: string;
  format?: ModelFormat;
  status?: ModelStatus;
  license?: License | null;
  categoryId?: string | null;
  tags?: string[];
  downloads?: number;
  description?: string;
  deleted?: boolean;
  daysAgo?: number;
  hiddenReason?: string;
  withFile?: boolean;
};

const now = Date.now();

async function model(seed: Seed) {
  const slug = seed.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const withFile = seed.withFile ?? true;
  return prisma.model.create({
    data: {
      slug,
      title: seed.title,
      description: seed.description ?? "",
      format: seed.format ?? "SVG",
      status: seed.status ?? "PUBLISHED",
      license: seed.license === undefined ? "CC_BY" : seed.license,
      categoryId: seed.categoryId === undefined ? defaultCategoryId : seed.categoryId,
      authorId: seed.authorId,
      fileKey: withFile ? "models/x" : null,
      fileSize: withFile ? 188_416 : null,
      previewKey: withFile ? `${slug}/v1` : null,
      previewWidth: 1600,
      previewHeight: 1200,
      downloadCount: seed.downloads ?? 0,
      hiddenReason: seed.hiddenReason ?? null,
      publishedAt:
        seed.status && seed.status !== "PUBLISHED"
          ? null
          : new Date(now - (seed.daysAgo ?? 1) * 86_400_000),
      deletedAt: seed.deleted ? new Date() : null,
      tags: {
        create: (seed.tags ?? []).map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
  });
}

async function signIn(member: { id: string }) {
  const { token } = await createSession(prisma, member.id);
  requestContext.cookies.set("canvatheque.session", { value: token });
}

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never;
const pseudoParams = (pseudo: string) => ({ params: Promise.resolve({ pseudo }) }) as never;

let defaultCategoryId: string;

beforeEach(async () => {
  defaultCategoryId = (await createCategory(prisma, "Autres")).id;
  requestContext.reset();
});

describe("getModelPage", () => {
  it("rend une fiche publiée à tous, avec description nettoyée et taille lisible", async () => {
    const author = await createMember(prisma);
    const category = await createCategory(prisma, "Nature et animaux");
    await model({
      title: "Papillon ajouré",
      authorId: author.id,
      categoryId: category.id,
      tags: ["papillon", "carte"],
      downloads: 874,
      description: "Un **papillon** <script>alert(1)</script> [lien](javascript:alert(1))",
    });

    const data = await getModelPage(prisma, null, "papillon-ajoure");
    expect(data).toMatchObject({
      model: { title: "Papillon ajouré", fileSizeLabel: "184 Ko", downloadCount: 874 },
      author: { pseudo: author.pseudo, hasProfile: true },
      category: { slug: "nature-et-animaux", name: "Nature et animaux" },
      tags: ["carte", "papillon"],
      canEdit: false,
      preview: { width: 1600, height: 1200, lg: expect.stringContaining("papillon-ajoure/v1-lg") },
    });
    expect(data!.descriptionHtml).toContain("<strong>papillon</strong>");
    expect(data!.descriptionHtml).not.toContain("<script");
    expect(data!.descriptionHtml).not.toContain("javascript:");
    expect(data!.descriptionText).toContain("Un papillon");
    expect(await getModelPage(prisma, null, "inconnu")).toBeNull();
  });

  it("brouillon et masqué : auteur et administrateurs seulement ; supprimé : personne", async () => {
    const author = await createMember(prisma);
    const other = await createMember(prisma);
    const admin = await createMember(prisma, { role: "ADMIN" });
    await model({ title: "Brouillon", authorId: author.id, status: "DRAFT", withFile: false });
    await model({ title: "Masque", authorId: author.id, status: "HIDDEN" });
    await model({ title: "Supprime", authorId: author.id, deleted: true });

    for (const slug of ["brouillon", "masque"]) {
      expect(await getModelPage(prisma, null, slug)).toBeNull();
      expect(await getModelPage(prisma, other as Actor, slug)).toBeNull();
      expect(await getModelPage(prisma, author as Actor, slug)).toMatchObject({ canEdit: true });
      expect(await getModelPage(prisma, admin as Actor, slug)).toMatchObject({ canEdit: true });
    }
    expect((await getModelPage(prisma, author as Actor, "brouillon"))!.model.fileSizeLabel).toBe(
      null,
    );
    expect(await getModelPage(prisma, author as Actor, "supprime")).toBeNull();
    expect(await getModelPage(prisma, admin as Actor, "supprime")).toBeNull();
  });

  it("auteur banni ou compte système : pas de profil public", async () => {
    const banned = await createMember(prisma, { banned: true });
    await model({ title: "Du banni", authorId: banned.id });
    expect((await getModelPage(prisma, null, "du-banni"))!.author.hasProfile).toBe(false);
  });
});

describe("modèles liés", () => {
  it("« Dans le même esprit » : mots-clés communs, puis catégorie, puis téléchargements", async () => {
    const author = await createMember(prisma);
    const deco = await createCategory(prisma, "Décoration");
    const fetes = await createCategory(prisma, "Fêtes");
    const base = { authorId: author.id };
    const current = await model({
      ...base,
      title: "Courant",
      categoryId: deco.id,
      tags: ["etoile", "noel", "papier"],
      downloads: 10,
    });
    await model({ ...base, title: "Deux tags", categoryId: fetes.id, tags: ["etoile", "noel"] });
    await model({
      ...base,
      title: "Un tag",
      categoryId: fetes.id,
      tags: ["papier"],
      downloads: 99,
    });
    await model({ ...base, title: "Meme categorie", categoryId: deco.id, downloads: 5 });
    await model({ ...base, title: "Meme categorie bis", categoryId: deco.id, downloads: 1 });
    await model({ ...base, title: "Sans lien", categoryId: fetes.id, downloads: 500 });
    await model({ ...base, title: "Brouillon lie", categoryId: deco.id, status: "DRAFT" });
    await model({ ...base, title: "Supprime lie", categoryId: deco.id, deleted: true });

    const similar = await getSimilarModels(prisma, current);
    expect(similar.map((item) => item.title)).toEqual([
      "Deux tags",
      "Un tag",
      "Meme categorie",
      "Meme categorie bis",
    ]);
    expect(similar[0]).toMatchObject({ authorPseudo: author.pseudo, format: "SVG" });

    // Brouillon sans catégorie : seuls les mots-clés comptent.
    const orphan = await model({
      ...base,
      title: "Orphelin",
      tags: ["noel"],
      status: "DRAFT",
      categoryId: null,
      withFile: false,
    });
    expect((await getSimilarModels(prisma, orphan)).map((item) => item.title)).toEqual([
      "Courant",
      "Deux tags",
    ]);
  });

  it("« Autres modèles de » : publiés de l'auteur, hors modèle courant, récents d'abord", async () => {
    const author = await createMember(prisma);
    const other = await createMember(prisma);
    const current = await model({ title: "Courant", authorId: author.id, daysAgo: 1 });
    await model({ title: "Ancien", authorId: author.id, daysAgo: 9 });
    await model({ title: "Recent", authorId: author.id, daysAgo: 2 });
    await model({ title: "Brouillon", authorId: author.id, status: "DRAFT" });
    await model({ title: "Autre auteur", authorId: other.id });
    const items = await getAuthorModels(prisma, current);
    expect(items.map((item) => item.title)).toEqual(["Recent", "Ancien"]);
  });
});

describe("getMemberProfile", () => {
  it("profil, statistiques et modèles publiés ; 404 pour inconnu, banni et système", async () => {
    const member = await createMember(prisma);
    await prisma.user.update({
      where: { id: member.id },
      data: { bio: "  Passionnée de papier.  ", website: "https://atelier.example/" },
    });
    await model({ title: "Un", authorId: member.id, downloads: 3, daysAgo: 3 });
    await model({ title: "Deux", authorId: member.id, downloads: 4, daysAgo: 1 });
    await model({ title: "Cache", authorId: member.id, status: "HIDDEN", downloads: 50 });

    const profile = await getMemberProfile(prisma, member.pseudoSlug);
    expect(profile).toMatchObject({
      pseudo: member.pseudo,
      bio: "Passionnée de papier.",
      website: "https://atelier.example/",
      stats: { models: 2, downloads: 7 },
    });
    expect(profile!.models.map((item) => item.title)).toEqual(["Deux", "Un"]);

    await prisma.user.update({
      where: { id: member.id },
      data: { website: "javascript:alert(1)" },
    });
    expect((await getMemberProfile(prisma, member.pseudoSlug))!.website).toBeNull();
    await prisma.user.update({
      where: { id: member.id },
      data: { website: "pas une url", bio: " " },
    });
    expect(await getMemberProfile(prisma, member.pseudoSlug)).toMatchObject({
      website: null,
      bio: null,
    });

    const banned = await createMember(prisma, { banned: true });
    const system = await createMember(prisma);
    await prisma.user.update({ where: { id: system.id }, data: { isSystem: true } });
    expect(await getMemberProfile(prisma, "inconnu")).toBeNull();
    expect(await getMemberProfile(prisma, banned.pseudoSlug)).toBeNull();
    expect(await getMemberProfile(prisma, system.pseudoSlug)).toBeNull();
    expect(await getMemberProfile(prisma, banned.pseudoSlug)).toBeNull();
  });
});

describe("SEO de la fiche", () => {
  it("résume sur un mot sans dépasser 160 caractères", () => {
    expect(summarize("  court   texte ")).toBe("court texte");
    const long = summarize("mot ".repeat(80));
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("mot…")).toBe(true);
    expect(summarize("x".repeat(200))).toHaveLength(160);
  });

  it("données structurées CreativeWork", async () => {
    const author = await createMember(prisma);
    await model({ title: "Etoile", authorId: author.id, tags: ["noel"], downloads: 12 });
    const data = (await getModelPage(prisma, null, "etoile"))!;
    expect(modelJsonLd(data, "https://canvatheque.fr", "Résumé")).toMatchObject({
      "@type": "CreativeWork",
      name: "Etoile",
      description: "Résumé",
      url: "https://canvatheque.fr/models/etoile",
      image: data.preview!.lg,
      author: {
        "@type": "Person",
        name: author.pseudo,
        url: `https://canvatheque.fr/members/${author.pseudoSlug}`,
      },
      license: "https://creativecommons.org/licenses/by/4.0/",
      keywords: "noel",
      interactionStatistic: { userInteractionCount: 12 },
    });
    const bare = modelJsonLd(
      {
        ...data,
        preview: null,
        tags: [],
        model: { ...data.model, license: "PERSONAL_USE", publishedAt: null },
        author: { ...data.author, hasProfile: false },
      },
      "https://canvatheque.fr",
      "",
    );
    for (const key of ["image", "license", "keywords", "datePublished"]) {
      expect(bare).not.toHaveProperty(key);
    }
    expect(bare.author).not.toHaveProperty("url");
  });
});

describe("pages", () => {
  it("fiche publiée : métadonnées, JSON-LD avec nonce, contenu", async () => {
    const author = await createMember(prisma);
    const category = await createCategory(prisma);
    await model({
      title: "Papillon ajoure",
      authorId: author.id,
      format: "CWPRJ",
      categoryId: category.id,
      tags: ["papillon"],
      description: "Un papillon </script><b>dentelé</b>.",
    });
    await model({ title: "Voisin", authorId: author.id, tags: ["papillon"] });
    requestContext.headers.set("x-nonce", "nonce-123");
    requestContext.headers.set("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");

    const metadata = await modelMetadata(slugParams("papillon-ajoure"));
    expect(metadata).toMatchObject({
      title: "Papillon ajoure",
      description: expect.stringContaining("Un papillon"),
      alternates: { canonical: "http://localhost:3000/models/papillon-ajoure" },
      openGraph: {
        type: "article",
        siteName: "Canvathèque",
        locale: "fr_FR",
        images: [{ width: 1600, height: 1200, alt: "Aperçu du modèle « Papillon ajoure »" }],
      },
      twitter: { card: "summary_large_image" },
    });
    expect(metadata.robots).toBeUndefined();

    const page = html(await ModelPage(slugParams("papillon-ajoure")));
    expect(page).toContain('<script type="application/ld+json" nonce="nonce-123">');
    const json = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/.exec(page)![1]!;
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toMatchObject({ "@type": "CreativeWork", name: "Papillon ajoure" });
    expect(page).toContain("<h1");
    expect(page).toContain("Télécharger le projet");
    expect(page).not.toContain("Ouvrir dans CanvasWorkspace");
    expect(page).toContain("Le télécharger pour macOS ou Windows");
    expect(page).toContain("Dans le même esprit");
    expect(page).toContain(`Autres modèles de ${author.pseudo}`);
    expect(page).toContain('fetchPriority="high"');
  });

  it("brouillon : visible par l'auteur (non indexé), 404 pour un visiteur", async () => {
    const author = await createMember(prisma);
    await model({ title: "Projet", authorId: author.id, status: "DRAFT", withFile: false });

    await expect(ModelPage(slugParams("projet"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await modelMetadata(slugParams("projet"))).toMatchObject({
      title: "Ce modèle est introuvable",
      robots: { index: false },
    });

    await signIn(author);
    const metadata = await modelMetadata(slugParams("projet"));
    expect(metadata).toMatchObject({
      robots: { index: false },
      description: expect.stringContaining(author.pseudo),
      openGraph: { images: [{ url: "/og-default.png" }] },
    });
    const page = html(await ModelPage(slugParams("projet")));
    expect(page).toContain("Brouillon : non publié");
    expect(page).toContain("Modifier");
    expect(page).not.toContain("application/ld+json");
  });

  it("page 404 de la fiche", () => {
    const page = html(<ModelNotFound />);
    expect(page).toContain("Ce modèle est introuvable");
    expect(page).toContain('href="/models"');
  });

  it("profil public : métadonnées et contenu ; 404 sinon", async () => {
    const member = await createMember(prisma);
    await model({ title: "Coeur", authorId: member.id, downloads: 2 });

    const metadata = await memberMetadata(pseudoParams(member.pseudoSlug));
    expect(metadata).toMatchObject({
      title: `${member.pseudo}, membre de Canvathèque`,
      description: `Les modèles de découpe partagés par ${member.pseudo} sur Canvathèque.`,
      alternates: { canonical: `http://localhost:3000/members/${member.pseudoSlug}` },
      openGraph: { type: "profile", siteName: "Canvathèque", locale: "fr_FR" },
    });
    await prisma.user.update({ where: { id: member.id }, data: { bio: "Bio courte." } });
    expect((await memberMetadata(pseudoParams(member.pseudoSlug))).description).toBe("Bio courte.");

    const page = html(await MemberPage(pseudoParams(member.pseudoSlug)));
    expect(page).toContain("Ses modèles");
    expect(page).toContain("Coeur");
    expect(page).toContain("1 modèle publié");

    expect(await memberMetadata(pseudoParams("inconnu"))).toEqual({ robots: { index: false } });
    await expect(MemberPage(pseudoParams("inconnu"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
