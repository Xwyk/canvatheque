"use server";

import { fieldErrors } from "@/features/auth/schemas";
import { rateLimited } from "@/features/models/deps";
import { reportSchema } from "@/features/reports/schemas";
import { createReport } from "@/features/reports/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mailer } from "@/lib/mail/mailer";
import { DAY, rateLimitKey } from "@/lib/rate-limit";
import { fail, type Result } from "@/lib/result";

/** Signale un modèle (motif, précisions) ; limité à `RATE_LIMIT_REPORT_PER_DAY` par membre. */
export async function createReportAction(input: unknown): Promise<Result<{ reportId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "errors.unauthorized");
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "errors.validation", { fields: fieldErrors(parsed.error) });
  }
  const limited = await rateLimited(rateLimitKey("report", user.id), {
    limit: env().RATE_LIMIT_REPORT_PER_DAY,
    windowMs: DAY,
  });
  if (limited) return limited;
  return createReport({ prisma: db(), mailer: mailer(), appUrl: env().APP_URL }, user, parsed.data);
}
