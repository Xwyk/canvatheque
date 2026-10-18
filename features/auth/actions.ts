"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorState, invalidState, readForm, type FormState } from "@/features/auth/form-state";
import {
  changeEmailSchema,
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  safeRedirect,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
import * as service from "@/features/auth/service";
import { endSession, getSession, startSession } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { setFlash } from "@/lib/flash";
import { logger, truncateIp } from "@/lib/logger";
import { mailer } from "@/lib/mail/mailer";
import {
  HOUR,
  MINUTE,
  consumeRateLimit,
  rateLimitKey,
  resetRateLimit,
  type RateLimitRule,
} from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { fail } from "@/lib/result";

const deps = (): service.AuthDeps => ({ prisma: db(), mailer: mailer(), appUrl: env().APP_URL });

async function ip(): Promise<string> {
  return clientIp(await headers());
}

/** Renvoie un état d'erreur si la limite est atteinte, sinon null. */
async function limited(key: string, rule: RateLimitRule): Promise<FormState | null> {
  const result = await consumeRateLimit(db(), key, rule);
  if (result.ok) return null;
  logger.warn({ event: "rate_limited", bucket: key.split(":")[0] }, "Limite de débit atteinte");
  return errorState(
    fail("RATE_LIMITED", "errors.rateLimited", { retryAfter: result.retryAfter }).error,
  );
}

// --- Inscription / connexion / déconnexion -------------------------------------------------

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["pseudo", "email", "password", "acceptTos", "redirectTo"]);
  const values = { pseudo: raw.pseudo, email: raw.email };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), values);

  const blocked = await limited(rateLimitKey("signup", await ip()), {
    limit: env().RATE_LIMIT_SIGNUP_PER_HOUR,
    windowMs: HOUR,
  });
  if (blocked) return { ...blocked, values };

  const result = await service.registerUser(deps(), parsed.data);
  if (!result.ok) return errorState(result.error, values);

  await startSession(result.data.userId);
  await setFlash({ key: "auth.flash.welcome", values: { pseudo: result.data.pseudo } });
  logger.info({ event: "user_registered", userId: result.data.userId }, "Nouveau compte");
  redirect(safeRedirect(raw.redirectTo));
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readForm(formData, ["email", "password", "redirectTo"]);
  const values = { email: raw.email };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), values);

  const key = rateLimitKey("login", await ip(), parsed.data.email);
  const blocked = await limited(key, {
    limit: env().RATE_LIMIT_LOGIN_PER_15MIN,
    windowMs: 15 * MINUTE,
  });
  if (blocked) return { ...blocked, values };

  const result = await service.authenticate(deps(), parsed.data.email, parsed.data.password);
  if (!result.ok) {
    logger.info(
      { event: "login_failed", code: result.error.code, ip: truncateIp(await ip()) },
      "Échec de connexion",
    );
    return errorState(result.error, values);
  }

  await resetRateLimit(db(), key);
  await startSession(result.data.userId);
  await setFlash({ key: "auth.flash.signedIn" });
  redirect(safeRedirect(raw.redirectTo));
}

export async function signOutAction(): Promise<void> {
  await endSession();
  await setFlash({ key: "auth.flash.signedOut" });
  redirect("/");
}

// --- Vérification d'adresse -------------------------------------------------------------

export async function resendVerificationAction(_prev: FormState): Promise<FormState> {
  const session = await getSession();
  if (!session) return errorState(fail("UNAUTHORIZED", "errors.unauthorized").error);
  if (session.user.emailVerifiedAt) return { status: "success" };

  const blocked = await limited(rateLimitKey("verify", session.user.id), {
    limit: env().RATE_LIMIT_RESET_PER_HOUR,
    windowMs: HOUR,
  });
  if (blocked) return blocked;

  await service.sendVerificationEmail(deps(), session.user);
  return {
    status: "success",
    message: "auth.unverified.sent",
    messageValues: { email: session.user.email },
  };
}

// --- Mot de passe oublié / réinitialisation ---------------------------------------------------

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = readForm(formData, ["email"]);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), raw);

  const rule = { limit: env().RATE_LIMIT_RESET_PER_HOUR, windowMs: HOUR };
  const blocked =
    (await limited(rateLimitKey("reset", parsed.data.email), rule)) ??
    (await limited(rateLimitKey("reset-ip", await ip()), { ...rule, limit: rule.limit * 5 }));
  if (blocked) return { ...blocked, values: raw };

  await service.requestPasswordReset(deps(), parsed.data.email);
  return { status: "success", message: "auth.forgotSent" };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = readForm(formData, ["token", "password"]);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error));

  const blocked = await limited(rateLimitKey("reset-submit", await ip()), {
    limit: env().RATE_LIMIT_LOGIN_PER_15MIN,
    windowMs: 15 * MINUTE,
  });
  if (blocked) return blocked;

  const result = await service.resetPassword(deps(), parsed.data.token, parsed.data.password);
  if (!result.ok) return errorState(result.error);

  await startSession(result.data.userId);
  await setFlash({ key: "auth.flash.passwordReset" });
  redirect("/");
}

// --- Paramètres du compte ----------------------------------------------------------------

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=%2Fme%2Fsettings");
  return session;
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const raw = readForm(formData, ["bio", "website"]);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), raw);
  const result = await service.updateProfile(deps(), session.user.id, parsed.data);
  if (!result.ok) return errorState(result.error, raw);
  return {
    status: "success",
    message: "settings.profileSaved",
    values: { bio: result.data.bio ?? "", website: result.data.website ?? "" },
  };
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const raw = readForm(formData, ["currentPassword", "newPassword"]);
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error));

  const blocked = await limited(rateLimitKey("password", session.user.id), {
    limit: env().RATE_LIMIT_LOGIN_PER_15MIN,
    windowMs: 15 * MINUTE,
  });
  if (blocked) return blocked;

  const result = await service.changePassword(
    deps(),
    session.user.id,
    parsed.data,
    session.sessionId,
  );
  if (!result.ok) return errorState(result.error);
  return { status: "success", message: "settings.passwordChanged" };
}

export async function requestEmailChangeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const raw = readForm(formData, ["newEmail", "password"]);
  const values = { newEmail: raw.newEmail };
  const parsed = changeEmailSchema.safeParse(raw);
  if (!parsed.success) return invalidState(fieldErrors(parsed.error), values);

  const blocked = await limited(rateLimitKey("email-change", session.user.id), {
    limit: env().RATE_LIMIT_RESET_PER_HOUR,
    windowMs: HOUR,
  });
  if (blocked) return { ...blocked, values };

  const result = await service.requestEmailChange(deps(), session.user.id, parsed.data);
  if (!result.ok) return errorState(result.error, values);
  return {
    status: "success",
    message: "settings.emailSent",
    messageValues: { email: result.data.email },
  };
}
