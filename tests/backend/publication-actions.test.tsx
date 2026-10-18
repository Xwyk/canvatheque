import { createTranslator, NextIntlClientProvider } from "next-intl";
import type * as NextIntl from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/fr.json";

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
  const { default: fr } = await import("@/messages/fr.json");
  return {
    ...actual,
    NextIntlClientProvider: (props: React.ComponentProps<typeof actual.NextIntlClientProvider>) => (
      <actual.NextIntlClientProvider locale="fr" messages={fr} timeZone="Europe/Paris" {...props} />
    ),
  };
});

import EditModelPage, {
  generateMetadata as editMetadata,
} from "@/app/(member)/models/[slug]/edit/page";
import MePage, { generateMetadata as meMetadata } from "@/app/(member)/me/page";
import PublishPage, { generateMetadata as publishMetadata } from "@/app/(member)/publish/page";
import {
  deleteModelAction,
  publishModelAction,
  saveModelAction,
  suggestTagsAction,
  unpublishModelAction,
} from "@/features/models/actions";
import { confirmUploadAction, createUploadAction } from "@/features/uploads/actions";
import type { ConfirmedFile, UploadTicket } from "@/features/uploads/service";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, requestContext } from "@/tests/support/next-request";
import { createCategory, createMember, postFile, SIMPLE_SVG } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

async function signIn(options?: Parameters<typeof createMember>[1]) {
  const member = await createMember(prisma, options);
  const { token } = await createSession(prisma, member.id);
  requestContext.cookies.set("canvatheque.session", { value: token });
  return member;
}

async function uploadDraft(name = "papillon.svg"): Promise<ConfirmedFile> {
  const ticket = await createUploadAction({
    kind: "MODEL",
    fileName: name,
    size: SIMPLE_SVG.length,
    mime: "image/svg+xml",
  });
  if (!ticket.ok) throw new Error(ticket.error.message);
  await postFile(ticket.data as UploadTicket, SIMPLE_SVG);
  const confirmed = await confirmUploadAction({ uploadId: ticket.data.uploadId });
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  return confirmed.data as ConfirmedFile;
}

beforeEach(() => {
  requestContext.reset();
});

describe("actions de publication", () => {
  it("exigent une session, refusent un compte banni et les entrées invalides", async () => {
    for (const action of [
      () => createUploadAction({}),
      () => confirmUploadAction({}),
      () => saveModelAction({}),
      () => publishModelAction({}),
      () => unpublishModelAction({}),
      () => deleteModelAction({}),
      () => suggestTagsAction("pa"),
    ]) {
      expect(await action()).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
    // Compte banni : sa session est refusée (et supprimée) dès la lecture.
    await signIn({ banned: true });
    expect(await createUploadAction({})).toMatchObject({ error: { code: "UNAUTHORIZED" } });

    requestContext.reset();
    await signIn();
    for (const action of [
      () => createUploadAction({ kind: "AUTRE" }),
      () => confirmUploadAction({ uploadId: "" }),
      () => saveModelAction({ modelId: "m" }),
      () => publishModelAction({ modelId: "m", certifyRights: false }),
      () => unpublishModelAction({}),
      () => deleteModelAction({}),
    ]) {
      expect(await action()).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    }
    expect(await suggestTagsAction(42)).toEqual({ ok: true, data: [] });
  });

  it("parcours : envoi, informations, publication avec message, dépublication, suppression", async () => {
    await signIn();
    const category = await createCategory(prisma);
    const draft = await uploadDraft();
    expect(draft).toMatchObject({ created: true, slug: "papillon", format: "SVG" });

    const saved = await saveModelAction({
      modelId: draft.modelId,
      title: "Papillon de nuit",
      description: "",
      categoryId: category.id,
      license: "CC0",
      tags: ["Nuit", "papillon"],
    });
    expect(saved).toMatchObject({ ok: true, data: { tags: ["nuit", "papillon"] } });
    expect(await suggestTagsAction("NU")).toEqual({ ok: true, data: ["nuit"] });

    expect(
      await expectRedirect(() =>
        publishModelAction({ modelId: draft.modelId, certifyRights: true }),
      ),
    ).toBe("/me");
    expect(JSON.parse(requestContext.cookies.get("canvatheque.flash")!.value)).toEqual({
      key: "auth.flash.modelPublished",
    });
    expect((await prisma.model.findUniqueOrThrow({ where: { id: draft.modelId } })).slug).toBe(
      "papillon-de-nuit",
    );

    expect(await unpublishModelAction({ modelId: draft.modelId })).toEqual({
      ok: true,
      data: { slug: "papillon-de-nuit" },
    });
    expect(await deleteModelAction({ modelId: draft.modelId })).toEqual({
      ok: true,
      data: { title: "Papillon de nuit" },
    });
  });

  it("la publication renvoie l'erreur sans rediriger", async () => {
    await signIn({ verified: false });
    const draft = await uploadDraft();
    expect(await publishModelAction({ modelId: draft.modelId, certifyRights: true })).toMatchObject(
      {
        error: { message: "errors.publish.unverified" },
      },
    );
  });

  it("limite les demandes d'envoi par heure", async () => {
    process.env.RATE_LIMIT_UPLOAD_PER_HOUR = "2";
    resetEnvCache();
    try {
      await signIn();
      const ask = () =>
        createUploadAction({ kind: "MODEL", fileName: "a.svg", size: 10, mime: "" });
      expect((await ask()).ok).toBe(true);
      expect((await ask()).ok).toBe(true);
      expect(await ask()).toMatchObject({
        error: { code: "RATE_LIMITED", retryAfter: expect.any(Number) },
      });
    } finally {
      delete process.env.RATE_LIMIT_UPLOAD_PER_HOUR;
      resetEnvCache();
    }
  });

  it("une erreur inattendue de traitement est journalisée et masquée", async () => {
    await signIn();
    const ticket = await createUploadAction({
      kind: "MODEL",
      fileName: "a.svg",
      size: 10,
      mime: "",
    });
    if (!ticket.ok) throw new Error("ticket");
    await postFile(ticket.data, SIMPLE_SVG);
    const spy = vi.spyOn(prisma.model, "create").mockRejectedValueOnce(new Error("panne"));
    try {
      expect(await confirmUploadAction({ uploadId: ticket.data.uploadId })).toEqual({
        ok: false,
        error: { code: "INTERNAL", message: "errors.generic" },
      });
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.upload.findFirstOrThrow()).status).toBe("ABANDONED");
  });
});

