import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { ADMIN_PSEUDO, SYSTEM_USER, ensureCoreAccounts } from "@/features/account/bootstrap";
import { getCategories, getPopularTagNames } from "@/features/catalog/queries";
import { buckets, s3 } from "@/lib/storage/s3";
import { hashToken } from "@/lib/tokens";
import { CATEGORIES, DEMO_MEMBERS, DEMO_TAGS, seed } from "@/prisma/seed";
import { DEMO_MODELS } from "@/prisma/seed-models";
import { prisma } from "@/tests/setup/backend";
import { objectExists } from "@/tests/support/publication";

const SEED_OPTIONS = {
  adminEmail: "Admin@Canvatheque.test",
  memberPassword: "mot-de-passe-de-test",
  appUrl: "http://localhost:3000",
};

async function createModel(
  overrides: Partial<{ status: "DRAFT" | "PUBLISHED"; title: string; searchText: string }> = {},
) {
  const author = await prisma.user.findFirstOrThrow({ where: { isSystem: false, role: "MEMBER" } });
  const category = await prisma.category.findFirstOrThrow();
  const status = overrides.status ?? "PUBLISHED";
  return prisma.model.create({
    data: {
      slug: `modele-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? "Papillon ajouré",
      format: "SVG",
      status,
      authorId: author.id,
      categoryId: category.id,
      license: "CC_BY",
      fileKey: "models/x.svg",
      previewKey: "previews/x",
      searchText: overrides.searchText ?? "",
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });
}

describe("migrations", () => {
  it("s'appliquent sur une base vide (globalSetup) et créent la recherche plein texte", async () => {
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`;
    // Une migration par étape qui modifie le schéma (initiale, aperçu choisi par le membre,
    // unicité des signalements ouverts).
    expect(Number(count)).toBe(3);

    await seed(prisma, SEED_OPTIONS);
    await createModel({ title: "Étoile festive", searchText: "Décorations de Noël pour sapins" });

    // Accents et pluriels : « etoiles » et « noel » trouvent « Étoile » et « Noël ».
    const rows = await prisma.$queryRaw<{ title: string }[]>`
      SELECT "title" FROM "Model"
      WHERE "searchVector" @@ websearch_to_tsquery('french_unaccent', 'etoiles noel')`;
    expect(rows.map((row) => row.title)).toEqual(["Étoile festive"]);
  });

  it("refuse un modèle publié incomplet (contrainte CHECK)", async () => {
    await seed(prisma, SEED_OPTIONS);
    const author = await prisma.user.findFirstOrThrow({
      where: { role: "MEMBER", isSystem: false },
    });
    await expect(
      prisma.model.create({
        data: {
          slug: "incomplet",
          title: "Incomplet",
          format: "CWPRJ",
          status: "PUBLISHED",
          authorId: author.id,
        },
      }),
    ).rejects.toThrow(/Model_published_complete_check/);
  });

  it("ne compte qu'un téléchargement par jour et par couple (index unique partiel)", async () => {
    await seed(prisma, SEED_OPTIONS);
    const model = await createModel();
    const user = await prisma.user.findFirstOrThrow({ where: { role: "MEMBER" } });
    const day = new Date("2026-10-18T00:00:00Z");
    const base = { userId: user.id, modelId: model.id, day };
    await prisma.download.create({ data: { ...base, counted: true } });
    await prisma.download.create({ data: { ...base, counted: false } });
    await expect(prisma.download.create({ data: { ...base, counted: true } })).rejects.toThrow();
  });

  it("un seul signalement ouvert par membre et par modèle (index unique partiel)", async () => {
    await seed(prisma, SEED_OPTIONS);
    const model = await createModel();
    const user = await prisma.user.findFirstOrThrow({ where: { pseudoSlug: "lucie-m" } });
    const base = { modelId: model.id, reporterId: user.id, reason: "SPAM" as const };
    await prisma.report.create({ data: { ...base, status: "DISMISSED" } });
    await prisma.report.create({ data: { ...base, status: "DISMISSED" } });
    await prisma.report.create({ data: base });
    await expect(prisma.report.create({ data: base })).rejects.toThrow();
  });
});

