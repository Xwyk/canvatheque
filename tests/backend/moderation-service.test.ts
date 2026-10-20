import { beforeEach, describe, expect, it } from "vitest";
import {
  adminDeleteModel,
  ADMIN_PAGE_SIZE,
  banMember,
  countOpenReports,
  dismissReport,
  getAdminDashboard,
  hideModel,
  listAdminActions,
  listAdminModels,
  listMembers,
  listReports,
  promoteMember,
  resolveReport,
  unbanMember,
  unhideModel,
  type AdminDeps,
} from "@/features/admin/service";
import { createReport } from "@/features/reports/service";
import { createSession, resolveSession } from "@/lib/auth/session";
import type { ModelStatus, ReportReason } from "@/lib/generated/prisma/enums";
import { createMemoryMailer } from "@/lib/mail/mailer";
import { listKeys, writeObject } from "@/lib/storage/objects";
import { buckets, s3 } from "@/lib/storage/s3";
import { prisma } from "@/tests/setup/backend";
import { createCategory, createMember } from "@/tests/support/publication";

let mail: ReturnType<typeof createMemoryMailer>;
let deps: AdminDeps;
let counter = 0;

beforeEach(() => {
  mail = createMemoryMailer();
  deps = { prisma, s3: s3(), buckets: buckets(), mailer: mail, appUrl: "http://localhost:3000" };
});

async function model(
  authorId: string,
  { status = "PUBLISHED" as ModelStatus, title = "Papillon ajouré" } = {},
) {
  counter += 1;
  const category = await createCategory(prisma);
  const published = status !== "DRAFT";
  return prisma.model.create({
    data: {
      slug: `modele-${counter}`,
      title,
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId,
      fileKey: published ? `models/mod-${counter}.svg` : null,
      previewKey: published ? `m${counter}/v1` : null,
      previewWidth: 10,
      previewHeight: 10,
      publishedAt: published ? new Date() : null,
    },
  });
}

const admin = () => createMember(prisma, { role: "ADMIN" });

const systemUser = () =>
  prisma.user.create({
    data: {
      pseudo: "Auteur supprimé",
      pseudoSlug: "auteur-supprime",
      email: "auteur-supprime@system.invalid",
      isSystem: true,
      tosAcceptedAt: new Date(),
    },
  });

async function report(modelId: string, reason: ReportReason = "SPAM") {
  const reporter = await createMember(prisma);
  return prisma.report.create({ data: { modelId, reporterId: reporter.id, reason } });
}

describe("createReport", () => {
  it("enregistre le signalement et envoie un accusé de réception", async () => {
    const author = await createMember(prisma);
    const reporter = await createMember(prisma);
    const m = await model(author.id);
    const result = await createReport({ prisma, mailer: mail, appUrl: "http://x" }, reporter, {
      modelId: m.id,
      reason: "DROITS_AUTEUR",
      details: "Copie de mon modèle.",
    });
    expect(result.ok).toBe(true);
    const saved = await prisma.report.findFirstOrThrow({ where: { modelId: m.id } });
    expect(saved).toMatchObject({
      status: "OPEN",
      reason: "DROITS_AUTEUR",
      reporterId: reporter.id,
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe(reporter.email);
    expect(mail.sent[0]!.text).toContain(`http://x/models/${m.slug}`);
  });

  it("un seul signalement ouvert par membre ; possible de nouveau une fois clos", async () => {
    const author = await createMember(prisma);
    const reporter = await createMember(prisma);
    const m = await model(author.id);
    const reportDeps = { prisma, mailer: mail, appUrl: "http://x" };
    const input = { modelId: m.id, reason: "SPAM" as const, details: null };
    expect((await createReport(reportDeps, reporter, input)).ok).toBe(true);
    expect(await createReport(reportDeps, reporter, input)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "errors.report.duplicate" },
    });
    await prisma.report.updateMany({ where: { modelId: m.id }, data: { status: "DISMISSED" } });
    expect((await createReport(reportDeps, reporter, input)).ok).toBe(true);
    await prisma.report.updateMany({
      where: { modelId: m.id, status: "OPEN" },
      data: { status: "DISMISSED" },
    });
    // Deux signalements clos du même membre sur le même modèle : permis.
    expect(await prisma.report.count({ where: { modelId: m.id, status: "DISMISSED" } })).toBe(2);
  });

  it("refuse visiteur, banni, son propre modèle et un modèle non publié", async () => {
    const author = await createMember(prisma);
    const banned = await createMember(prisma, { banned: true });
    const published = await model(author.id);
    const hidden = await model(author.id, { status: "HIDDEN" });
    const reportDeps = { prisma, mailer: mail, appUrl: "http://x" };
    const input = (modelId: string) => ({ modelId, reason: "SPAM" as const, details: null });
    expect(await createReport(reportDeps, null, input(published.id))).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(await createReport(reportDeps, banned, input(published.id))).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(await createReport(reportDeps, author, input(published.id))).toMatchObject({
      error: { code: "FORBIDDEN", message: "errors.report.own" },
    });
    const other = await createMember(prisma);
    expect(await createReport(reportDeps, other, input(hidden.id))).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(mail.sent).toHaveLength(0);
  });
});

