import type { S3Client } from "@aws-sdk/client-s3";
import type { ModelAction } from "@/features/admin/schemas";
import { banUser, unbanUser } from "@/features/auth/service";
import { purgeModelObjects } from "@/features/models/service";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  AdminActionType,
  ModelFormat,
  ModelStatus,
  ReportReason,
  ReportStatus,
  Role,
} from "@/lib/generated/prisma/enums";
import { logger } from "@/lib/logger";
import type { Mailer } from "@/lib/mail/mailer";
import {
  accountBannedNotice,
  accountRestoredNotice,
  modelHiddenNotice,
  modelRemovedNotice,
  modelRestoredNotice,
} from "@/lib/mail/templates";
import { can, type Action, type Actor } from "@/lib/permissions";
import { fail, ok, type Failure, type Result } from "@/lib/result";
import { previewInfo, type PreviewInfo } from "@/lib/storage/previews";

/**
 * Modération et administration (étape 5), indépendantes de Next.js : base, stockage,
 * e-mails et horloge injectés. Chaque action exige une raison, est journalisée
 * (`AdminAction`, avec un libellé lisible même si la cible disparaît) et prévient le membre
 * concerné par e-mail (sauf le compte système).
 */

export type AdminDeps = {
  prisma: PrismaClient;
  s3: S3Client;
  buckets: { models: string; previews: string };
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
};

export type AdminActor = NonNullable<Actor> & { pseudo: string };

export const ADMIN_PAGE_SIZE = 30;

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();
const link = (deps: AdminDeps, path: string) => new URL(path, deps.appUrl).toString();

function denied(actor: AdminActor, action: Action, targetUserId?: string): Failure | null {
  return can(actor, action, { targetUserId }) ? null : fail("FORBIDDEN", "errors.forbidden");
}

type JournalEntry = {
  type: AdminActionType;
  targetType: "Model" | "User" | "Report";
  targetId: string;
  reason: string;
  label: string;
  extra?: Record<string, string | number>;
};

const journal = (adminId: string, entry: JournalEntry): Prisma.AdminActionCreateManyInput => ({
  adminId,
  type: entry.type,
  targetType: entry.targetType,
  targetId: entry.targetId,
  details: { reason: entry.reason, label: entry.label, ...entry.extra },
});

/** Clôt les signalements ouverts d'un modèle (action prise sur le modèle). */
const closeOpenReports = (
  deps: AdminDeps,
  admin: AdminActor,
  modelId: string,
  resolution: string,
) =>
  deps.prisma.report.updateMany({
    where: { modelId, status: "OPEN" },
    data: {
      status: "RESOLVED",
      resolvedById: admin.id,
      resolvedAt: clock(deps),
      resolution,
    },
  });

const MODEL_TARGET = {
  id: true,
  slug: true,
  title: true,
  status: true,
  fileKey: true,
  author: { select: { email: true, pseudo: true, isSystem: true } },
} as const;

async function findModel(deps: AdminDeps, modelId: string) {
  return deps.prisma.model.findFirst({
    where: { id: modelId, deletedAt: null },
    select: MODEL_TARGET,
  });
}

async function notifyAuthor(
  deps: AdminDeps,
  author: { email: string; pseudo: string; isSystem: boolean },
  message: (recipient: { to: string; pseudo: string }) => Parameters<Mailer["send"]>[0],
) {
  if (author.isSystem) return;
  await deps.mailer.send(message({ to: author.email, pseudo: author.pseudo }));
}

// --- Modèles -------------------------------------------------------------------------------

/** Masque un modèle publié : retiré du catalogue, signalements ouverts clos, auteur prévenu. */
export async function hideModel(
  deps: AdminDeps,
  admin: AdminActor,
  input: { modelId: string; reason: string },
): Promise<Result<{ closedReports: number }>> {
  const forbidden = denied(admin, "model:hide");
  if (forbidden) return forbidden;
  const model = await findModel(deps, input.modelId);
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  if (model.status !== "PUBLISHED") return fail("CONFLICT", "errors.admin.notPublished");

  const [, closed] = await deps.prisma.$transaction([
    deps.prisma.model.update({
      where: { id: model.id },
      data: { status: "HIDDEN", hiddenReason: input.reason },
    }),
    closeOpenReports(deps, admin, model.id, input.reason),
    deps.prisma.adminAction.create({
      data: journal(admin.id, {
        type: "MODEL_HIDE",
        targetType: "Model",
        targetId: model.id,
        reason: input.reason,
        label: model.title,
      }),
    }),
  ]);
  await notifyAuthor(deps, model.author, (to) =>
    modelHiddenNotice(
      to,
      { title: model.title, url: link(deps, `/models/${model.slug}`) },
      input.reason,
    ),
  );
  logger.info({ event: "model_hidden", modelId: model.id }, "Modèle masqué");
  return ok({ closedReports: closed.count });
}

