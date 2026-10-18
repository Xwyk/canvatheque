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

import CategoryPage, {
  generateMetadata as categoryMetadata,
} from "@/app/(public)/categories/[slug]/page";
import CategoriesPage, {
  generateMetadata as categoriesMetadata,
} from "@/app/(public)/categories/page";
import ModelsPage, { generateMetadata as modelsMetadata } from "@/app/(public)/models/page";
import type { ModelFormat, ModelStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/tests/setup/backend";
import { requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

type Search = Record<string, string | string[]>;
const modelsProps = (searchParams: Search = {}) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }) as never;
const categoryProps = (slug: string, searchParams: Search = {}) =>
  ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(searchParams) }) as never;

let authorId: string;
const categories: Record<string, string> = {};

async function model(
  title: string,
  {
    category = "deco",
    format = "SVG" as ModelFormat,
    status = "PUBLISHED" as ModelStatus,
    daysAgo = 1,
    deleted = false,
  } = {},
) {
  await prisma.model.create({
    data: {
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      format,
      status,
      license: "CC_BY",
      categoryId: categories[category],
      authorId,
      fileKey: "models/x",
      previewKey: "m/v",
      previewWidth: 1600,
      previewHeight: 1600,
      searchText: "",
      publishedAt: new Date(Date.now() - daysAgo * 86_400_000),
      deletedAt: deleted ? new Date() : null,
    },
  });
}

beforeEach(async () => {
  requestContext.reset();
  authorId = (await createMember(prisma)).id;
  categories.deco = (await createCategory(prisma, "Décoration")).id;
  categories.fetes = (await createCategory(prisma, "Fêtes")).id;
  await model("Papillon", { daysAgo: 1 });
  await model("Guirlande", { category: "fetes", format: "CWPRJ", daysAgo: 2 });
  await model("Etoile", { daysAgo: 3 });
  await model("Brouillon", { status: "DRAFT" });
  await model("Supprime", { deleted: true });
});

describe("galerie /models", () => {
  it("rend la première page côté serveur avec filtres, compteur et cartes", async () => {
    const page = html(await ModelsPage(modelsProps()));
    expect(page).toContain("Tous les modèles");
    expect(page).toContain("3 modèles");
    expect(page).toContain('href="/models/papillon"');
    expect(page).toContain('href="/models/guirlande"');
    expect(page).not.toContain("Brouillon");
    expect(page).toContain('aria-label="Filtres"');
    expect(page).toContain("Libre, hors usage commercial");
    expect(page).toContain("Fêtes");
    expect(page).not.toContain("Charger plus de modèles");

    expect(await modelsMetadata(modelsProps())).toMatchObject({
      title: "Tous les modèles",
      alternates: { canonical: "/models" },
      robots: undefined,
    });
  });

  it("applique les filtres de l'URL et n'indexe pas les recherches", async () => {
    const page = html(await ModelsPage(modelsProps({ format: "cwprj", q: "guirlande" })));
    expect(page).toContain("1 modèle");
    expect(page).toContain('href="/models/guirlande"');
    expect(page).not.toContain('href="/models/papillon"');
    expect(page).toContain("Retirer le filtre CWPRJ");
    expect(page).toMatch(/<option value="relevance" selected="">Pertinence<\/option>/);

    expect(await modelsMetadata(modelsProps({ q: "guirlande" }))).toMatchObject({
      title: "Recherche « guirlande »",
      robots: { index: false, follow: true },
    });
  });

  it("pagine sans JavaScript : lien « Charger plus » et page suivante avec le total", async () => {
    const first = html(await ModelsPage(modelsProps({ limit: "2" })));
    const next = first.match(/href="(\/models\?cursor=[^"]+)"/)?.[1];
    expect(next).toBeDefined();
    expect(first).toContain("Charger plus de modèles");

    const cursor = new URLSearchParams(next!.split("?")[1]).get("cursor")!;
    const second = html(await ModelsPage(modelsProps({ limit: "2", cursor })));
    expect(second).toContain("3 modèles");
    expect(second).toContain('href="/models/etoile"');
    expect(second).not.toContain('href="/models/papillon"');
    expect(await modelsMetadata(modelsProps({ cursor }))).toMatchObject({
      robots: { index: false },
    });
  });

  it("affiche l'état vide", async () => {
    const page = html(await ModelsPage(modelsProps({ q: "licorne" })));
    expect(page).toContain("Aucun modèle ne correspond");
  });
});

describe("catégories", () => {
  it("/categories liste les catégories avec le nombre de modèles publiés", async () => {
    const page = html(await CategoriesPage());
    expect(page).toContain("<h1");
    expect(page).toContain('href="/categories/decoration"');
    expect(page).toContain("2 modèles");
    expect(page).toContain("1 modèle");
    expect(await categoriesMetadata()).toMatchObject({
      title: "Catégories",
      alternates: { canonical: "/categories" },
    });
  });

  it("/categories/[slug] est la galerie préfiltrée", async () => {
    const page = html(await CategoryPage(categoryProps("decoration", { category: "fetes" })));
    expect(page).toContain("Décoration");
    expect(page).toContain('aria-label="Fil d&#x27;Ariane"');
    expect(page).toContain('aria-current="page"');
    expect(page).toContain("2 modèles");
    expect(page).toContain('href="/models/papillon"');
    expect(page).not.toContain('href="/models/guirlande"');
    expect(page).toContain("Retirer le filtre Décoration");

    expect(await categoryMetadata(categoryProps("decoration"))).toMatchObject({
      title: "Décoration : modèles de découpe",
      alternates: { canonical: "/categories/decoration" },
      robots: undefined,
    });
    expect(await categoryMetadata(categoryProps("decoration", { format: "svg" }))).toMatchObject({
      robots: { index: false, follow: true },
    });
  });

  it("annonce une catégorie vide et refuse une catégorie inconnue", async () => {
    await createCategory(prisma, "Enfants");
    const empty = html(await CategoryPage(categoryProps("enfants")));
    expect(empty).toContain("Aucun modèle dans cette catégorie pour l&#x27;instant");

    await expect(CategoryPage(categoryProps("inconnue"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await categoryMetadata(categoryProps("inconnue"))).toEqual({
      robots: { index: false },
    });
  });
});
