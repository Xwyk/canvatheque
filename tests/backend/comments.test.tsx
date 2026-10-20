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

import ModelPage from "@/app/(public)/models/[slug]/page";
import { listAdminActions } from "@/features/admin/service";
import {
  createCommentAction,
  deleteCommentAction,
  loadCommentsAction,
} from "@/features/comments/actions";
import {
  COMMENTS_PAGE_SIZE,
  countComments,
  createComment,
  deleteComment,
  listComments,
} from "@/features/comments/service";
import { createSession } from "@/lib/auth/session";
import { encodeCursor } from "@/lib/cursor";
import { resetEnvCache } from "@/lib/env";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/tests/setup/backend";
import { requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never;
let counter = 0;

async function model(authorId: string, status: ModelStatus = "PUBLISHED") {
  counter += 1;
  const category = await createCategory(prisma);
  return prisma.model.create({
    data: {
      slug: `commente-${counter}`,
      title: `Modèle commenté ${counter}`,
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId,
      fileKey: `models/c-${counter}.svg`,
      fileSize: 6,
      previewKey: `c${counter}/v`,
      previewWidth: 10,
      previewHeight: 10,
      publishedAt: new Date(),
    },
  });
}

async function signIn(options?: Parameters<typeof createMember>[1]) {
  const user = await createMember(prisma, options);
  const { token } = await createSession(prisma, user.id);
  requestContext.cookies.set("canvatheque.session", { value: token });
  return user;
}

beforeEach(() => requestContext.reset());

describe("service des commentaires", () => {
  it("publie sur un modèle publié ; refuse visiteur, banni, brouillon, inconnu", async () => {
    const author = await createMember(prisma);
    const reader = await createMember(prisma);
    const banned = await createMember(prisma, { banned: true });
    const m = await model(author.id);
    const draft = await model(author.id, "DRAFT");

    const created = await createComment(prisma, reader, { modelId: m.id, content: "Bravo" });
    expect(created).toMatchObject({
      ok: true,
      data: {
        content: "Bravo",
        canDelete: true,
        author: { pseudo: reader.pseudo, hasProfile: true },
      },
    });
    expect(await createComment(prisma, null, { modelId: m.id, content: "x" })).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(await createComment(prisma, banned, { modelId: m.id, content: "x" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    for (const modelId of [draft.id, "inconnu"]) {
      expect(await createComment(prisma, reader, { modelId, content: "x" })).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    }
    expect(await countComments(prisma, m.id)).toBe(1);
  });

  it("liste du plus récent au plus ancien, par pages, droits de suppression par lecteur", async () => {
    const author = await createMember(prisma);
    const writer = await createMember(prisma);
    const other = await createMember(prisma);
    const admin = await createMember(prisma, { role: "ADMIN" });
    const m = await model(author.id);
    const start = Date.now() - 60_000;
    await prisma.comment.createMany({
      data: Array.from({ length: COMMENTS_PAGE_SIZE + 2 }, (_, i) => ({
        modelId: m.id,
        authorId: writer.id,
        content: `n°${i}`,
        createdAt: new Date(start + i * 1000),
      })),
    });
    const target = { id: m.id, authorId: author.id };
    const first = await listComments(prisma, other, target);
    expect(first.items).toHaveLength(COMMENTS_PAGE_SIZE);
    expect(first.items[0]!.content).toBe(`n°${COMMENTS_PAGE_SIZE + 1}`);
    expect(first.items.every((c) => !c.canDelete)).toBe(true);
    const second = await listComments(prisma, other, target, first.nextCursor);
    expect(second.items.map((c) => c.content)).toEqual(["n°1", "n°0"]);
    expect(second.nextCursor).toBeNull();

    for (const reader of [writer, author, admin]) {
      expect((await listComments(prisma, reader, target)).items[0]!.canDelete).toBe(true);
    }
    expect((await listComments(prisma, null, target)).items[0]!.canDelete).toBe(false);
    // Curseur altéré ou date invalide : première page.
    expect((await listComments(prisma, null, target, "%%")).items).toHaveLength(COMMENTS_PAGE_SIZE);
    const bad = encodeCursor({ value: "pas une date", id: "x" });
    expect((await listComments(prisma, null, target, bad)).items[0]!.content).toBe(
      `n°${COMMENTS_PAGE_SIZE + 1}`,
    );
  });

  it("supprime : auteur, auteur du modèle, administrateur (journalisé) ; refuse les autres", async () => {
    const author = await createMember(prisma);
    const writer = await createMember(prisma);
    const other = await createMember(prisma);
    const admin = await createMember(prisma, { role: "ADMIN" });
    const m = await model(author.id);
    const post = async (content: string) => {
      const result = await createComment(prisma, writer, { modelId: m.id, content });
      if (!result.ok) throw new Error("commentaire non créé");
      return result.data.id;
    };
    const [c1, c2, c3] = [await post("un"), await post("deux"), await post("Pub pour mon site")];

    expect(await deleteComment(prisma, null, c1)).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(await deleteComment(prisma, other, c1)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await deleteComment(prisma, writer, c1)).toEqual({ ok: true, data: null });
    expect(await deleteComment(prisma, writer, c1)).toMatchObject({
      error: { code: "NOT_FOUND", message: "errors.comment.notFound" },
    });
    expect(await deleteComment(prisma, author, c2)).toEqual({ ok: true, data: null });
    expect((await listAdminActions(prisma, { page: 1 })).items).toHaveLength(0);
    expect(await deleteComment(prisma, admin, c3)).toEqual({ ok: true, data: null });
    expect((await listAdminActions(prisma, { page: 1 })).items).toEqual([
      expect.objectContaining({
        type: "COMMENT_DELETE",
        label: m.title,
        excerpt: "Pub pour mon site",
      }),
    ]);
    expect(await countComments(prisma, m.id)).toBe(0);
    expect(await prisma.comment.count({ where: { deletedAt: { not: null } } })).toBe(3);
  });
});

describe("actions des commentaires", () => {
  it("création : visiteur, validation, succès, limite horaire", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    expect(await createCommentAction({ modelId: m.id, content: "x" })).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    process.env.RATE_LIMIT_COMMENT_PER_HOUR = "1";
    resetEnvCache();
    try {
      await signIn();
      expect(await createCommentAction({ modelId: m.id, content: "  " })).toMatchObject({
        error: { code: "VALIDATION", fields: { content: "commentRequired" } },
      });
      expect(await createCommentAction({ modelId: m.id, content: "Super" })).toMatchObject({
        ok: true,
      });
      expect(await createCommentAction({ modelId: m.id, content: "Encore" })).toMatchObject({
        error: { code: "RATE_LIMITED" },
      });
    } finally {
      delete process.env.RATE_LIMIT_COMMENT_PER_HOUR;
      resetEnvCache();
    }
  });

  it("suppression et chargement de la suite", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    const draft = await model(author.id, "DRAFT");
    const writer = await signIn();
    const created = await createComment(prisma, writer, { modelId: m.id, content: "Hop" });
    expect(await deleteCommentAction({})).toMatchObject({ error: { code: "VALIDATION" } });
    expect(await deleteCommentAction({ commentId: created.ok ? created.data.id : "" })).toEqual({
      ok: true,
      data: null,
    });

    expect(await loadCommentsAction({ modelId: m.id })).toMatchObject({
      error: { code: "VALIDATION" },
    });
    expect(await loadCommentsAction({ modelId: draft.id, cursor: "" })).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(await loadCommentsAction({ modelId: m.id, cursor: "" })).toEqual({
      ok: true,
      data: { items: [], nextCursor: null },
    });
  });
});

describe("fiche", () => {
  it("affiche les commentaires d'un modèle publié, pas d'un brouillon", async () => {
    const author = await signIn();
    const reader = await createMember(prisma);
    const m = await model(author.id);
    const draft = await model(author.id, "DRAFT");
    await createComment(prisma, reader, { modelId: m.id, content: "Découpé ce matin, parfait." });

    const page = html(await ModelPage(slugParams(m.slug)));
    expect(page).toContain("1 commentaire");
    expect(page).toContain("Découpé ce matin, parfait.");
    expect(page).toContain(`Supprimer le commentaire de ${reader.pseudo}`);

    const draftPage = html(await ModelPage(slugParams(draft.slug)));
    expect(draftPage).not.toContain("Commentaires");
  });
});
