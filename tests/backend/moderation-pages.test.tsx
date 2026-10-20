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

import AdminDashboardPage, { generateMetadata as dashboardMeta } from "@/app/(admin)/admin/page";
import AdminLogPage, { generateMetadata as logMeta } from "@/app/(admin)/admin/log/page";
import AdminMembersPage, {
  generateMetadata as membersMeta,
} from "@/app/(admin)/admin/members/page";
import AdminModelsPage, { generateMetadata as modelsMeta } from "@/app/(admin)/admin/models/page";
import AdminReportsPage, {
  generateMetadata as reportsMeta,
} from "@/app/(admin)/admin/reports/page";
import {
  adminDeleteModelAction,
  banMemberAction,
  dismissReportAction,
  hideModelAction,
  promoteMemberAction,
  resolveReportAction,
  unbanMemberAction,
  unhideModelAction,
} from "@/features/admin/actions";
import { firstValues } from "@/features/admin/schemas";
import { createReportAction } from "@/features/reports/actions";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { createMemoryMailer, setMailerForTests } from "@/lib/mail/mailer";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );

let counter = 0;
let mail: ReturnType<typeof createMemoryMailer>;

beforeEach(() => {
  requestContext.reset();
  mail = createMemoryMailer();
  setMailerForTests(mail);
});