describe("modération des modèles", () => {
  it("masquer : statut, raison, signalements clos, journal, e-mail ; puis réafficher", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const m = await model(author.id, { title: "Étoile" });
    await report(m.id);
    await report(m.id, "DROITS_AUTEUR");

    expect(await hideModel(deps, moderator, { modelId: m.id, reason: "Copie avérée" })).toEqual({
      ok: true,
      data: { closedReports: 2 },
    });
    expect(await prisma.model.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
      status: "HIDDEN",
      hiddenReason: "Copie avérée",
    });
    expect(await countOpenReports(prisma)).toBe(0);
    const closed = await prisma.report.findMany({ where: { modelId: m.id } });
    expect(closed.every((r) => r.status === "RESOLVED" && r.resolvedById === moderator.id)).toBe(
      true,
    );
    expect(mail.sent[0]).toMatchObject({ to: author.email });
    expect(mail.sent[0]!.subject).toContain("Étoile");
    expect(mail.sent[0]!.text).toContain("Motif : Copie avérée");

    expect(await hideModel(deps, moderator, { modelId: m.id, reason: "encore" })).toMatchObject({
      error: { code: "CONFLICT", message: "errors.admin.notPublished" },
    });

    expect(
      await unhideModel(deps, moderator, { modelId: m.id, reason: "Licence vérifiée" }),
    ).toEqual({ ok: true, data: null });
    expect(await prisma.model.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
      status: "PUBLISHED",
      hiddenReason: null,
    });
    expect(await unhideModel(deps, moderator, { modelId: m.id, reason: "encore" })).toMatchObject({
      error: { code: "CONFLICT", message: "errors.admin.notHidden" },
    });
    expect(mail.sent).toHaveLength(2);

    const log = await listAdminActions(prisma, { page: 1 });
    expect(log.items.map((a) => [a.type, a.label, a.reason, a.admin.pseudo])).toEqual([
      ["MODEL_UNHIDE", "Étoile", "Licence vérifiée", moderator.pseudo],
      ["MODEL_HIDE", "Étoile", "Copie avérée", moderator.pseudo],
    ]);
  });

  it("supprimer : suppression logique, objets effacés, e-mail ; compte système non prévenu", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const m = await model(author.id);
    await writeObject(s3(), buckets().models, m.fileKey!, "<svg/>", "image/svg+xml");
    await writeObject(s3(), buckets().previews, `${m.id}/v1-sm.webp`, "x", "image/webp");
    await report(m.id);

    expect(await adminDeleteModel(deps, moderator, { modelId: m.id, reason: "Illégal" })).toEqual({
      ok: true,
      data: { title: "Papillon ajouré", closedReports: 1 },
    });
    const row = await prisma.model.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await listKeys(s3(), buckets().models, m.fileKey!)).toEqual([]);
    expect(await listKeys(s3(), buckets().previews, `${m.id}/`)).toEqual([]);
    expect(mail.sent[0]!.text).toContain("Motif : Illégal");
    expect(await adminDeleteModel(deps, moderator, { modelId: m.id, reason: "x" })).toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    const system = await systemUser();
    const orphan = await model(system.id);
    await hideModel(deps, moderator, { modelId: orphan.id, reason: "Spam" });
    expect(mail.sent).toHaveLength(1);
  });

  it("réservé aux administrateurs ; modèle inconnu", async () => {
    const member = await createMember(prisma);
    const moderator = await admin();
    const m = await model(member.id);
    const input = { modelId: m.id, reason: "raison" };
    for (const run of [hideModel, unhideModel, adminDeleteModel]) {
      expect(await run(deps, member, input)).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(await run(deps, moderator, { modelId: "inconnu", reason: "raison" })).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    }
  });
});

