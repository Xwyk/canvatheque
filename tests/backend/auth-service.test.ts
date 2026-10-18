import { beforeEach, describe, expect, it } from "vitest";
import * as service from "@/features/auth/service";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, resolveSession } from "@/lib/auth/session";
import { createMemoryMailer } from "@/lib/mail/mailer";
import { hashToken } from "@/lib/tokens";
import { prisma } from "@/tests/setup/backend";

const APP_URL = "http://localhost:3000";
let mail: ReturnType<typeof createMemoryMailer>;
let now: Date;
let deps: service.AuthDeps;

const ACCOUNT = { pseudo: "Lucie.M", email: "lucie@exemple.fr", password: "papillon-de-nuit-42" };

/** Extrait le jeton du dernier e-mail envoyé (lien …/<chemin>/<jeton>). */
function lastToken(path: "check-mail" | "reset"): string {
  const text = mail.sent.at(-1)!.text;
  const match = new RegExp(`/${path}/([A-Za-z0-9_-]+)`).exec(text);
  if (!match) throw new Error(`Aucun lien /${path}/ dans : ${text}`);
  return match[1]!;
}

async function register(overrides: Partial<typeof ACCOUNT> = {}) {
  const result = await service.registerUser(deps, { ...ACCOUNT, ...overrides });
  if (!result.ok) throw new Error(result.error.message);
  return result.data.userId;
}

beforeEach(() => {
  mail = createMemoryMailer();
  now = new Date("2026-10-18T10:00:00Z");
  deps = { prisma, mailer: mail, appUrl: APP_URL, now: () => now };
});

describe("registerUser", () => {
  it("crée le compte, hache le mot de passe et envoie le lien de confirmation", async () => {
    const userId = await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      pseudo: "Lucie.M",
      pseudoSlug: "lucie-m",
      email: "lucie@exemple.fr",
      role: "MEMBER",
      emailVerifiedAt: null,
      tosAcceptedAt: now,
    });
    expect(await verifyPassword(user.passwordHash, ACCOUNT.password)).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: "lucie@exemple.fr",
      subject: "Confirmez votre adresse e-mail",
    });
    expect(lastToken("check-mail")).toHaveLength(43);
  });

  it.each([
    [{ email: "lucie@exemple.fr", pseudo: "autre" }, "CONFLICT", { email: "emailTaken" }],
    [{ email: "autre@exemple.fr", pseudo: "Lucie.M" }, "CONFLICT", { pseudo: "pseudoTaken" }],
    // Même slug, casse et ponctuation différentes
    [{ email: "autre@exemple.fr", pseudo: "lucie-m" }, "CONFLICT", { pseudo: "pseudoTaken" }],
  ])("refuse un doublon %o", async (override, code, fields) => {
    await register();
    const result = await service.registerUser(deps, { ...ACCOUNT, ...override });
    expect(result).toMatchObject({ ok: false, error: { code, fields } });
  });

  it("refuse un pseudo réservé et un mot de passe courant", async () => {
    expect(await service.registerUser(deps, { ...ACCOUNT, pseudo: "Admin" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { pseudo: "pseudoReserved" } },
    });
    expect(await service.registerUser(deps, { ...ACCOUNT, pseudo: "...a" })).toMatchObject({
      ok: false,
      error: { fields: { pseudo: "pseudoReserved" } },
    });
    expect(await service.registerUser(deps, { ...ACCOUNT, password: "1234567890" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { password: "passwordCommon" } },
    });
  });
});

describe("authenticate", () => {
  it("accepte les bons identifiants", async () => {
    const userId = await register();
    expect(await service.authenticate(deps, ACCOUNT.email, ACCOUNT.password)).toEqual({
      ok: true,
      data: { userId },
    });
  });

  it("renvoie le même message générique pour une adresse inconnue ou un mauvais mot de passe", async () => {
    await register();
    const unknown = await service.authenticate(deps, "inconnu@exemple.fr", ACCOUNT.password);
    const wrong = await service.authenticate(deps, ACCOUNT.email, "mauvais-mot-de-passe");
    expect(unknown).toEqual(wrong);
    expect(wrong).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "errors.invalidCredentials" },
    });
  });

  it("ne révèle le bannissement qu'avec le bon mot de passe", async () => {
    const userId = await register();
    await prisma.user.update({ where: { id: userId }, data: { bannedAt: now } });
    expect(await service.authenticate(deps, ACCOUNT.email, "mauvais-mot-de-passe")).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    expect(await service.authenticate(deps, ACCOUNT.email, ACCOUNT.password)).toMatchObject({
      error: { code: "FORBIDDEN", message: "errors.banned" },
    });
  });

  it("refuse les comptes sans mot de passe et le compte système", async () => {
    await prisma.user.create({
      data: { pseudo: "x", pseudoSlug: "x", email: "sys@x.fr", isSystem: true, tosAcceptedAt: now },
    });
    expect((await service.authenticate(deps, "sys@x.fr", "quelconque")).ok).toBe(false);
  });
});