/** Réaffiche un modèle masqué (redevient publié). */
export async function unhideModel(
  deps: AdminDeps,
  admin: AdminActor,
  input: { modelId: string; reason: string },
): Promise<Result<null>> {
  const forbidden = denied(admin, "model:hide");
  if (forbidden) return forbidden;
  const model = await findModel(deps, input.modelId);
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  if (model.status !== "HIDDEN") return fail("CONFLICT", "errors.admin.notHidden");

  await deps.prisma.$transaction([
    deps.prisma.model.update({
      where: { id: model.id },
      data: { status: "PUBLISHED", hiddenReason: null },
    }),
    deps.prisma.adminAction.create({
      data: journal(admin.id, {
        type: "MODEL_UNHIDE",
        targetType: "Model",
        targetId: model.id,
        reason: input.reason,
        label: model.title,
      }),
    }),
  ]);
  await notifyAuthor(deps, model.author, (to) =>
    modelRestoredNotice(to, { title: model.title, url: link(deps, `/models/${model.slug}`) }),
  );
  return ok(null);
}

/** Suppression par la modération : suppression logique, objets MinIO effacés, auteur prévenu. */
export async function adminDeleteModel(
  deps: AdminDeps,
  admin: AdminActor,
  input: { modelId: string; reason: string },
): Promise<Result<{ title: string; closedReports: number }>> {
  const forbidden = denied(admin, "model:hide");
  if (forbidden) return forbidden;
  const model = await findModel(deps, input.modelId);
  if (!model) return fail("NOT_FOUND", "errors.notFound");

  const pending = await deps.prisma.upload.findMany({
    where: { modelId: model.id, status: "PENDING" },
    select: { kind: true, key: true },
  });
  const [, , closed] = await deps.prisma.$transaction([
    deps.prisma.model.update({ where: { id: model.id }, data: { deletedAt: clock(deps) } }),
    deps.prisma.upload.updateMany({
      where: { modelId: model.id, status: "PENDING" },
      data: { status: "ABANDONED" },
    }),
    closeOpenReports(deps, admin, model.id, input.reason),
    deps.prisma.adminAction.create({
      data: journal(admin.id, {
        type: "MODEL_DELETE",
        targetType: "Model",
        targetId: model.id,
        reason: input.reason,
        label: model.title,
      }),
    }),
  ]);
  await purgeModelObjects(deps, model, pending);
  await notifyAuthor(deps, model.author, (to) => modelRemovedNotice(to, model.title, input.reason));
  logger.info({ event: "model_deleted_by_admin", modelId: model.id }, "Modèle supprimé");
  return ok({ title: model.title, closedReports: closed.count });
}

// --- Signalements --------------------------------------------------------------------------

async function findOpenReport(deps: AdminDeps, reportId: string) {
  const report = await deps.prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, modelId: true, model: { select: { title: true } } },
  });
  if (!report) return fail("NOT_FOUND", "errors.admin.reportNotFound");
  if (report.status !== "OPEN") return fail("CONFLICT", "errors.admin.reportClosed");
  return ok(report);
}

/**
 * Traite un signalement : masquer ou supprimer le modèle (tous ses signalements ouverts sont
 * alors clos), ou le marquer traité sans toucher au modèle (déjà corrigé ou déjà masqué).
 */
export async function resolveReport(
  deps: AdminDeps,
  admin: AdminActor,
  input: { reportId: string; reason: string; modelAction: ModelAction },
): Promise<Result<{ closedReports: number }>> {
  const forbidden = denied(admin, "report:resolve");
  if (forbidden) return forbidden;
  const found = await findOpenReport(deps, input.reportId);
  if (!found.ok) return found;
  const report = found.data;

  if (input.modelAction === "HIDE") {
    return hideModel(deps, admin, { modelId: report.modelId, reason: input.reason });
  }
  if (input.modelAction === "DELETE") {
    const deleted = await adminDeleteModel(deps, admin, {
      modelId: report.modelId,
      reason: input.reason,
    });
    return deleted.ok ? ok({ closedReports: deleted.data.closedReports }) : deleted;
  }
  await closeReport(deps, admin, report, "RESOLVED", input.reason);
  return ok({ closedReports: 1 });
}

