import type { ReportInput } from "@/features/reports/schemas";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { Mailer } from "@/lib/mail/mailer";
import { reportReceivedNotice } from "@/lib/mail/templates";
import { can, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

export type ReportDeps = { prisma: PrismaClient; mailer: Mailer; appUrl: string };

type Reporter = NonNullable<Actor> & { pseudo: string; email: string };

/**
 * Signalement d'un modèle publié par un membre (pas le sien). Un seul signalement ouvert par
 * membre et par modèle (index unique partiel) ; accusé de réception par e-mail.
 */
export async function createReport(
  deps: ReportDeps,
  actor: Reporter | null,
  input: ReportInput,
): Promise<Result<{ reportId: string }>> {
  if (!actor) return fail("UNAUTHORIZED", "errors.unauthorized");
  if (!can(actor, "report:create")) return fail("FORBIDDEN", "errors.forbidden");

  const model = await deps.prisma.model.findFirst({
    where: { id: input.modelId, status: "PUBLISHED", deletedAt: null },
    select: { id: true, slug: true, title: true, authorId: true },
  });
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  if (model.authorId === actor.id) return fail("FORBIDDEN", "errors.report.own");

  try {
    const report = await deps.prisma.report.create({
      data: {
        modelId: model.id,
        reporterId: actor.id,
        reason: input.reason,
        details: input.details,
      },
      select: { id: true },
    });
    logger.info({ event: "report_created", reportId: report.id, modelId: model.id }, "Signalement");
    await deps.mailer.send(
      reportReceivedNotice(
        { to: actor.email, pseudo: actor.pseudo },
        { title: model.title, url: new URL(`/models/${model.slug}`, deps.appUrl).toString() },
      ),
    );
    return ok({ reportId: report.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CONFLICT", "errors.report.duplicate");
    }
    throw error;
  }
}