describe("verifyEmail", () => {
  it("confirme l'adresse, puis refuse la réutilisation du jeton", async () => {
    const userId = await register();
    const token = lastToken("check-mail");
    expect(await service.verifyEmail(deps, token)).toEqual({
      ok: true,
      data: { kind: "verified", email: ACCOUNT.email },
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt,
    ).toEqual(now);
    expect((await service.verifyEmail(deps, token)).ok).toBe(false);
  });

  it("indique une adresse déjà confirmée", async () => {
    const userId = await register();
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    expect(await service.verifyEmail(deps, lastToken("check-mail"))).toMatchObject({
      data: { kind: "alreadyVerified" },
    });
  });

  it("refuse un jeton expiré (48 h) ou inconnu", async () => {
    await register();
    const token = lastToken("check-mail");
    now = new Date(now.getTime() + 48 * 60 * 60 * 1000 + 1);
    expect((await service.verifyEmail(deps, token)).ok).toBe(false);
    expect((await service.verifyEmail(deps, "inconnu")).ok).toBe(false);
  });

  it("un nouvel envoi annule le lien précédent", async () => {
    const userId = await register();
    const first = lastToken("check-mail");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await service.sendVerificationEmail(deps, user);
    expect((await service.verifyEmail(deps, first)).ok).toBe(false);
    expect((await service.verifyEmail(deps, lastToken("check-mail"))).ok).toBe(true);
  });
});

describe("réinitialisation du mot de passe", () => {
  it("n'envoie rien pour une adresse inconnue, bannie ou système", async () => {
    await service.requestPasswordReset(deps, "inconnu@exemple.fr");
    const userId = await register();
    mail.sent.length = 0;
    await prisma.user.update({ where: { id: userId }, data: { bannedAt: now } });
    await service.requestPasswordReset(deps, ACCOUNT.email);
    expect(mail.sent).toHaveLength(0);
  });

  it("change le mot de passe, confirme l'adresse, ferme les sessions et prévient", async () => {
    const userId = await register();
    const { token: sessionToken } = await createSession(prisma, userId, now);
    await service.requestPasswordReset(deps, ACCOUNT.email);
    const token = lastToken("reset");
    expect(await service.isEmailTokenUsable(deps, token, "RESET_PASSWORD")).toBe(true);
    expect(await service.isEmailTokenUsable(deps, token, "VERIFY_EMAIL")).toBe(false);

    expect(await service.resetPassword(deps, token, "nouvelle-phrase-secrete")).toEqual({
      ok: true,
      data: { userId },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(user.passwordHash, "nouvelle-phrase-secrete")).toBe(true);
    expect(user.emailVerifiedAt).toEqual(now);
    expect(await resolveSession(prisma, sessionToken, now)).toBeNull();
    expect(mail.sent.at(-1)!.subject).toBe("Votre mot de passe a changé");
    expect(await service.isEmailTokenUsable(deps, token, "RESET_PASSWORD")).toBe(false);
  });

  it("refuse un lien expiré (1 h), un mot de passe courant ou un compte banni", async () => {
    const userId = await register();
    await service.requestPasswordReset(deps, ACCOUNT.email);
    const token = lastToken("reset");
    expect(await service.resetPassword(deps, token, "password123")).toMatchObject({
      error: { fields: { password: "passwordCommon" } },
    });

    await prisma.user.update({ where: { id: userId }, data: { bannedAt: now } });
    expect(await service.resetPassword(deps, token, "nouvelle-phrase-secrete")).toMatchObject({
      error: { code: "FORBIDDEN" },
    });

    await prisma.user.update({ where: { id: userId }, data: { bannedAt: null } });
    await service.requestPasswordReset(deps, ACCOUNT.email);
    now = new Date(now.getTime() + 60 * 60 * 1000 + 1);
    expect(
      await service.resetPassword(deps, lastToken("reset"), "nouvelle-phrase-secrete"),
    ).toMatchObject({
      error: { code: "NOT_FOUND", message: "auth.resetInvalid" },
    });
  });

  it("un jeton n'est consommé qu'une fois, même en cas de double envoi", async () => {
    await register();
    await service.requestPasswordReset(deps, ACCOUNT.email);
    const token = lastToken("reset");
    const results = await Promise.all([
      service.consumeEmailToken(deps, token, ["RESET_PASSWORD"]),
      service.consumeEmailToken(deps, token, ["RESET_PASSWORD"]),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("changement de mot de passe", () => {
  it("exige le mot de passe actuel et conserve la session courante", async () => {
    const userId = await register();
    const current = await createSession(prisma, userId, now);
    const other = await createSession(prisma, userId, now);
    const currentSession = await resolveSession(prisma, current.token, now);

    expect(
      await service.changePassword(deps, userId, {
        currentPassword: "faux",
        newPassword: "nouvelle-phrase-secrete",
      }),
    ).toMatchObject({
      error: { code: "UNAUTHORIZED", fields: { currentPassword: "wrongPassword" } },
    });
    expect(
      await service.changePassword(deps, userId, {
        currentPassword: ACCOUNT.password,
        newPassword: "qwertyuiop",
      }),
    ).toMatchObject({ error: { fields: { newPassword: "passwordCommon" } } });

    const result = await service.changePassword(
      deps,
      userId,
      { currentPassword: ACCOUNT.password, newPassword: "nouvelle-phrase-secrete" },
      currentSession!.sessionId,
    );
    expect(result.ok).toBe(true);
    expect(await resolveSession(prisma, current.token, now)).not.toBeNull();
    expect(await resolveSession(prisma, other.token, now)).toBeNull();
    expect(mail.sent.at(-1)!.subject).toBe("Votre mot de passe a changé");
  });
});

describe("changement d'adresse e-mail", () => {
  it("envoie la confirmation à la nouvelle adresse et l'applique au clic", async () => {
    const userId = await register();
    expect(
      await service.requestEmailChange(deps, userId, {
        newEmail: "nouvelle@exemple.fr",
        password: ACCOUNT.password,
      }),
    ).toEqual({ ok: true, data: { email: "nouvelle@exemple.fr" } });
    expect(mail.sent.at(-1)!.to).toBe("nouvelle@exemple.fr");
    // Rien ne change avant la confirmation
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(
      ACCOUNT.email,
    );

    expect(await service.verifyEmail(deps, lastToken("check-mail"))).toEqual({
      ok: true,
      data: { kind: "emailChanged", email: "nouvelle@exemple.fr" },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: "nouvelle@exemple.fr", emailVerifiedAt: now });
    expect(mail.sent.at(-1)).toMatchObject({
      to: ACCOUNT.email,
      subject: "Votre adresse e-mail a changé",
    });
  });

  it("refuse un mauvais mot de passe, la même adresse ou une adresse prise", async () => {
    const userId = await register();
    await register({ pseudo: "autre", email: "prise@exemple.fr" });
    const attempt = (newEmail: string, password = ACCOUNT.password) =>
      service.requestEmailChange(deps, userId, { newEmail, password });
    expect(await attempt("x@exemple.fr", "faux")).toMatchObject({
      error: { fields: { password: "wrongPassword" } },
    });
    expect(await attempt(ACCOUNT.email)).toMatchObject({
      error: { fields: { newEmail: "sameEmail" } },
    });
    expect(await attempt("prise@exemple.fr")).toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("revérifie la disponibilité au moment de la confirmation", async () => {
    const userId = await register();
    await service.requestEmailChange(deps, userId, {
      newEmail: "convoitee@exemple.fr",
      password: ACCOUNT.password,
    });
    const token = lastToken("check-mail");
    await register({ pseudo: "rapide", email: "convoitee@exemple.fr" });
    expect(await service.verifyEmail(deps, token)).toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("refuse un jeton de changement sans adresse cible", async () => {
    const userId = await register();
    const token = await service.issueEmailToken(deps, userId, "CHANGE_EMAIL");
    expect((await service.verifyEmail(deps, token)).ok).toBe(false);
  });
});

describe("profil et bannissement", () => {
  it("met à jour la présentation et le site", async () => {
    const userId = await register();
    expect(
      await service.updateProfile(deps, userId, { bio: "Bonjour", website: "https://x.fr" }),
    ).toEqual({
      ok: true,
      data: { bio: "Bonjour", website: "https://x.fr" },
    });
  });

  it("bannir révoque immédiatement toutes les sessions et journalise l'action", async () => {
    const userId = await register();
    const adminId = await register({ pseudo: "moderatrice", email: "modo@exemple.fr" });
    await prisma.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    const session = await createSession(prisma, userId, now);
    await createSession(prisma, userId, now);

    expect(await service.banUser(deps, adminId, userId, "Spam répété")).toEqual({
      ok: true,
      data: { revokedSessions: 2 },
    });
    expect(await resolveSession(prisma, session.token, now)).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ bannedAt: now, bannedReason: "Spam répété" });
    expect(
      await prisma.adminAction.findFirstOrThrow({ where: { targetId: userId } }),
    ).toMatchObject({
      adminId,
      type: "USER_BAN",
      targetType: "User",
      details: { reason: "Spam répété" },
    });

    expect((await service.unbanUser(deps, adminId, userId, "Erreur")).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).bannedAt).toBeNull();
    expect((await service.unbanUser(deps, adminId, userId, "Encore")).ok).toBe(false);
  });

  it("refuse de se bannir soi-même ou de bannir un compte inexistant ou système", async () => {
    const adminId = await register();
    expect((await service.banUser(deps, adminId, adminId, "x")).ok).toBe(false);
    expect((await service.banUser(deps, adminId, "inexistant", "x")).ok).toBe(false);
    const system = await prisma.user.create({
      data: {
        pseudo: "sys",
        pseudoSlug: "sys",
        email: "sys@x.fr",
        isSystem: true,
        tosAcceptedAt: now,
      },
    });
    expect((await service.banUser(deps, adminId, system.id, "x")).ok).toBe(false);
  });

  it("stocke uniquement le hachage des jetons", async () => {
    await register();
    const token = lastToken("check-mail");
    const stored = await prisma.emailToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);
  });
});