describe("seed", () => {
  it("est idempotent", async () => {
    await seed(prisma, SEED_OPTIONS);
    await seed(prisma, SEED_OPTIONS);
    expect(await prisma.category.count()).toBe(CATEGORIES.length);
    expect(await prisma.tag.count()).toBe(DEMO_TAGS.length);
    // membres de démonstration + administrateur + compte système
    expect(await prisma.user.count()).toBe(DEMO_MEMBERS.length + 2);

    const member = await prisma.user.findUniqueOrThrow({ where: { pseudoSlug: "lucie-m" } });
    expect(await argon2.verify(member.passwordHash!, SEED_OPTIONS.memberPassword)).toBe(true);
    expect(member.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("crée les modèles de démonstration avec fichiers et aperçus (une seule fois)", async () => {
    const storage = { s3: s3(), buckets: buckets() };
    const first = await seed(prisma, { ...SEED_OPTIONS, storage });
    expect(first.models).toBe(DEMO_MODELS.length);
    expect((await seed(prisma, { ...SEED_OPTIONS, storage })).models).toBe(0);

    const models = await prisma.model.findMany({ include: { tags: true, category: true } });
    expect(models).toHaveLength(30);
    expect(new Set(models.map((m) => m.categoryId)).size).toBe(CATEGORIES.length);
    expect(models.filter((m) => m.format === "CWPRJ")).toHaveLength(4);
    for (const model of models) {
      expect(model).toMatchObject({ status: "PUBLISHED", previewWidth: 1600 });
      expect(model.tags.length).toBeGreaterThan(0);
    }
    const sample = models.find((m) => m.format === "SVG")!;
    expect(await objectExists(buckets().models, sample.fileKey!)).toBe(true);
    expect(await objectExists(buckets().previews, `${sample.previewKey}-md.webp`)).toBe(true);
    // Recherche plein texte alimentée.
    const [hit] = await prisma.$queryRaw<{ title: string }[]>`
      SELECT "title" FROM "Model" WHERE "searchVector" @@ websearch_to_tsquery('french_unaccent', 'dragees')`;
    expect(hit?.title).toBe("Boîte à dragées");
    // Un signalement ouvert de démonstration, créé une seule fois.
    expect(await prisma.report.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("ordonne les catégories comme la maquette", async () => {
    await seed(prisma, SEED_OPTIONS);
    const categories = await getCategories(prisma);
    expect(categories.map((c) => c.name)).toEqual(CATEGORIES.map((c) => c.name));
    expect(categories[0]).toMatchObject({ slug: "cartes-et-papeterie", color: "#C81E4B" });
  });
});

describe("ensureCoreAccounts", () => {
  it("crée l'administrateur sans mot de passe et émet un lien de définition", async () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const result = await ensureCoreAccounts(prisma, { ...SEED_OPTIONS, now });

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: result.adminId } });
    expect(admin).toMatchObject({
      email: "admin@canvatheque.test",
      pseudo: ADMIN_PSEUDO,
      role: "ADMIN",
      passwordHash: null,
    });
    expect(admin.emailVerifiedAt).toEqual(now);

    const system = await prisma.user.findUniqueOrThrow({ where: { id: result.systemUserId } });
    expect(system).toMatchObject({ pseudo: SYSTEM_USER.pseudo, isSystem: true });

    const token = result.resetUrl!.split("/reset/")[1]!;
    const stored = await prisma.emailToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(stored).toMatchObject({ type: "RESET_PASSWORD", userId: admin.id, usedAt: null });
    expect(stored.expiresAt).toEqual(new Date("2026-10-19T10:00:00Z"));
  });

  it("remplace le lien précédent à chaque démarrage", async () => {
    await ensureCoreAccounts(prisma, SEED_OPTIONS);
    await ensureCoreAccounts(prisma, SEED_OPTIONS);
    expect(await prisma.emailToken.count({ where: { type: "RESET_PASSWORD", usedAt: null } })).toBe(
      1,
    );
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });

  it("utilise ADMIN_PASSWORD et n'émet alors aucun lien", async () => {
    const result = await ensureCoreAccounts(prisma, {
      ...SEED_OPTIONS,
      adminPassword: "admin-de-dev-123",
    });
    expect(result.resetUrl).toBeUndefined();
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: result.adminId } });
    expect(await argon2.verify(admin.passwordHash!, "admin-de-dev-123")).toBe(true);
  });

  it("promeut un compte existant et évite un pseudo déjà pris", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { pseudo: "admin", pseudoSlug: "admin", email: "autre@x.test", tosAcceptedAt: now },
    });
    await prisma.user.create({
      data: {
        pseudo: "camille",
        pseudoSlug: "camille",
        email: "camille@x.test",
        tosAcceptedAt: now,
      },
    });

    const promoted = await ensureCoreAccounts(prisma, {
      ...SEED_OPTIONS,
      adminEmail: "camille@x.test",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: promoted.adminId } })).role).toBe(
      "ADMIN",
    );

    const fresh = await ensureCoreAccounts(prisma, {
      ...SEED_OPTIONS,
      adminEmail: "nouvel@x.test",
    });
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: fresh.adminId } });
    expect(admin.pseudo).toMatch(/^admin-/);
  });
});

describe("getPopularTagNames", () => {
  it("classe les tags des modèles publiés par usage", async () => {
    await seed(prisma, SEED_OPTIONS);
    const [a, b, draft] = await Promise.all([
      createModel(),
      createModel(),
      createModel({ status: "DRAFT" }),
    ]);
    const tag = (name: string) => prisma.tag.findUniqueOrThrow({ where: { name } });
    const [papillon, coeur] = await Promise.all([tag("papillon"), tag("coeur")]);
    await prisma.modelTag.createMany({
      data: [
        { modelId: a.id, tagId: papillon.id },
        { modelId: b.id, tagId: papillon.id },
        { modelId: a.id, tagId: coeur.id },
        // Brouillon : ignoré dans le classement
        { modelId: draft.id, tagId: coeur.id },
      ],
    });
    expect(await getPopularTagNames(prisma)).toEqual(["papillon", "coeur"]);
    expect(await getPopularTagNames(prisma, 1)).toEqual(["papillon"]);
  });
});
