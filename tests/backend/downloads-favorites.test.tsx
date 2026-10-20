import { createTranslator, NextIntlClientProvider } from "next-intl";
import type * as NextIntl from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock("next/navigation", async () => ({
  ...(await import("@/tests/support/next-request")).navigationModule,
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "fr", messages, namespace: namespace as never }),
  getFormatter: async () => ({
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
  }),
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

import DownloadsPage, { generateMetadata as downloadsMeta } from "@/app/(member)/me/downloads/page";
import FavoritesPage, { generateMetadata as favoritesMeta } from "@/app/(member)/me/favorites/page";
import { GET as downloadRoute } from "@/app/api/models/[slug]/download/route";
import { GET as modelsRoute } from "@/app/api/models/route";
import {
  attachmentHeader,
  listMyDownloads,
  requestDownload,
  utcDay,
} from "@/features/downloads/service";
import { toggleFavoriteAction } from "@/features/favorites/actions";
import { listFavorites, toggleFavorite, withFavorites } from "@/features/favorites/service";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { writeObject } from "@/lib/storage/objects";
import { buckets, publicS3, s3 } from "@/lib/storage/s3";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
let counter = 0;

async function model(
  authorId: string,
  { status = "PUBLISHED" as ModelStatus, title = "Papillon ajouré", file = true } = {},
) {
  counter += 1;
  const category = await createCategory(prisma);
  const fileKey = `models/test-${counter}.svg`;
  if (file) await writeObject(s3(), buckets().models, fileKey, SVG, "image/svg+xml");
  return prisma.model.create({
    data: {
      slug: `papillon-${counter}`,
      title,
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId,
      fileKey: file ? fileKey : null,
      previewKey: "m/v",
      previewWidth: 10,
      previewHeight: 10,
      publishedAt: new Date(),
    },
  });
}

async function signIn(options?: Parameters<typeof createMember>[1]) {
  const member = await createMember(prisma, options);
  const { token } = await createSession(prisma, member.id);
  requestContext.cookies.set("canvatheque.session", { value: token });
  return member;
}

const download = (slug: string, accept?: string) =>
  downloadRoute(
    new Request(`http://localhost/api/models/${slug}/download`, {
      headers: accept ? { accept } : {},
    }),
    { params: Promise.resolve({ slug }) },
  );

beforeEach(() => requestContext.reset());

describe("GET /api/models/[slug]/download", () => {
  it("visiteur : 401 JSON pour le bouton, connexion pour un lien ouvert directement", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    const loginUrl = `/login?redirectTo=${encodeURIComponent(`/models/${m.slug}?download=1`)}`;
    const response = await download(m.slug, "application/json");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "UNAUTHORIZED", loginUrl });

    const direct = await download(m.slug);
    expect(direct.status).toBe(303);
    expect(direct.headers.get("Location")).toBe(`http://localhost:3000${loginUrl}`);
  });

  it("membre : 302 vers une URL présignée en pièce jointe, réellement téléchargeable", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    await signIn();
    const response = await download(m.slug);
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const location = response.headers.get("Location")!;
    expect(location).toContain("X-Amz-Signature");
    const file = await fetch(location);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toBe(attachmentHeader(m.slug, "SVG"));
    expect(file.headers.get("content-type")).toBe("application/octet-stream");
    expect(await file.text()).toBe(SVG);

    const json = await download(m.slug, "application/json");
    expect(json.status).toBe(200);
    expect((await json.json()).url).toContain("X-Amz-Signature");
  });

  it("compte un seul téléchargement par jour et par membre", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    const member = await signIn();
    await download(m.slug);
    await download(m.slug);
    expect((await prisma.model.findUniqueOrThrow({ where: { id: m.id } })).downloadCount).toBe(1);
    const rows = await prisma.download.findMany({ where: { modelId: m.id } });
    expect(rows.map((row) => row.counted).sort()).toEqual([false, true]);
    expect(rows[0]!.userId).toBe(member.id);

    // Le lendemain, de nouveau compté.
    const deps = {
      prisma,
      publicS3: publicS3(),
      bucket: buckets().models,
      ttlSeconds: 60,
      now: () => new Date(Date.now() + 86_400_000),
    };
    expect(await requestDownload(deps, member, m.slug)).toMatchObject({
      ok: true,
      data: { counted: true },
    });
  });

  it("404 : inconnu, sans fichier, brouillon d'un autre ; l'auteur télécharge son brouillon", async () => {
    const author = await createMember(prisma);
    const draft = await model(author.id, { status: "DRAFT" });
    const empty = await model(author.id, { status: "DRAFT", file: false });
    await signIn();
    expect((await download("inconnu")).status).toBe(404);
    expect((await download(empty.slug)).status).toBe(404);
    expect((await download(draft.slug)).status).toBe(404);

    requestContext.reset();
    const { token } = await createSession(prisma, author.id);
    requestContext.cookies.set("canvatheque.session", { value: token });
    expect((await download(draft.slug)).status).toBe(302);
    // Brouillon encore sans fichier : rien à télécharger, même pour l'auteur.
    expect((await download(empty.slug)).status).toBe(404);
  });

  it("429 au-delà de la limite horaire, avec Retry-After", async () => {
    process.env.RATE_LIMIT_DOWNLOAD_PER_HOUR = "1";
    resetEnvCache();
    try {
      const author = await createMember(prisma);
      const m = await model(author.id);
      await signIn();
      expect((await download(m.slug)).status).toBe(302);
      const blocked = await download(m.slug);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    } finally {
      delete process.env.RATE_LIMIT_DOWNLOAD_PER_HOUR;
      resetEnvCache();
    }
  });

  it("refuse un acteur absent ou banni côté service", async () => {
    const deps = { prisma, publicS3: publicS3(), bucket: buckets().models, ttlSeconds: 60 };
    expect(await requestDownload(deps, null, "x")).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    const banned = await createMember(prisma, { banned: true });
    expect(await requestDownload(deps, banned, "x")).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("utilitaires : jour UTC et nom de fichier", () => {
    expect(utcDay(new Date("2026-10-18T23:30:00-02:00")).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z",
    );
    expect(attachmentHeader("étoile-de-noël", "CWPRJ")).toBe(
      `attachment; filename="_toile-de-no_l.cwprj"; filename*=UTF-8''%C3%A9toile-de-no%C3%ABl.cwprj`,
    );
  });
});

