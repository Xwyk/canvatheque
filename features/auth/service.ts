import { RESERVED_PSEUDOS } from "@/features/auth/schemas";
import {
  hashPassword,
  isCommonPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { EmailTokenType } from "@/lib/generated/prisma/enums";
import type { Mailer } from "@/lib/mail/mailer";
import {
  changeEmailMessage,
  emailChangedNotice,
  passwordChangedNotice,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/lib/mail/templates";
import { fail, ok, type Result } from "@/lib/result";
import { slugify } from "@/lib/slug";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Logique des comptes, indépendante de Next.js : base, envoi d'e-mails et horloge
 * sont injectés (testable en intégration). Les messages d'erreur sont des clés
 * de traduction (`errors.*`, `errors.field.*`).
 */

export type AuthDeps = {
  prisma: PrismaClient;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
};

const HOUR_MS = 60 * 60 * 1000;
export const TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 48 * HOUR_MS,
  RESET_PASSWORD: HOUR_MS,
  CHANGE_EMAIL: 24 * HOUR_MS,
};

const clock = (deps: AuthDeps) => (deps.now ?? (() => new Date()))();
const link = (deps: AuthDeps, path: string) => new URL(path, deps.appUrl).toString();

// --- Jetons envoyés par e-mail ----------------------------------------------------------

/** Émet un jeton à usage unique (les précédents jetons inutilisés du même type sont annulés). */
export async function issueEmailToken(
  deps: AuthDeps,
  userId: string,
  type: EmailTokenType,
  payload?: string,
): Promise<string> {
  const token = generateToken();
  const now = clock(deps);
  await deps.prisma.$transaction([
    deps.prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    deps.prisma.emailToken.create({
      data: {
        userId,
        type,
        payload,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]),
      },
    }),
  ]);
  return token;
}

/** Consomme un jeton valide (non expiré, non utilisé, du bon type) ; null sinon. */
export async function consumeEmailToken(deps: AuthDeps, token: string, types: EmailTokenType[]) {
  const now = clock(deps);
  const record = await deps.prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || !types.includes(record.type) || record.usedAt || record.expiresAt <= now) {
    return null;
  }
  // Mise à jour conditionnelle : un double clic ne consomme le jeton qu'une fois.
  const { count } = await deps.prisma.emailToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  return count === 1 ? record : null;
}

/** Vérifie qu'un jeton est encore utilisable, sans le consommer (affichage du formulaire). */
export async function isEmailTokenUsable(deps: AuthDeps, token: string, type: EmailTokenType) {
  const record = await deps.prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return !!record && record.type === type && !record.usedAt && record.expiresAt > clock(deps);
}

// --- Inscription, connexion ---------------------------------------------------------------

export async function sendVerificationEmail(
  deps: AuthDeps,
  user: { id: string; email: string; pseudo: string },
): Promise<void> {
  const token = await issueEmailToken(deps, user.id, "VERIFY_EMAIL");
  await deps.mailer.send(
    verifyEmailMessage({ to: user.email, pseudo: user.pseudo }, link(deps, `/check-mail/${token}`)),
  );
}

export type NewAccount = { pseudo: string; email: string; password: string };

export async function registerUser(
  deps: AuthDeps,
  input: NewAccount,
): Promise<Result<{ userId: string; pseudo: string }>> {
  const pseudoSlug = slugify(input.pseudo, 40);
  if (RESERVED_PSEUDOS.has(pseudoSlug) || pseudoSlug.length < 3) {
    return fail("VALIDATION", "errors.validation", { fields: { pseudo: "pseudoReserved" } });
  }
  if (isCommonPassword(input.password)) {
    return fail("VALIDATION", "errors.validation", { fields: { password: "passwordCommon" } });
  }

  const existing = await deps.prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { pseudoSlug }, { pseudo: input.pseudo }] },
    select: { email: true },
  });
  if (existing) {
    return existing.email === input.email
      ? fail("CONFLICT", "errors.emailTaken", { fields: { email: "emailTaken" } })
      : fail("CONFLICT", "errors.pseudoTaken", { fields: { pseudo: "pseudoTaken" } });
  }

  const user = await deps.prisma.user.create({
    data: {
      pseudo: input.pseudo,
      pseudoSlug,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      tosAcceptedAt: clock(deps),
    },
  });
  await sendVerificationEmail(deps, user);
  return ok({ userId: user.id, pseudo: user.pseudo });
}

/**
 * Message générique en cas d'échec (pas de fuite sur l'existence du compte) ;
 * le bannissement n'est révélé qu'après un mot de passe correct.
 */
export async function authenticate(
  deps: AuthDeps,
  email: string,
  password: string,
): Promise<Result<{ userId: string }>> {
  const user = await deps.prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, bannedAt: true, isSystem: true },
  });
  if (!user || user.isSystem || !user.passwordHash) {
    await verifyAgainstDummy(password);
    return fail("UNAUTHORIZED", "errors.invalidCredentials");
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    return fail("UNAUTHORIZED", "errors.invalidCredentials");
  }
  if (user.bannedAt) return fail("FORBIDDEN", "errors.banned");
  return ok({ userId: user.id });
}

export async function verifyEmail(
  deps: AuthDeps,
  token: string,
): Promise<Result<{ kind: "verified" | "alreadyVerified" | "emailChanged"; email: string }>> {
  const record = await consumeEmailToken(deps, token, ["VERIFY_EMAIL", "CHANGE_EMAIL"]);
  if (!record) return fail("NOT_FOUND", "errors.generic");
  if (record.type === "CHANGE_EMAIL") return applyEmailChange(deps, record.userId, record.payload);

  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
  if (user.emailVerifiedAt) return ok({ kind: "alreadyVerified", email: user.email });
  await deps.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: clock(deps) } });
  return ok({ kind: "verified", email: user.email });
}