async function model(authorId: string, status: ModelStatus = "PUBLISHED", title = "Papillon") {
  counter += 1;
  const category = await createCategory(prisma);
  return prisma.model.create({
    data: {
      slug: `page-${counter}`,
      title,
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId,
      fileKey: `models/page-${counter}.svg`,
      previewKey: `p${counter}/v`,
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

const params = (values: Record<string, string> = {}) => ({ searchParams: Promise.resolve(values) });

describe("createReportAction", () => {
  it("visiteur, validation, succès, limite quotidienne", async () => {
    const author = await createMember(prisma);
    const m = await model(author.id);
    expect(await createReportAction({ modelId: m.id, reason: "SPAM" })).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    process.env.RATE_LIMIT_REPORT_PER_DAY = "1";
    resetEnvCache();
    try {
      await signIn();
      expect(await createReportAction({ modelId: m.id, reason: "AUTRE" })).toMatchObject({
        error: { code: "VALIDATION", fields: { details: "reportDetailsRequired" } },
      });
      expect(await createReportAction({ modelId: m.id, reason: "SPAM" })).toMatchObject({
        ok: true,
      });
      expect(mail.sent).toHaveLength(1);
      expect(await createReportAction({ modelId: m.id, reason: "SPAM" })).toMatchObject({
        error: { code: "RATE_LIMITED" },
      });
    } finally {
      delete process.env.RATE_LIMIT_REPORT_PER_DAY;
      resetEnvCache();
    }
  });
});

describe("actions d'administration", () => {
  it("visiteur et membre refusés, entrée validée", async () => {
    expect(await hideModelAction({ modelId: "m", reason: "raison" })).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    await signIn();
    expect(await hideModelAction({ modelId: "m", reason: "raison" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    requestContext.reset();
    await signIn({ role: "ADMIN" });
    expect(await hideModelAction({ modelId: "m", reason: " a " })).toMatchObject({
      error: { code: "VALIDATION", fields: { reason: "reasonLength" } },
    });
    expect(await banMemberAction({ userId: "u", reason: "x".repeat(501) })).toMatchObject({
      error: { code: "VALIDATION" },
    });
  });

  it("chaque action délègue au service", async () => {
    await signIn({ role: "ADMIN" });
    const author = await createMember(prisma);
    const m = await model(author.id);
    const reason = "Raison valable";

    expect(await hideModelAction({ modelId: m.id, reason })).toMatchObject({ ok: true });
    expect(await unhideModelAction({ modelId: m.id, reason })).toMatchObject({ ok: true });

    const reporter = await createMember(prisma);
    const r1 = await prisma.report.create({
      data: { modelId: m.id, reporterId: reporter.id, reason: "SPAM" },
    });
    expect(await dismissReportAction({ reportId: r1.id, reason })).toMatchObject({ ok: true });
    const r2 = await prisma.report.create({
      data: { modelId: m.id, reporterId: reporter.id, reason: "SPAM" },
    });
    expect(
      await resolveReportAction({ reportId: r2.id, reason, modelAction: "NONE" }),
    ).toMatchObject({ ok: true });
    expect(await adminDeleteModelAction({ modelId: m.id, reason })).toMatchObject({ ok: true });

    expect(await banMemberAction({ userId: author.id, reason })).toMatchObject({
      ok: true,
      data: { hiddenModels: 0 },
    });
    expect(await unbanMemberAction({ userId: author.id, reason })).toMatchObject({ ok: true });
    expect(await promoteMemberAction({ userId: author.id, reason })).toMatchObject({ ok: true });
    expect(await prisma.adminAction.count()).toBe(8);
  });
});

describe("pages d'administration", () => {
  const pages = [
    ["/admin", () => AdminDashboardPage()],
    ["/admin/reports", () => AdminReportsPage(params())],
    ["/admin/members", () => AdminMembersPage(params())],
    ["/admin/models", () => AdminModelsPage(params())],
    ["/admin/log", () => AdminLogPage(params())],
  ] as const;

  it("visiteur : connexion ; membre : 404", async () => {
    for (const [path, render] of pages) {
      expect(await expectRedirect(render)).toBe(`/login?redirectTo=${encodeURIComponent(path)}`);
    }
    await signIn();
    for (const [, render] of pages) {
      await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });

  it("tableau de bord, signalements, membres, modèles et journal", async () => {
    const admin = await signIn({ role: "ADMIN" });
    const author = await createMember(prisma);
    const banned = await createMember(prisma, { banned: true });
    await prisma.user.update({ where: { id: banned.id }, data: { bannedReason: "Spam" } });
    const m = await model(author.id, "PUBLISHED", "Papillon signalé");
    await model(author.id, "HIDDEN", "Lapin masqué");
    const reporter = await createMember(prisma);
    await prisma.report.create({
      data: { modelId: m.id, reporterId: reporter.id, reason: "SPAM", details: "Publicité" },
    });

    const dashboard = html(await AdminDashboardPage());
    expect(dashboard).toContain("Signalements (1)");
    expect(dashboard).toContain("1 signalement ouvert");
    expect(dashboard).toContain("Papillon signalé");
    expect(dashboard).toContain("Aucune action pour l&#x27;instant.");

    const reports = html(await AdminReportsPage(params()));
    expect(reports).toContain("Publicité");
    expect(reports).toContain("Masquer le modèle");
    const closed = html(await AdminReportsPage(params({ tab: "closed" })));
    expect(closed).toContain("Aucun signalement traité pour l&#x27;instant.");

    const members = html(await AdminMembersPage(params()));
    expect(members).toContain(author.email);
    expect(members).toContain("Banni : Spam");
    expect(members).toContain("Lever le bannissement");
    expect(members).toContain(">Vous<");
    const searched = html(await AdminMembersPage(params({ q: "introuvable", filter: "banned" })));
    expect(searched).toContain("Aucun membre ne correspond.");
    expect(searched).toContain('name="filter" value="banned"');

    const models = html(await AdminModelsPage(params()));
    expect(models).toContain("Lapin masqué");
    expect(models).toContain("Réafficher");
    expect(models).toContain("1 ouvert");
    const hidden = html(await AdminModelsPage(params({ status: "HIDDEN", q: "zzz" })));
    expect(hidden).toContain("Aucun modèle ne correspond.");

    await prisma.adminAction.create({
      data: {
        adminId: admin.id,
        type: "USER_BAN",
        targetType: "User",
        targetId: banned.id,
        details: { reason: "Spam", label: banned.pseudo },
      },
    });
    const log = html(await AdminLogPage(params({ type: "USER_BAN" })));
    expect(log).toContain(`Membre banni · « ${banned.pseudo} »`);
    const empty = html(await AdminLogPage(params({ type: "MODEL_HIDE", page: "2" })));
    expect(empty).toContain("Aucune action enregistrée.");
    expect(empty).toContain("Page précédente");
  });

  it("métadonnées : non indexées", async () => {
    for (const meta of [dashboardMeta, reportsMeta, membersMeta, modelsMeta, logMeta]) {
      expect(await meta()).toMatchObject({ robots: { index: false } });
    }
    expect((await reportsMeta()).title).toBe("Signalements · Administration");
  });

  it("paramètres d'URL : première valeur", () => {
    expect(firstValues({ a: ["1", "2"], b: "3", c: undefined })).toEqual({
      a: "1",
      b: "3",
      c: undefined,
    });
  });
});