describe("pages de publication", () => {
  it("redirigent un visiteur vers la connexion", async () => {
    expect(await expectRedirect(() => PublishPage())).toBe("/login?redirectTo=%2Fpublish");
    expect(await expectRedirect(() => MePage())).toBe("/login?redirectTo=%2Fme");
    expect(
      await expectRedirect(() =>
        EditModelPage({ params: Promise.resolve({ slug: "x" }) } as never),
      ),
    ).toBe("/login?redirectTo=%2Fmodels%2Fx%2Fedit");
  });

  it("/publish et /me pour un membre", async () => {
    const member = await signIn();
    const page = html(await PublishPage());
    expect(page).toContain("Publier un modèle");
    expect(page).toContain(".cwprj ou .svg · 20 Mo maximum");

    let me = html(await MePage());
    expect(me).toContain(`Bonjour ${member.pseudo}`);
    expect(me).toContain("Aucun modèle pour l&#x27;instant");
    await uploadDraft();
    me = html(await MePage());
    expect(me).toContain("1 modèle");
    expect(me).toContain('href="/models/papillon/edit"');

    expect(await publishMetadata()).toMatchObject({ title: "Publier un modèle" });
    expect(await meMetadata()).toMatchObject({ title: "Mon espace" });
    expect(await editMetadata()).toMatchObject({ title: "Modifier le modèle" });
  });

  it("modification : réservée au propriétaire (404 sinon)", async () => {
    await signIn();
    const draft = await uploadDraft();
    const page = html(
      await EditModelPage({ params: Promise.resolve({ slug: draft.slug }) } as never),
    );
    expect(page).toContain("Modifier le modèle");
    expect(page).toContain("papillon.svg");

    requestContext.reset();
    await signIn();
    await expect(
      EditModelPage({ params: Promise.resolve({ slug: draft.slug }) } as never),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("quota atteint affiché sur /publish", async () => {
    process.env.MAX_MODELS_PER_USER = "1";
    resetEnvCache();
    try {
      await signIn();
      await uploadDraft();
      expect(html(await PublishPage())).toContain("nombre maximal de modèles (1)");
    } finally {
      delete process.env.MAX_MODELS_PER_USER;
      resetEnvCache();
    }
  });
});
