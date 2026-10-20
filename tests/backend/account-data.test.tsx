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

import AboutPage, { generateMetadata as aboutMeta } from "@/app/(public)/about/page";
import HelpPage from "@/app/(public)/help/page";
import LegalPage from "@/app/(public)/legal/page";
import PrivacyPage, { generateMetadata as privacyMeta } from "@/app/(public)/legal/privacy/page";
import TermsPage from "@/app/(public)/legal/terms/page";
import SettingsPage from "@/app/(member)/me/settings/page";
import { GET as exportRoute } from "@/app/api/me/export/route";
import { deleteAccountAction } from "@/features/account/actions";
import { SYSTEM_USER } from "@/features/account/bootstrap";
import { deleteAccount, exportFileName, exportUserData } from "@/features/account/service";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { createMemoryMailer, setMailerForTests } from "@/lib/mail/mailer";
import { listKeys, writeObject } from "@/lib/storage/objects";
import { buckets, s3 } from "@/lib/storage/s3";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, form, requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const PASSWORD = "papillon-de-nuit-42";
const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

let mail: ReturnType<typeof createMemoryMailer>;
let counter = 0;

beforeEach(() => {
  requestContext.reset();
  mail = createMemoryMailer();
  setMailerForTests(mail);
});

const deps = () => ({ prisma, s3: s3(), buckets: buckets(), mailer: mail });

async function member(options?: Parameters<typeof createMember>[1]) {
  const user = await createMember(prisma, options);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(PASSWORD), bio: "Découpe le dimanche" },
  });
  return user;
}

/** Modèle avec fichier et aperçus réels dans MinIO. */
async function model(authorId: string, status: ModelStatus = "PUBLISHED", title = "Papillon") {
  counter += 1;
  const category = await createCategory(prisma);
  const tag = await prisma.tag.upsert({
    where: { name: "papillon" },
    update: {},
    create: { name: "papillon" },
  });
  const created = await prisma.model.create({
    data: {
      slug: `compte-${counter}`,
      title,
      description: "Ailes **dentelées**",
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId,
      fileKey: `models/compte-${counter}.svg`,
      fileName: "papillon.svg",
      fileSize: 6,
      // Clé définitive (préfixée par l'identifiant) posée juste après la création.
      previewKey: "provisoire/v1",
      previewWidth: 10,
      previewHeight: 10,
      publishedAt: new Date(),
      searchText: `${title} auteur`,
      tags: { create: { tagId: tag.id } },
    },
  });
  await prisma.model.update({
    where: { id: created.id },
    data: { previewKey: `${created.id}/v1` },
  });
  await writeObject(s3(), buckets().models, created.fileKey!, "<svg/>", "image/svg+xml");
  await writeObject(s3(), buckets().previews, `${created.id}/v1-sm.webp`, "x", "image/webp");
  return created;
}

const objects = async (m: { id: string; fileKey: string | null }) => [
  ...(await listKeys(s3(), buckets().models, m.fileKey!)),
  ...(await listKeys(s3(), buckets().previews, `${m.id}/`)),
];

describe("exportUserData", () => {
  it("rassemble profil, modèles, favoris, téléchargements, signalements et sessions, sans secret", async () => {
    const user = await member();
    const other = await member();
    const own = await model(user.id, "PUBLISHED", "Mon papillon");
    const theirs = await model(other.id, "PUBLISHED", "Son étoile");
    await prisma.favorite.create({ data: { userId: user.id, modelId: theirs.id } });
    await prisma.download.create({
      data: { userId: user.id, modelId: theirs.id, day: new Date("2026-10-20"), counted: true },
    });
    await prisma.report.create({
      data: { modelId: theirs.id, reporterId: user.id, reason: "SPAM", details: "Pub" },
    });
    await createSession(prisma, user.id);

    const data = await exportUserData(prisma, user.id, new Date("2026-10-20T08:00:00Z"));
    expect(data).toMatchObject({
      format: "canvatheque-export",
      version: 1,
      exportedAt: "2026-10-20T08:00:00.000Z",
      account: { pseudo: user.pseudo, email: user.email, bio: "Découpe le dimanche" },
      models: [
        expect.objectContaining({
          slug: own.slug,
          title: "Mon papillon",
          category: "Décoration",
          tags: ["papillon"],
          fileName: "papillon.svg",
        }),
      ],
      favorites: [{ slug: theirs.slug, title: "Son étoile" }],
      downloads: [{ slug: theirs.slug }],
      reports: [{ slug: theirs.slug, reason: "SPAM", details: "Pub", status: "OPEN" }],
      comments: [],
    });
    expect(data.activeSessions).toHaveLength(1);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("argon2");
    expect(serialized).not.toContain("passwordHash");
    expect(exportFileName("lucie-m", new Date("2026-10-20T08:00:00Z"))).toBe(
      "canvatheque-lucie-m-2026-10-20.json",
    );
  });
});