/** Classe un signalement sans suite. */
export async function dismissReport(
  deps: AdminDeps,
  admin: AdminActor,
  input: { reportId: string; reason: string },
): Promise<Result<null>> {
  const forbidden = denied(admin, "report:resolve");
  if (forbidden) return forbidden;
  const found = await findOpenReport(deps, input.reportId);
  if (!found.ok) return found;
  await closeReport(deps, admin, found.data, "DISMISSED", input.reason);
  return ok(null);
}

async function closeReport(
  deps: AdminDeps,
  admin: AdminActor,
  report: { id: string; model: { title: string } },
  status: Exclude<ReportStatus, "OPEN">,
  reason: string,
) {
  await deps.prisma.$transaction([
    deps.prisma.report.update({
      where: { id: report.id },
      data: { status, resolvedById: admin.id, resolvedAt: clock(deps), resolution: reason },
    }),
    deps.prisma.adminAction.create({
      data: journal(admin.id, {
        type: status === "RESOLVED" ? "REPORT_RESOLVE" : "REPORT_DISMISS",
        targetType: "Report",
        targetId: report.id,
        reason,
        label: report.model.title,
      }),
    }),
  ]);
}

// --- Membres -------------------------------------------------------------------------------

async function findMember(deps: AdminDeps, userId: string) {
  return deps.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pseudo: true, email: true, role: true, isSystem: true, bannedAt: true },
  });
}

const authDeps = (deps: AdminDeps) => ({
  prisma: deps.prisma,
  mailer: deps.mailer,
  appUrl: deps.appUrl,
  now: deps.now,
});

/**
 * Bannit un membre : sessions révoquées, e-mail ; ses modèles publiés peuvent être masqués
 * dans la foulée. Un administrateur ne peut pas être banni (ni se bannir).
 */
export async function banMember(
  deps: AdminDeps,
  admin: AdminActor,
  input: { userId: string; reason: string; hideModels: boolean },
): Promise<Result<{ revokedSessions: number; hiddenModels: number }>> {
  const forbidden = denied(admin, "user:ban", input.userId);
  if (forbidden) return forbidden;
  const target = await findMember(deps, input.userId);
  if (!target || target.isSystem) return fail("NOT_FOUND", "errors.admin.memberNotFound");
  if (target.role === "ADMIN") return fail("FORBIDDEN", "errors.admin.banAdmin");
  if (target.bannedAt) return fail("CONFLICT", "errors.admin.alreadyBanned");

  const banned = await banUser(authDeps(deps), admin.id, target.id, input.reason);
  if (!banned.ok) return banned;

  let hiddenModels = 0;
  if (input.hideModels) {
    const models = await deps.prisma.model.findMany({
      where: { authorId: target.id, status: "PUBLISHED", deletedAt: null },
      select: { id: true, title: true },
    });
    if (models.length > 0) {
      const ids = models.map((model) => model.id);
      await deps.prisma.$transaction([
        deps.prisma.model.updateMany({
          where: { id: { in: ids } },
          data: { status: "HIDDEN", hiddenReason: input.reason },
        }),
        deps.prisma.report.updateMany({
          where: { modelId: { in: ids }, status: "OPEN" },
          data: {
            status: "RESOLVED",
            resolvedById: admin.id,
            resolvedAt: clock(deps),
            resolution: input.reason,
          },
        }),
        deps.prisma.adminAction.createMany({
          data: models.map((model) =>
            journal(admin.id, {
              type: "MODEL_HIDE",
              targetType: "Model",
              targetId: model.id,
              reason: input.reason,
              label: model.title,
            }),
          ),
        }),
      ]);
    }
    hiddenModels = models.length;
  }

  await deps.mailer.send(
    accountBannedNotice({ to: target.email, pseudo: target.pseudo }, input.reason),
  );
  logger.info({ event: "member_banned", userId: target.id }, "Membre banni");
  return ok({ revokedSessions: banned.data.revokedSessions, hiddenModels });
}

