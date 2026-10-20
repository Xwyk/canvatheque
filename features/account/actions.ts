"use server";

import { redirect } from "next/navigation";
import { deleteAccountSchema } from "@/features/account/schemas";
import { deleteAccount } from "@/features/account/service";
import { errorState, invalidState, readForm, type FormState } from "@/features/auth/form-state";
import { fieldErrors } from "@/features/auth/schemas";
import { rateLimited } from "@/features/models/deps";
import { endSession, getSession } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { setFlash } from "@/lib/flash";
import { mailer } from "@/lib/mail/mailer";
import { MINUTE, rateLimitKey } from "@/lib/rate-limit";
import { buckets, s3 } from "@/lib/storage/s3";

/** Supprime le compte connecté puis renvoie vers l'accueil (session fermée, message). */
export async function deleteAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=%2Fme%2Fsettings");
  const raw = readForm(formData, ["password", "mode"]);
  const parsed = deleteAccountSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), { mode: raw.mode });

  // Même limite que la connexion : la confirmation repose sur le mot de passe.
  const blocked = await rateLimited(rateLimitKey("delete-account", session.user.id), {
    limit: env().RATE_LIMIT_LOGIN_PER_15MIN,
    windowMs: 15 * MINUTE,
  });
  if (blocked) return errorState(blocked.error, { mode: raw.mode });

  const result = await deleteAccount(
    { prisma: db(), s3: s3(), buckets: buckets(), mailer: mailer() },
    session.user.id,
    parsed.data,
  );
  if (!result.ok) return errorState(result.error, { mode: raw.mode });
  await endSession();
  await setFlash({ key: "auth.flash.accountDeleted" });
  redirect("/");
}
