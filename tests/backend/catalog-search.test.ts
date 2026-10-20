import { beforeEach, describe, expect, it, vi } from "vitest";

// La route lit la session (cookies) pour renseigner les favoris.
vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);

import { GET } from "@/app/api/models/route";
import { parseCatalogParams } from "@/features/catalog/params";
import { searchModels } from "@/features/catalog/search";
import type { License, ModelFormat, ModelStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/tests/setup/backend";
import { createCategory, createMember } from "@/tests/support/publication";

type Seed = {
  title: string;
  format?: ModelFormat;
  license?: License;
  category?: string;
  tags?: string[];
  status?: ModelStatus;
  deleted?: boolean;
  downloads?: number;
  daysAgo?: number;
  searchText?: string;
};

let authorId: string;
const categories: Record<string, string> = {};
const now = new Date("2026-10-18T12:00:00Z");

async function model(seed: Seed) {
  const created = await prisma.model.create({
    data: {
      slug: seed.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-"),
      title: seed.title,
      format: seed.format ?? "SVG",
      status: seed.status ?? "PUBLISHED",
      license: seed.license ?? "CC_BY",
      categoryId: categories[seed.category ?? "deco"],
      authorId,
      fileKey: "models/x",
      previewKey: "m/v",
      previewWidth: 1600,
      previewHeight: 1600,
      downloadCount: seed.downloads ?? 0,
      searchText: seed.searchText ?? "",
      publishedAt: new Date(now.getTime() - (seed.daysAgo ?? 1) * 86_400_000),
      deletedAt: seed.deleted ? now : null,
      tags: {
        create: (seed.tags ?? []).map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
  });
  return created;
}

const search = (query: string) =>
  searchModels(prisma, parseCatalogParams(new URLSearchParams(query)), now);
const titles = async (query: string) => (await search(query)).items.map((item) => item.title);

beforeEach(async () => {
  authorId = (await createMember(prisma)).id;
  categories.deco = (await createCategory(prisma, "Décoration")).id;
  categories.fetes = (await createCategory(prisma, "Fêtes")).id;
});

describe("searchModels", () => {
  it("ne montre que les modèles publiés non supprimés, du plus récent au plus ancien", async () => {
    await model({ title: "Ancien", daysAgo: 10 });
    await model({ title: "Récent", daysAgo: 1 });
    await model({ title: "Brouillon", status: "DRAFT" });
    await model({ title: "Masqué", status: "HIDDEN" });
    await model({ title: "Supprimé", deleted: true });
    const page = await search("");
    expect(page.items.map((i) => i.title)).toEqual(["Récent", "Ancien"]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      format: "SVG",
      authorSlug: expect.any(String),
      preview: { width: 1600, sm: expect.stringMatching(/m\/v-sm\.webp$/) },
    });
  });

  it("cherche sans accents ni pluriels, classe par pertinence", async () => {
    await model({ title: "Étoile de Noël", searchText: "Décoration de sapin" });
    await model({ title: "Carte", searchText: "étoiles filantes" });
    await model({ title: "Papillon" });
    expect(await titles("q=etoiles+noel")).toEqual(["Étoile de Noël"]);
    expect(await titles("q=etoile")).toEqual(["Étoile de Noël", "Carte"]);
    expect(await titles("q=etoile&sort=recent")).toHaveLength(2);
    expect(await titles("q=dinosaure")).toEqual([]);
  });

  it("cumule format, catégorie, licence et mots-clés", async () => {
    await model({ title: "A", format: "CWPRJ", license: "CC0", tags: ["noel", "boite"] });
    await model({
      title: "B",
      format: "SVG",
      license: "CC_BY_NC",
      category: "fetes",
      tags: ["noel"],
    });
    await model({ title: "C", format: "SVG", license: "PERSONAL_USE", tags: ["boite"] });
    expect(await titles("format=cwprj")).toEqual(["A"]);
    expect((await titles("format=cwprj&format=svg")).sort()).toEqual(["A", "B", "C"]);
    expect(await titles("category=fetes")).toEqual(["B"]);
    expect(await titles("license=free")).toEqual(["A"]);
    expect((await titles("license=noncommercial&license=personal")).sort()).toEqual(["B", "C"]);
    expect((await titles("tag=noel")).sort()).toEqual(["A", "B"]);
    expect(await titles("tag=noel&tag=boite")).toEqual(["A"]);
    expect(await titles("tag=Noël&format=svg")).toEqual(["B"]);
  });

  it("trie par téléchargements et popularité de la semaine", async () => {
    const a = await model({ title: "Peu", downloads: 3 });
    const b = await model({ title: "Beaucoup", downloads: 50 });
    expect(await titles("sort=downloads")).toEqual(["Beaucoup", "Peu"]);

    const member = await createMember(prisma);
    const day = new Date("2026-10-17T00:00:00Z");
    await prisma.download.createMany({
      data: [
        {
          userId: member.id,
          modelId: a.id,
          day,
          counted: true,
          createdAt: new Date("2026-10-17T10:00:00Z"),
        },
        {
          userId: authorId,
          modelId: a.id,
          day,
          counted: true,
          createdAt: new Date("2026-10-17T11:00:00Z"),
        },
        // Hors fenêtre de 7 jours :
        {
          userId: member.id,
          modelId: b.id,
          day: new Date("2026-09-01T00:00:00Z"),
          counted: true,
          createdAt: new Date("2026-09-01T10:00:00Z"),
        },
      ],
    });
    expect(await titles("sort=popular")).toEqual(["Peu", "Beaucoup"]);
  });

  it("pagine par curseur sans doublon ni trou, pour chaque tri", async () => {
    for (let i = 0; i < 7; i += 1) {
      await model({
        title: `Modèle ${i}`,
        daysAgo: i % 3,
        downloads: i % 2,
        searchText: "papillon",
      });
    }
    for (const sort of ["recent", "downloads", "popular", "relevance"]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const params = new URLSearchParams({ q: "papillon", sort, limit: "3" });
        if (cursor) params.set("cursor", cursor);
        const page = await searchModels(prisma, parseCatalogParams(params), now);
        if (pages === 0) expect(page.total).toBe(7);
        else expect(page.total).toBeNull();
        seen.push(...page.items.map((i) => i.title));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(7);
    }
  });

  it("ignore un curseur altéré", async () => {
    await model({ title: "Seul" });
    expect(await titles("cursor=nimporte-quoi")).toEqual(["Seul"]);
  });
});

describe("GET /api/models", () => {
  it("renvoie la page en JSON, cache court", async () => {
    await model({ title: "Papillon", searchText: "aile" });
    const response = await GET(new Request("http://localhost/api/models?q=ailes&limit=5"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=30");
    const body = await response.json();
    expect(body).toMatchObject({ total: 1, nextCursor: null, items: [{ title: "Papillon" }] });
  });
});