describe("GET /api/me/export", () => {
  it("visiteur : 401 ; membre : fichier JSON en pièce jointe ; limite horaire", async () => {
    expect((await exportRoute(new Request("http://localhost/api/me/export"))).status).toBe(401);

    const user = await member();
    const { token } = await createSession(prisma, user.id);
    requestContext.cookies.set("canvatheque.session", { value: token });
    const response = await exportRoute(new Request("http://localhost/api/me/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(
        `^attachment; filename="canvatheque-${user.pseudoSlug}-\\d{4}-\\d{2}-\\d{2}\\.json"$`,
      ),
    );
    expect((await response.json()).account.email).toBe(user.email);

    for (let i = 0; i < 9; i += 1) await exportRoute(new Request("http://localhost/api/me/export"));
    const blocked = await exportRoute(new Request("http://localhost/api/me/export"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("deleteAccount", () => {
  it("TRANSFER : modèles publiés transférés, le reste supprimé en base et dans MinIO", async () => {
    const user = await member();
    const other = await member();
    const published = await model(user.id, "PUBLISHED", "Publié");
    const draft = await model(user.id, "DRAFT", "Brouillon");
    const hidden = await model(user.id, "HIDDEN", "Masqué");
    const theirs = await model(other.id);
    await prisma.model.update({ where: { id: theirs.id }, data: { favoriteCount: 1 } });
    await prisma.favorite.create({ data: { userId: user.id, modelId: theirs.id } });
    await prisma.report.create({
      data: { modelId: theirs.id, reporterId: user.id, reason: "SPAM" },
    });
    await prisma.upload.create({
      data: {
        userId: user.id,
        kind: "MODEL",
        key: "uploads/en-attente",
        declaredName: "x.svg",
        declaredSize: 6,
        declaredMime: "image/svg+xml",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await writeObject(s3(), buckets().models, "uploads/en-attente", "<svg/>", "image/svg+xml");
    await createSession(prisma, user.id);

    expect(await deleteAccount(deps(), user.id, { password: PASSWORD, mode: "TRANSFER" })).toEqual({
      ok: true,
      data: { deletedModels: 2, transferredModels: 1 },
    });

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const system = await prisma.user.findUniqueOrThrow({
      where: { pseudoSlug: SYSTEM_USER.pseudoSlug },
    });
    const kept = await prisma.model.findUniqueOrThrow({ where: { id: published.id } });
    expect(kept.authorId).toBe(system.id);
    expect(kept.searchText).toContain("Auteur supprimé");
    expect(kept.searchText).not.toContain(user.pseudo);
    expect(await objects(published)).toHaveLength(2);

    for (const gone of [draft, hidden]) {
      expect(await prisma.model.findUnique({ where: { id: gone.id } })).toBeNull();
      expect(await objects(gone)).toEqual([]);
    }
    expect(await listKeys(s3(), buckets().models, "uploads/en-attente")).toEqual([]);
    expect((await prisma.model.findUniqueOrThrow({ where: { id: theirs.id } })).favoriteCount).toBe(
      0,
    );
    // Signalement anonymisé, toujours ouvert.
    expect(await prisma.report.findFirstOrThrow({ where: { modelId: theirs.id } })).toMatchObject({
      reporterId: system.id,
      status: "OPEN",
    });
    expect(mail.sent.map((m) => [m.to, m.subject])).toEqual([
      [user.email, "Votre compte Canvathèque est supprimé"],
    ]);
  });

  it("DELETE_ALL : tous les modèles supprimés ; signalement en double du compte système écarté", async () => {
    const user = await member();
    const other = await member();
    const published = await model(user.id);
    const theirs = await model(other.id);
    const system = await prisma.user.create({
      data: { ...SYSTEM_USER, isSystem: true, tosAcceptedAt: new Date() },
    });
    await prisma.report.create({
      data: { modelId: theirs.id, reporterId: system.id, reason: "SPAM" },
    });
    await prisma.report.create({
      data: { modelId: theirs.id, reporterId: user.id, reason: "AUTRE" },
    });

    expect(
      await deleteAccount(deps(), user.id, { password: PASSWORD, mode: "DELETE_ALL" }),
    ).toEqual({
      ok: true,
      data: { deletedModels: 1, transferredModels: 0 },
    });
    expect(await prisma.model.findUnique({ where: { id: published.id } })).toBeNull();
    expect(await objects(published)).toEqual([]);
    expect(await prisma.report.findMany({ where: { modelId: theirs.id } })).toEqual([
      expect.objectContaining({ reporterId: system.id, reason: "SPAM" }),
    ]);
  });

  it("refuse mauvais mot de passe, administrateur, compte système ou inconnu", async () => {
    const user = await member();
    const admin = await member({ role: "ADMIN" });
    const system = await prisma.user.create({
      data: { ...SYSTEM_USER, isSystem: true, tosAcceptedAt: new Date() },
    });
    expect(
      await deleteAccount(deps(), user.id, { password: "faux", mode: "TRANSFER" }),
    ).toMatchObject({ error: { code: "UNAUTHORIZED", fields: { password: "wrongPassword" } } });
    expect(
      await deleteAccount(deps(), admin.id, { password: PASSWORD, mode: "TRANSFER" }),
    ).toMatchObject({ error: { code: "FORBIDDEN", message: "errors.account.adminDelete" } });
    for (const id of [system.id, "inconnu"]) {
      expect(
        await deleteAccount(deps(), id, { password: PASSWORD, mode: "TRANSFER" }),
      ).toMatchObject({ error: { code: "NOT_FOUND" } });
    }
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("deleteAccountAction", () => {
  async function signIn() {
    const user = await member();
    const { token } = await createSession(prisma, user.id);
    requestContext.cookies.set("canvatheque.session", { value: token });
    return user;
  }

  it("visiteur : connexion ; champs invalides ; mauvais mot de passe", async () => {
    expect(await expectRedirect(() => deleteAccountAction({ status: "idle" }, form({})))).toBe(
      "/login?redirectTo=%2Fme%2Fsettings",
    );
    await signIn();
    expect(await deleteAccountAction({ status: "idle" }, form({ mode: "X" }))).toMatchObject({
      status: "error",
      fields: { password: "required", mode: "deleteMode" },
      values: { mode: "X" },
    });
    expect(
      await deleteAccountAction({ status: "idle" }, form({ password: "faux", mode: "DELETE_ALL" })),
    ).toMatchObject({ status: "error", fields: { password: "wrongPassword" } });
  });

  it("supprime, ferme la session et renvoie vers l'accueil avec un message", async () => {
    const user = await signIn();
    const url = await expectRedirect(() =>
      deleteAccountAction({ status: "idle" }, form({ password: PASSWORD, mode: "TRANSFER" })),
    );
    expect(url).toBe("/");
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(requestContext.cookies.has("canvatheque.session")).toBe(false);
    expect(requestContext.cookies.get("canvatheque.flash")?.value).toContain("accountDeleted");
  });

  it("limite les tentatives", async () => {
    process.env.RATE_LIMIT_LOGIN_PER_15MIN = "1";
    resetEnvCache();
    try {
      await signIn();
      await deleteAccountAction({ status: "idle" }, form({ password: "faux", mode: "TRANSFER" }));
      expect(
        await deleteAccountAction({ status: "idle" }, form({ password: "faux", mode: "TRANSFER" })),
      ).toMatchObject({ status: "error", message: "errors.rateLimited" });
    } finally {
      delete process.env.RATE_LIMIT_LOGIN_PER_15MIN;
      resetEnvCache();
    }
  });
});

describe("pages", () => {
  it("paramètres : export et zone de suppression (texte dédié pour un administrateur)", async () => {
    const user = await member();
    const { token } = await createSession(prisma, user.id);
    requestContext.cookies.set("canvatheque.session", { value: token });
    const page = html(await SettingsPage());
    expect(page).toContain('href="/api/me/export"');
    expect(page).toContain("Les transférer à « Auteur supprimé »");

    requestContext.reset();
    const admin = await member({ role: "ADMIN" });
    const session = await createSession(prisma, admin.id);
    requestContext.cookies.set("canvatheque.session", { value: session.token });
    expect(html(await SettingsPage())).toContain(
      "Un administrateur ne peut pas supprimer son compte depuis cette page.",
    );
  });

  it("pages de contenu : sommaire, liens, valeurs légales (ou « à compléter »)", async () => {
    const about = html(await AboutPage());
    expect(about).toContain("<h1");
    expect(about).toContain('href="#projet"');
    expect(about).toContain('href="/legal/privacy"');
    expect(html(await HelpPage())).toContain('id="canvasworkspace"');
    expect(html(await TermsPage())).toContain("Conditions générales d&#x27;utilisation");
    expect(html(await LegalPage())).toContain("[à compléter par l&#x27;éditeur du site]");

    process.env.LEGAL_PUBLISHER = "Atelier Exemple";
    process.env.CONTACT_EMAIL = "contact@exemple.fr";
    resetEnvCache();
    try {
      const privacy = html(await PrivacyPage());
      expect(privacy).toContain("Atelier Exemple");
      expect(privacy).toContain('href="mailto:contact@exemple.fr"');
    } finally {
      delete process.env.LEGAL_PUBLISHER;
      delete process.env.CONTACT_EMAIL;
      resetEnvCache();
    }
    expect(await aboutMeta()).toMatchObject({ alternates: { canonical: "/about" } });
    expect((await privacyMeta()).title).toBe("Politique de confidentialité");
  });
});