/** Lève le bannissement (les modèles masqués le restent : à réafficher un par un). */
export async function unbanMember(
  deps: AdminDeps,
  admin: AdminActor,
  input: { userId: string; reason: string },
): Promise<Result<null>> {
  const forbidden = denied(admin, "user:ban", input.userId);
  if (forbidden) return forbidden;
  const target = await findMember(deps, input.userId);
  if (!target || target.isSystem) return fail("NOT_FOUND", "errors.admin.memberNotFound");
  if (!target.bannedAt) return fail("CONFLICT", "errors.admin.notBanned");
  const result = await unbanUser(authDeps(deps), admin.id, target.id, input.reason);
  if (!result.ok) return result;
  await deps.mailer.send(
    accountRestoredNotice({ to: target.email, pseudo: target.pseudo }, link(deps, "/login")),
  );
  return ok(null);
}

/** Donne le rôle d'administrateur à un membre actif. */
export async function promoteMember(
  deps: AdminDeps,
  admin: AdminActor,
  input: { userId: string; reason: string },
): Promise<Result<null>> {
  const forbidden = denied(admin, "user:promote", input.userId);
  if (forbidden) return forbidden;
  const target = await findMember(deps, input.userId);
  if (!target || target.isSystem) return fail("NOT_FOUND", "errors.admin.memberNotFound");
  if (target.role === "ADMIN") return fail("CONFLICT", "errors.admin.alreadyAdmin");
  if (target.bannedAt) return fail("CONFLICT", "errors.admin.promoteBanned");

  await deps.prisma.$transaction([
    deps.prisma.user.update({ where: { id: target.id }, data: { role: "ADMIN" } }),
    deps.prisma.adminAction.create({
      data: journal(admin.id, {
        type: "USER_PROMOTE",
        targetType: "User",
        targetId: target.id,
        reason: input.reason,
        label: target.pseudo,
      }),
    }),
  ]);
  logger.info({ event: "member_promoted", userId: target.id }, "Membre promu administrateur");
  return ok(null);
}

// --- Lectures ------------------------------------------------------------------------------

export type Page<T> = { items: T[]; page: number; hasNext: boolean };

function paginate<T>(rows: T[], page: number): Page<T> {
  return { items: rows.slice(0, ADMIN_PAGE_SIZE), page, hasNext: rows.length > ADMIN_PAGE_SIZE };
}

const pageWindow = (page: number) => ({
  skip: (page - 1) * ADMIN_PAGE_SIZE,
  take: ADMIN_PAGE_SIZE + 1,
});

export type ReportView = {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  reporter: { pseudo: string };
  resolvedBy: { pseudo: string } | null;
  model: {
    id: string;
    slug: string;
    title: string;
    status: ModelStatus;
    format: ModelFormat;
    deleted: boolean;
    preview: PreviewInfo | null;
    author: { pseudo: string; pseudoSlug: string };
    /** Signalements ouverts sur ce modèle (celui-ci compris). */
    openReports: number;
  };
};

const REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolution: true,
  reporter: { select: { pseudo: true } },
  resolvedBy: { select: { pseudo: true } },
  model: {
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      format: true,
      deletedAt: true,
      previewKey: true,
      previewWidth: true,
      previewHeight: true,
      author: { select: { pseudo: true, pseudoSlug: true } },
      _count: { select: { reports: { where: { status: "OPEN" } } } },
    },
  },
} as const satisfies Prisma.ReportSelect;

type ReportRow = Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>;

function toReportView({ model, ...report }: ReportRow): ReportView {
  return {
    ...report,
    model: {
      id: model.id,
      slug: model.slug,
      title: model.title,
      status: model.status,
      format: model.format,
      deleted: model.deletedAt !== null,
      preview: previewInfo(model),
      author: model.author,
      openReports: model._count.reports,
    },
  };
}

/** File des signalements : ouverts (plus anciens d'abord) ou traités (plus récents d'abord). */
export async function listReports(
  prisma: PrismaClient,
  { tab, page }: { tab: "open" | "closed"; page: number },
): Promise<Page<ReportView>> {
  const open = tab === "open";
  const rows = await prisma.report.findMany({
    where: open ? { status: "OPEN" } : { status: { not: "OPEN" } },
    orderBy: open
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ resolvedAt: "desc" }, { id: "desc" }],
    select: REPORT_SELECT,
    ...pageWindow(page),
  });
  return paginate(rows.map(toReportView), page);
}

export type MemberView = {
  id: string;
  pseudo: string;
  pseudoSlug: string;
  email: string;
  role: Role;
  createdAt: Date;
  emailVerified: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  models: number;
};