describe("favoris", () => {
  it("ajoute, retire et tient le compteur", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    const member = await createMember(prisma);
    expect(await toggleFavorite(prisma, member, m.id)).toEqual({
      ok: true,
      data: { favorited: true, favoriteCount: 1 },
    });
    expect(await withFavorites(prisma, member.id, [{ id: m.id }, { id: "autre" }])).toEqual([
      { id: m.id, favorited: true },
      { id: "autre", favorited: false },
    ]);
    expect(await withFavorites(prisma, null, [{ id: m.id }])).toEqual([
      { id: m.id, favorited: false },
    ]);
    expect((await listFavorites(prisma, member.id)).map((i) => i.title)).toEqual([
      "Papillon ajouré",
    ]);
    expect(await toggleFavorite(prisma, member, m.id)).toEqual({
      ok: true,
      data: { favorited: false, favoriteCount: 0 },
    });
  });

  it("refuse visiteur, banni, modèle inconnu ou brouillon d'un autre ; masque les dépubliés", async () => {
    const author = await createMember(prisma);
    const draft = await model(author.id, { status: "DRAFT" });
    const published = await model(author.id);
    const member = await createMember(prisma);
    expect(await toggleFavorite(prisma, null, published.id)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(
      await toggleFavorite(prisma, await createMember(prisma, { banned: true }), published.id),
    ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(await toggleFavorite(prisma, member, "inconnu")).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(await toggleFavorite(prisma, member, draft.id)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    await toggleFavorite(prisma, member, published.id);
    await prisma.model.update({ where: { id: published.id }, data: { status: "DRAFT" } });
    expect(await listFavorites(prisma, member.id)).toEqual([]);
  });

  it("action serveur : validation et session", async () => {
    expect(await toggleFavoriteAction(42)).toMatchObject({ error: { code: "VALIDATION" } });
    const author = await createMember(prisma);
    const m = await model(author.id);
    expect(await toggleFavoriteAction(m.id)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await signIn();
    expect(await toggleFavoriteAction(m.id)).toMatchObject({ ok: true, data: { favorited: true } });
  });

  it("GET /api/models : cœurs renseignés pour un membre, réponse privée", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    const anonymous = await modelsRoute(new Request("http://localhost/api/models"));
    expect(anonymous.headers.get("Cache-Control")).toContain("public");
    expect(anonymous.headers.get("Vary")).toBe("Cookie");
    expect((await anonymous.json()).items[0].favorited).toBeUndefined();

    const member = await signIn();
    await toggleFavorite(prisma, member, m.id);
    const personal = await modelsRoute(new Request("http://localhost/api/models"));
    expect(personal.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await personal.json()).items[0]).toMatchObject({ id: m.id, favorited: true });
  });
});

describe("pages Mes favoris et Mes téléchargements", () => {
  it("redirigent un visiteur", async () => {
    expect(await expectRedirect(() => FavoritesPage())).toBe("/login?redirectTo=%2Fme%2Ffavorites");
    expect(await expectRedirect(() => DownloadsPage())).toBe("/login?redirectTo=%2Fme%2Fdownloads");
  });

  it("listent favoris et derniers téléchargements, états vides", async () => {
    const member = await signIn();
    let page = html(await FavoritesPage());
    expect(page).toContain("Pas encore de favori");
    expect(page).toContain('aria-current="page"');
    expect(html(await DownloadsPage())).toContain("Aucun téléchargement pour l");

    const author = await createMember(prisma);
    const first = await model(author.id, { title: "Premier" });
    const second = await model(author.id, { title: "Second" });
    await toggleFavorite(prisma, member, first.id);
    await download(first.slug);
    await download(second.slug);
    page = html(await FavoritesPage());
    expect(page).toContain("1 favori");
    expect(page).toContain("Premier");

    const downloads = html(await DownloadsPage());
    expect(downloads).toContain("2 modèles");
    expect(downloads).toContain("Téléchargé le");
    expect((await listMyDownloads(prisma, member.id)).map((i) => i.title)).toEqual([
      "Second",
      "Premier",
    ]);
    expect(await favoritesMeta()).toMatchObject({ title: "Mes favoris" });
    expect(await downloadsMeta()).toMatchObject({ title: "Mes téléchargements" });
  });
});
