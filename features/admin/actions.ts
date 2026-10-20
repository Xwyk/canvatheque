"use server";

import {
  banSchema,
  dismissReportSchema,
  memberModerationSchema,
  modelModerationSchema,
  resolveReportSchema,
} from "@/features/admin/schemas";
import * as service from "@/features/admin/service";
import { fieldErrors } from "@/features/auth/schemas";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mailer } from "@/lib/mail/mailer";
import { can } from "@/lib/permissions";
import { fail, type Result } from "@/lib/result";
import { buckets, s3 } from "@/lib/storage/s3";
import type { z } from "@/lib/validation";

const deps = (): service.AdminDeps => ({
  prisma: db(),
  s3: s3(),
  buckets: buckets(),
  mailer: mailer(),
  appUrl: env().APP_URL,
});

/**
 * Enveloppe commune : administrateur connecté, entrée validée, puis service. Les pages
 * d'administration et la fiche sont rafraîchies par le client (`router.refresh`).
 */
function adminAction<S extends z.ZodType, T>(
  schema: S,
  run: (
    deps: service.AdminDeps,
    admin: service.AdminActor,
    input: z.infer<S>,
  ) => Promise<Result<T>>,
) {
  return async (input: unknown): Promise<Result<T>> => {
    const user = await getCurrentUser();
    if (!user) return fail("UNAUTHORIZED", "errors.unauthorized");
    if (!can(user, "admin:access")) return fail("FORBIDDEN", "errors.forbidden");
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION", "errors.validation", { fields: fieldErrors(parsed.error) });
    }
    return run(deps(), user, parsed.data);
  };
}

export async function hideModelAction(input: unknown) {
  return adminAction(modelModerationSchema, service.hideModel)(input);
}

export async function unhideModelAction(input: unknown) {
  return adminAction(modelModerationSchema, service.unhideModel)(input);
}

export async function adminDeleteModelAction(input: unknown) {
  return adminAction(modelModerationSchema, service.adminDeleteModel)(input);
}

export async function resolveReportAction(input: unknown) {
  return adminAction(resolveReportSchema, service.resolveReport)(input);
}

export async function dismissReportAction(input: unknown) {
  return adminAction(dismissReportSchema, service.dismissReport)(input);
}

export async function banMemberAction(input: unknown) {
  return adminAction(banSchema, service.banMember)(input);
}

export async function unbanMemberAction(input: unknown) {
  return adminAction(memberModerationSchema, service.unbanMember)(input);
}

export async function promoteMemberAction(input: unknown) {
  return adminAction(memberModerationSchema, service.promoteMember)(input);
}