export async function listMembers(
  prisma: PrismaClient,
  { q, filter, page }: { q: string; filter: "all" | "banned" | "admins"; page: number },
): Promise<Page<MemberView>> {
  const where: Prisma.UserWhereInput = {
    isSystem: false,
    ...(filter === "banned" ? { bannedAt: { not: null } } : {}),
    ...(filter === "admins" ? { role: "ADMIN" } : {}),
    ...(q
      ? {
          OR: [
            { pseudo: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      pseudo: true,
      pseudoSlug: true,
      email: true,
      role: true,
      createdAt: true,
      emailVerifiedAt: true,
      bannedAt: true,
      bannedReason: true,
      _count: { select: { models: { where: { deletedAt: null } } } },
    },
    ...pageWindow(page),
  });
  return paginate(
    rows.map(({ emailVerifiedAt, _count, ...user }) => ({
      ...user,
      emailVerified: emailVerifiedAt !== null,
      models: _count.models,
    })),
    page,
  );
}

export type AdminModelView = {
  id: string;
  slug: string;
  title: string;
  status: ModelStatus;
  format: ModelFormat;
  hiddenReason: string | null;
  updatedAt: Date;
  downloadCount: number;
  preview: PreviewInfo | null;
  author: { pseudo: string; pseudoSlug: string };
  openReports: number;
};

export async function listAdminModels(
  prisma: PrismaClient,
  { q, status, page }: { q: string; status: "all" | ModelStatus; page: number },
): Promise<Page<AdminModelView>> {
  const rows = await prisma.model.findMany({
    where: {
      deletedAt: null,
      ...(status === "all" ? {} : { status }),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { author: { pseudo: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      format: true,
      hiddenReason: true,
      updatedAt: true,
      downloadCount: true,
      previewKey: true,
      previewWidth: true,
      previewHeight: true,
      author: { select: { pseudo: true, pseudoSlug: true } },
      _count: { select: { reports: { where: { status: "OPEN" } } } },
    },
    ...pageWindow(page),
  });
  return paginate(
    rows.map(({ previewKey, previewWidth, previewHeight, _count, ...model }) => ({
      ...model,
      preview: previewInfo({ previewKey, previewWidth, previewHeight }),
      openReports: _count.reports,
    })),
    page,
  );
}

export type AdminActionView = {
  id: string;
  type: AdminActionType;
  targetType: string;
  targetId: string;
  createdAt: Date;
  admin: { pseudo: string };
  reason: string | null;
  label: string | null;
};

function detailString(details: Prisma.JsonValue, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = details[key];
  return typeof value === "string" ? value : null;
}

export async function listAdminActions(
  prisma: PrismaClient,
  { type, page, take }: { type?: AdminActionType; page: number; take?: number },
): Promise<Page<AdminActionView>> {
  const rows = await prisma.adminAction.findMany({
    where: type ? { type } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      type: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      details: true,
      admin: { select: { pseudo: true } },
    },
    ...(take ? { take } : pageWindow(page)),
  });
  const items = rows.map(({ details, ...action }) => ({
    ...action,
    reason: detailString(details, "reason"),
    label: detailString(details, "label"),
  }));
  return take ? { items, page: 1, hasNext: false } : paginate(items, page);
}

export type AdminDashboard = {
  counts: {
    openReports: number;
    members: number;
    bannedMembers: number;
    publishedModels: number;
    hiddenModels: number;
  };
  reports: ReportView[];
  actions: AdminActionView[];
};

/** Tableau de bord : compteurs, plus anciens signalements ouverts, dernières actions. */
export async function getAdminDashboard(prisma: PrismaClient): Promise<AdminDashboard> {
  const [openReports, members, bannedMembers, publishedModels, hiddenModels, reports, actions] =
    await Promise.all([
      countOpenReports(prisma),
      prisma.user.count({ where: { isSystem: false } }),
      prisma.user.count({ where: { isSystem: false, bannedAt: { not: null } } }),
      prisma.model.count({ where: { status: "PUBLISHED", deletedAt: null } }),
      prisma.model.count({ where: { status: "HIDDEN", deletedAt: null } }),
      prisma.report.findMany({
        where: { status: "OPEN" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: REPORT_SELECT,
        take: 5,
      }),
      listAdminActions(prisma, { page: 1, take: 8 }),
    ]);
  return {
    counts: { openReports, members, bannedMembers, publishedModels, hiddenModels },
    reports: reports.map(toReportView),
    actions: actions.items,
  };
}

export function countOpenReports(prisma: PrismaClient): Promise<number> {
  return prisma.report.count({ where: { status: "OPEN" } });
}