// --- Mot de passe ------------------------------------------------------------------------

/** Toujours « ok » : la réponse ne dit pas si l'adresse existe. */
export async function requestPasswordReset(deps: AuthDeps, email: string): Promise<void> {
  const user = await deps.prisma.user.findUnique({ where: { email } });
  if (!user || user.isSystem || user.bannedAt) return;
  const token = await issueEmailToken(deps, user.id, "RESET_PASSWORD");
  await deps.mailer.send(
    resetPasswordMessage({ to: user.email, pseudo: user.pseudo }, link(deps, `/reset/${token}`)),
  );
}

export async function resetPassword(
  deps: AuthDeps,
  token: string,
  password: string,
): Promise<Result<{ userId: string }>> {
  if (isCommonPassword(password)) {
    return fail("VALIDATION", "errors.validation", { fields: { password: "passwordCommon" } });
  }
  const record = await consumeEmailToken(deps, token, ["RESET_PASSWORD"]);
  if (!record) return fail("NOT_FOUND", "auth.resetInvalid");
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
  if (user.bannedAt) return fail("FORBIDDEN", "errors.banned");

  await deps.prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      // Le lien reçu prouve la possession de l'adresse.
      emailVerifiedAt: user.emailVerifiedAt ?? clock(deps),
    },
  });
  await revokeUserSessions(deps.prisma, user.id);
  await deps.mailer.send(passwordChangedNotice({ to: user.email, pseudo: user.pseudo }));
  return ok({ userId: user.id });
}

export async function changePassword(
  deps: AuthDeps,
  userId: string,
  input: { currentPassword: string; newPassword: string },
  currentSessionId?: string,
): Promise<Result<null>> {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return fail("UNAUTHORIZED", "errors.wrongPassword", {
      fields: { currentPassword: "wrongPassword" },
    });
  }
  if (isCommonPassword(input.newPassword)) {
    return fail("VALIDATION", "errors.validation", { fields: { newPassword: "passwordCommon" } });
  }
  await deps.prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  await revokeUserSessions(deps.prisma, userId, currentSessionId);
  await deps.mailer.send(passwordChangedNotice({ to: user.email, pseudo: user.pseudo }));
  return ok(null);
}

// --- Adresse e-mail ----------------------------------------------------------------------

export async function requestEmailChange(
  deps: AuthDeps,
  userId: string,
  input: { newEmail: string; password: string },
): Promise<Result<{ email: string }>> {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    return fail("UNAUTHORIZED", "errors.wrongPassword", { fields: { password: "wrongPassword" } });
  }
  if (input.newEmail === user.email) {
    return fail("VALIDATION", "errors.sameEmail", { fields: { newEmail: "sameEmail" } });
  }
  if (
    await deps.prisma.user.findUnique({ where: { email: input.newEmail }, select: { id: true } })
  ) {
    return fail("CONFLICT", "errors.emailTaken", { fields: { newEmail: "emailTaken" } });
  }
  const token = await issueEmailToken(deps, userId, "CHANGE_EMAIL", input.newEmail);
  await deps.mailer.send(
    changeEmailMessage(
      { to: input.newEmail, pseudo: user.pseudo },
      link(deps, `/check-mail/${token}`),
    ),
  );
  return ok({ email: input.newEmail });
}

async function applyEmailChange(
  deps: AuthDeps,
  userId: string,
  newEmail: string | null,
): Promise<Result<{ kind: "emailChanged"; email: string }>> {
  if (!newEmail) return fail("NOT_FOUND", "errors.generic");
  const taken = await deps.prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (taken) return fail("CONFLICT", "errors.emailTaken");
  const previous = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await deps.prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, emailVerifiedAt: clock(deps) },
  });
  await deps.mailer.send(
    emailChangedNotice({ to: previous.email, pseudo: previous.pseudo }, newEmail),
  );
  return ok({ kind: "emailChanged", email: newEmail });
}

// --- Profil ------------------------------------------------------------------------------

export async function updateProfile(
  deps: AuthDeps,
  userId: string,
  input: { bio: string | null; website: string | null },
): Promise<Result<{ bio: string | null; website: string | null }>> {
  const user = await deps.prisma.user.update({
    where: { id: userId },
    data: input,
    select: { bio: true, website: true },
  });
  return ok(user);
}

// --- Bannissement (interface d'administration à l'étape 5) ---------------------------------

export async function banUser(
  deps: AuthDeps,
  adminId: string,
  userId: string,
  reason: string,
): Promise<Result<{ revokedSessions: number }>> {
  if (adminId === userId) return fail("FORBIDDEN", "errors.forbidden");
  const target = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.isSystem) return fail("NOT_FOUND", "errors.generic");
  await deps.prisma.$transaction([
    deps.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: clock(deps), bannedReason: reason },
    }),
    deps.prisma.adminAction.create({
      data: {
        adminId,
        type: "USER_BAN",
        targetType: "User",
        targetId: userId,
        details: { reason, label: target.pseudo },
      },
    }),
  ]);
  const revokedSessions = await revokeUserSessions(deps.prisma, userId);
  return ok({ revokedSessions });
}

export async function unbanUser(
  deps: AuthDeps,
  adminId: string,
  userId: string,
  reason: string,
): Promise<Result<null>> {
  const target = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!target?.bannedAt) return fail("NOT_FOUND", "errors.generic");
  await deps.prisma.$transaction([
    deps.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: null, bannedReason: null },
    }),
    deps.prisma.adminAction.create({
      data: {
        adminId,
        type: "USER_UNBAN",
        targetType: "User",
        targetId: userId,
        details: { reason, label: target.pseudo },
      },
    }),
  ]);
  return ok(null);
}