describe("traitement des signalements", () => {
  it("masquer ou supprimer depuis un signalement clôt tous ceux du modèle", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const first = await model(author.id);
    const second = await model(author.id);
    const r1 = await report(first.id);
    await report(first.id);
    const r3 = await report(second.id);

    expect(
      await resolveReport(deps, moderator, {
        reportId: r1.id,
        reason: "Spam",
        modelAction: "HIDE",
      }),
    ).toEqual({ ok: true, data: { closedReports: 2 } });
    expect((await prisma.model.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      "HIDDEN",
    );
    expect(
      await resolveReport(deps, moderator, {
        reportId: r3.id,
        reason: "Illégal",
        modelAction: "DELETE",
      }),
    ).toEqual({ ok: true, data: { closedReports: 1 } });
    expect(
      (await prisma.model.findUniqueOrThrow({ where: { id: second.id } })).deletedAt,
    ).not.toBeNull();

    // Déjà traité.
    expect(
      await resolveReport(deps, moderator, { reportId: r1.id, reason: "x2", modelAction: "NONE" }),
    ).toMatchObject({ error: { code: "CONFLICT", message: "errors.admin.reportClosed" } });
  });

  it("marquer traité ou classer sans suite : le modèle n'est pas touché", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const m = await model(author.id);
    const r1 = await report(m.id);
    const r2 = await report(m.id);
    expect(
      await resolveReport(deps, moderator, {
        reportId: r1.id,
        reason: "Fichier corrigé",
        modelAction: "NONE",
      }),
    ).toEqual({ ok: true, data: { closedReports: 1 } });
    expect(
      await dismissReport(deps, moderator, { reportId: r2.id, reason: "Rien à redire" }),
    ).toEqual({ ok: true, data: null });
    expect((await prisma.model.findUniqueOrThrow({ where: { id: m.id } })).status).toBe(
      "PUBLISHED",
    );
    const statuses = await prisma.report.findMany({
      where: { modelId: m.id },
      orderBy: { createdAt: "asc" },
    });
    expect(statuses.map((r) => [r.status, r.resolution])).toEqual([
      ["RESOLVED", "Fichier corrigé"],
      ["DISMISSED", "Rien à redire"],
    ]);
    const log = await listAdminActions(prisma, { page: 1 });
    expect(log.items.map((a) => a.type)).toEqual(["REPORT_DISMISS", "REPORT_RESOLVE"]);
    expect(log.items[0]!.targetType).toBe("Report");

    expect(
      await dismissReport(deps, moderator, { reportId: "inconnu", reason: "x" }),
    ).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(await dismissReport(deps, author, { reportId: r2.id, reason: "x" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(
      await resolveReport(deps, author, { reportId: r2.id, reason: "x", modelAction: "NONE" }),
    ).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(
      await resolveReport(deps, moderator, {
        reportId: "inconnu",
        reason: "x",
        modelAction: "NONE",
      }),
    ).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("propage l'échec de l'action sur le modèle", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const m = await model(author.id, { status: "HIDDEN" });
    const r = await report(m.id);
    expect(
      await resolveReport(deps, moderator, { reportId: r.id, reason: "x", modelAction: "HIDE" }),
    ).toMatchObject({ error: { code: "CONFLICT" } });
    await prisma.model.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
    expect(
      await resolveReport(deps, moderator, { reportId: r.id, reason: "x", modelAction: "DELETE" }),
    ).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("membres", () => {
  it("bannir : sessions révoquées, modèles masqués sur demande, e-mail ; puis lever", async () => {
    const moderator = await admin();
    const member = await createMember(prisma);
    const first = await model(member.id, { title: "Premier" });
    await model(member.id, { title: "Second" });
    await model(member.id, { status: "DRAFT" });
    await report(first.id);
    const { token } = await createSession(prisma, member.id);

    const result = await banMember(deps, moderator, {
      userId: member.id,
      reason: "Spam répété",
      hideModels: true,
    });
    expect(result).toEqual({ ok: true, data: { revokedSessions: 1, hiddenModels: 2 } });
    expect(await resolveSession(prisma, token)).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(user.bannedReason).toBe("Spam répété");
    expect(await prisma.model.count({ where: { authorId: member.id, status: "HIDDEN" } })).toBe(2);
    expect(await countOpenReports(prisma)).toBe(0);
    expect(mail.sent.map((m) => m.to)).toEqual([member.email]);
    expect(mail.sent[0]!.text).toContain("Motif : Spam répété");
    const log = await listAdminActions(prisma, { page: 1 });
    expect(log.items.map((a) => a.type).sort()).toEqual(["MODEL_HIDE", "MODEL_HIDE", "USER_BAN"]);
    expect(log.items.find((a) => a.type === "USER_BAN")!.label).toBe(member.pseudo);

    expect(
      await banMember(deps, moderator, { userId: member.id, reason: "x2", hideModels: false }),
    ).toMatchObject({ error: { code: "CONFLICT", message: "errors.admin.alreadyBanned" } });
    expect(await promoteMember(deps, moderator, { userId: member.id, reason: "x2" })).toMatchObject(
      { error: { code: "CONFLICT", message: "errors.admin.promoteBanned" } },
    );

    expect(await unbanMember(deps, moderator, { userId: member.id, reason: "Erreur" })).toEqual({
      ok: true,
      data: null,
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).bannedAt).toBeNull();
    expect(mail.sent[1]!.text).toContain("http://localhost:3000/login");
    // Les modèles masqués le restent.
    expect(await prisma.model.count({ where: { authorId: member.id, status: "HIDDEN" } })).toBe(2);
    expect(await unbanMember(deps, moderator, { userId: member.id, reason: "x2" })).toMatchObject({
      error: { code: "CONFLICT", message: "errors.admin.notBanned" },
    });
  });

  it("bannir sans masquer ses modèles", async () => {
    const moderator = await admin();
    const member = await createMember(prisma);
    await model(member.id);
    expect(
      await banMember(deps, moderator, { userId: member.id, reason: "Abus", hideModels: false }),
    ).toEqual({ ok: true, data: { revokedSessions: 0, hiddenModels: 0 } });
    expect(await prisma.model.count({ where: { status: "PUBLISHED" } })).toBe(1);
  });

  it("garde-fous : soi-même, administrateur, compte système, inconnu, membre", async () => {
    const moderator = await admin();
    const other = await admin();
    const member = await createMember(prisma);
    const system = await systemUser();
    const ban = (userId: string) =>
      banMember(deps, moderator, { userId, reason: "x", hideModels: false });
    expect(await ban(moderator.id)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await ban(other.id)).toMatchObject({
      error: { code: "FORBIDDEN", message: "errors.admin.banAdmin" },
    });
    expect(await ban(system.id)).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(await ban("inconnu")).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(
      await banMember(deps, member, { userId: other.id, reason: "x", hideModels: false }),
    ).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await unbanMember(deps, moderator, { userId: system.id, reason: "x" })).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(await unbanMember(deps, member, { userId: other.id, reason: "x" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(await promoteMember(deps, moderator, { userId: system.id, reason: "x" })).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    expect(await promoteMember(deps, moderator, { userId: other.id, reason: "x" })).toMatchObject({
      error: { code: "CONFLICT", message: "errors.admin.alreadyAdmin" },
    });
    expect(await promoteMember(deps, member, { userId: member.id, reason: "x" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("promouvoir administrateur", async () => {
    const moderator = await admin();
    const member = await createMember(prisma);
    expect(
      await promoteMember(deps, moderator, { userId: member.id, reason: "Modératrice" }),
    ).toEqual({ ok: true, data: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("ADMIN");
    expect((await listAdminActions(prisma, { type: "USER_PROMOTE", page: 1 })).items).toHaveLength(
      1,
    );
  });
});

describe("listes et tableau de bord", () => {
  it("signalements ouverts (plus anciens d'abord) et traités, avec le décompte par modèle", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    const m = await model(author.id, { title: "Signalé" });
    const r1 = await report(m.id);
    await report(m.id, "AUTRE");
    const open = await listReports(prisma, { tab: "open", page: 1 });
    expect(open.items.map((r) => r.id)[0]).toBe(r1.id);
    expect(open.items[0]!.model).toMatchObject({
      title: "Signalé",
      openReports: 2,
      deleted: false,
      author: { pseudo: author.pseudo },
    });
    expect(open.items[0]!.model.preview?.sm).toContain(`${m.previewKey}-sm.webp`);
    await dismissReport(deps, moderator, { reportId: r1.id, reason: "Non fondé" });
    const closed = await listReports(prisma, { tab: "closed", page: 1 });
    expect(closed.items).toHaveLength(1);
    expect(closed.items[0]).toMatchObject({
      status: "DISMISSED",
      resolution: "Non fondé",
      resolvedBy: { pseudo: moderator.pseudo },
    });
  });

  it("membres : recherche pseudo ou e-mail, filtres, compte système exclu, pagination", async () => {
    const moderator = await admin();
    const banned = await createMember(prisma, { banned: true });
    await model(banned.id);
    await systemUser();
    const all = await listMembers(prisma, { q: "", filter: "all", page: 1 });
    expect(all.items).toHaveLength(2);
    expect(all.hasNext).toBe(false);
    expect((await listMembers(prisma, { q: "", filter: "banned", page: 1 })).items).toEqual([
      expect.objectContaining({ id: banned.id, models: 1, emailVerified: true }),
    ]);
    expect(
      (await listMembers(prisma, { q: "", filter: "admins", page: 1 })).items.map((u) => u.id),
    ).toEqual([moderator.id]);
    expect(
      (await listMembers(prisma, { q: banned.email.toUpperCase(), filter: "all", page: 1 })).items,
    ).toHaveLength(1);

    for (let i = 0; i < ADMIN_PAGE_SIZE; i += 1) await createMember(prisma);
    const first = await listMembers(prisma, { q: "", filter: "all", page: 1 });
    expect(first.items).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.hasNext).toBe(true);
    const second = await listMembers(prisma, { q: "", filter: "all", page: 2 });
    expect(second).toMatchObject({ page: 2, hasNext: false });
    expect(second.items).toHaveLength(2);
  });

  it("modèles : recherche titre ou auteur, filtre d'état, supprimés exclus", async () => {
    const author = await createMember(prisma);
    const hidden = await model(author.id, { status: "HIDDEN", title: "Masqué" });
    await model(author.id, { title: "Lapin" });
    const gone = await model(author.id, { title: "Lapin supprimé" });
    await prisma.model.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await report(hidden.id);

    expect((await listAdminModels(prisma, { q: "", status: "all", page: 1 })).items).toHaveLength(
      2,
    );
    expect((await listAdminModels(prisma, { q: "", status: "HIDDEN", page: 1 })).items).toEqual([
      expect.objectContaining({ id: hidden.id, openReports: 1 }),
    ]);
    expect(
      (await listAdminModels(prisma, { q: "lapin", status: "all", page: 1 })).items.map(
        (m) => m.title,
      ),
    ).toEqual(["Lapin"]);
    expect(
      (await listAdminModels(prisma, { q: author.pseudo, status: "all", page: 1 })).items,
    ).toHaveLength(2);
  });

  it("tableau de bord : compteurs, signalements, dernières actions", async () => {
    const moderator = await admin();
    const author = await createMember(prisma);
    await createMember(prisma, { banned: true });
    const m = await model(author.id);
    await model(author.id, { status: "HIDDEN" });
    await report(m.id);
    await prisma.adminAction.create({
      data: {
        adminId: moderator.id,
        type: "USER_BAN",
        targetType: "User",
        targetId: "x",
        details: [],
      },
    });
    const dashboard = await getAdminDashboard(prisma);
    expect(dashboard.counts).toEqual({
      openReports: 1,
      members: 4,
      bannedMembers: 1,
      publishedModels: 1,
      hiddenModels: 1,
    });
    expect(dashboard.reports).toHaveLength(1);
    // Détails sans raison ni libellé (forme inattendue) : champs vides.
    expect(dashboard.actions[0]).toMatchObject({ type: "USER_BAN", reason: null, label: null });
  });
});
