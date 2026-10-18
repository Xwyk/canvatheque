import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock(
  "next/navigation",
  async () => (await import("@/tests/support/next-request")).navigationModule,
);

import {
  changePasswordAction,
  requestEmailChangeAction,
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signOutAction,
  signUpAction,
  updateProfileAction,
} from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";
import { getCurrentUser, requireUserPage } from "@/lib/auth/current";
import { createMemoryMailer, setMailerForTests } from "@/lib/mail/mailer";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, form, requestContext } from "@/tests/support/next-request";

const SESSION_COOKIE = "canvatheque.session";
const SIGN_UP = {
  pseudo: "lucie.m",
  email: "lucie@exemple.fr",
  password: "papillon-de-nuit-42",
  acceptTos: "on",
};
let mail: ReturnType<typeof createMemoryMailer>;

const flash = () => JSON.parse(requestContext.cookies.get("canvatheque.flash")!.value);
const tokenFrom = (path: string) =>
  new RegExp(`/${path}/([A-Za-z0-9_-]+)`).exec(mail.sent.at(-1)!.text)![1]!;

async function signUp(values = SIGN_UP, redirectTo = "/models") {
  return expectRedirect(() => signUpAction(IDLE, form({ ...values, redirectTo })));
}

beforeEach(() => {
  requestContext.reset();
  mail = createMemoryMailer();
  setMailerForTests(mail);
});

describe("signUpAction", () => {
  it("crée le compte, ouvre la session et redirige vers la page demandée", async () => {
    expect(await signUp()).toBe("/models");
    const cookie = requestContext.cookies.get(SESSION_COOKIE)!;
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    expect(flash()).toEqual({ key: "auth.flash.welcome", values: { pseudo: "lucie.m" } });
    expect(mail.sent).toHaveLength(1);
    expect(await getCurrentUser()).toMatchObject({ pseudo: "lucie.m", emailVerifiedAt: null });
  });

  it("ignore une redirection externe", async () => {
    expect(await signUp(SIGN_UP, "https://evil.example")).toBe("/");
  });

  it("renvoie les erreurs de champ sans réafficher le mot de passe", async () => {
    const state = await signUpAction(IDLE, form({ ...SIGN_UP, email: "invalide", acceptTos: "" }));
    expect(state).toEqual({
      status: "error",
      message: "errors.validation",
      fields: { email: "email", acceptTos: "tos" },
      values: { pseudo: "lucie.m", email: "invalide" },
    });
  });

  it("signale un doublon", async () => {
    await signUp();
    requestContext.reset();
    const state = await signUpAction(IDLE, form({ ...SIGN_UP, pseudo: "autre" }));
    expect(state).toMatchObject({ status: "error", fields: { email: "emailTaken" } });
  });

  it("limite les inscriptions par IP (5 par heure)", async () => {
    for (let i = 0; i < 5; i++) {
      await signUp({ ...SIGN_UP, pseudo: `membre${i}`, email: `m${i}@exemple.fr` });
    }
    const state = await signUpAction(
      IDLE,
      form({ ...SIGN_UP, pseudo: "membre9", email: "m9@exemple.fr" }),
    );
    expect(state).toMatchObject({ status: "error", message: "errors.rateLimited" });
    expect(state.messageValues?.minutes).toBeGreaterThan(0);
    expect(state.messageValues?.minutes).toBeLessThanOrEqual(60);
  });
});

describe("signInAction / signOutAction", () => {
  beforeEach(async () => {
    await signUp();
    requestContext.reset();
  });

  it("connecte et redirige", async () => {
    const url = await expectRedirect(() =>
      signInAction(
        IDLE,
        form({ email: "LUCIE@exemple.fr", password: SIGN_UP.password, redirectTo: "/me/settings" }),
      ),
    );
    expect(url).toBe("/me/settings");
    expect(requestContext.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(flash().key).toBe("auth.flash.signedIn");
  });

  it("refuse de mauvais identifiants avec un message générique", async () => {
    expect(await signInAction(IDLE, form({ email: SIGN_UP.email, password: "mauvais" }))).toEqual({
      status: "error",
      message: "errors.invalidCredentials",
      fields: undefined,
      values: { email: SIGN_UP.email },
    });
    expect(await signInAction(IDLE, form({ email: "", password: "" }))).toMatchObject({
      fields: { email: "required", password: "required" },
    });
  });

  it("bloque après 10 échecs en 15 minutes, puis la réussite efface le compteur", async () => {
    for (let i = 0; i < 10; i++)
      await signInAction(IDLE, form({ email: SIGN_UP.email, password: `x${i}` }));
    const blocked = await signInAction(
      IDLE,
      form({ email: SIGN_UP.email, password: SIGN_UP.password }),
    );
    expect(blocked).toMatchObject({ message: "errors.rateLimited" });

    // Une autre IP n'est pas concernée ; sa réussite efface son propre compteur.
    requestContext.headers = new Headers({ "x-forwarded-for": "198.51.100.7" });
    await expectRedirect(() =>
      signInAction(IDLE, form({ email: SIGN_UP.email, password: SIGN_UP.password })),
    );
    expect(await prisma.rateLimit.count({ where: { key: { startsWith: "login:" } } })).toBe(1);
  });

  it("refuse un compte banni", async () => {
    await prisma.user.update({ where: { email: SIGN_UP.email }, data: { bannedAt: new Date() } });
    expect(
      await signInAction(IDLE, form({ email: SIGN_UP.email, password: SIGN_UP.password })),
    ).toMatchObject({
      message: "errors.banned",
    });
  });

  it("la déconnexion supprime la session en base et le cookie", async () => {
    await expectRedirect(() =>
      signInAction(IDLE, form({ email: SIGN_UP.email, password: SIGN_UP.password })),
    );
    expect(await prisma.session.count()).toBe(2);
    expect(await expectRedirect(() => signOutAction())).toBe("/");
    expect(requestContext.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await prisma.session.count()).toBe(1);
    expect(flash().key).toBe("auth.flash.signedOut");
    // Sans cookie : rien à supprimer
    await expectRedirect(() => signOutAction());
  });
});

describe("mot de passe oublié", () => {
  beforeEach(async () => {
    await signUp();
    requestContext.reset();
    mail.sent.length = 0;
  });

  it("répond toujours la même chose et envoie le lien si le compte existe", async () => {
    const expected = { status: "success", message: "auth.forgotSent" };
    expect(await requestPasswordResetAction(IDLE, form({ email: "inconnu@exemple.fr" }))).toEqual(
      expected,
    );
    expect(mail.sent).toHaveLength(0);
    expect(await requestPasswordResetAction(IDLE, form({ email: SIGN_UP.email }))).toEqual(
      expected,
    );
    expect(mail.sent).toHaveLength(1);
    expect(await requestPasswordResetAction(IDLE, form({ email: "x" }))).toMatchObject({
      fields: { email: "email" },
    });
  });

  it("limite à 3 demandes par heure et par adresse", async () => {
    for (let i = 0; i < 3; i++)
      await requestPasswordResetAction(IDLE, form({ email: SIGN_UP.email }));
    expect(await requestPasswordResetAction(IDLE, form({ email: SIGN_UP.email }))).toMatchObject({
      message: "errors.rateLimited",
    });
  });

  it("réinitialise et ouvre une session", async () => {
    await requestPasswordResetAction(IDLE, form({ email: SIGN_UP.email }));
    const token = tokenFrom("reset");
    expect(await resetPasswordAction(IDLE, form({ token, password: "court" }))).toMatchObject({
      fields: { password: "passwordShort" },
    });
    expect(
      await expectRedirect(() =>
        resetPasswordAction(IDLE, form({ token, password: "nouvelle-phrase-secrete" })),
      ),
    ).toBe("/");
    expect(flash().key).toBe("auth.flash.passwordReset");
    expect(
      await resetPasswordAction(IDLE, form({ token, password: "nouvelle-phrase-secrete" })),
    ).toMatchObject({
      message: "auth.resetInvalid",
    });
  });

  it("limite les tentatives de réinitialisation par IP", async () => {
    for (let i = 0; i < 10; i++)
      await resetPasswordAction(
        IDLE,
        form({ token: `faux${i}`, password: "nouvelle-phrase-secrete" }),
      );
    expect(
      await resetPasswordAction(IDLE, form({ token: "faux", password: "nouvelle-phrase-secrete" })),
    ).toMatchObject({
      message: "errors.rateLimited",
    });
  });
});

describe("paramètres du compte", () => {
  beforeEach(async () => {
    await signUp();
    mail.sent.length = 0;
  });

  it("exigent une session", async () => {
    requestContext.reset();
    expect(
      await expectRedirect(() => updateProfileAction(IDLE, form({ bio: "", website: "" }))),
    ).toBe("/login?redirectTo=%2Fme%2Fsettings");
    expect(await expectRedirect(() => requireUserPage("/me/settings"))).toBe(
      "/login?redirectTo=%2Fme%2Fsettings",
    );
    expect(await resendVerificationAction(IDLE)).toMatchObject({ message: "errors.unauthorized" });
  });

  it("enregistre le profil", async () => {
    expect(
      await updateProfileAction(IDLE, form({ bio: " Bonjour ", website: "https://x.fr" })),
    ).toEqual({
      status: "success",
      message: "settings.profileSaved",
      values: { bio: "Bonjour", website: "https://x.fr" },
    });
    expect(await updateProfileAction(IDLE, form({ bio: "", website: "ftp://x" }))).toMatchObject({
      fields: { website: "url" },
    });
    expect(await updateProfileAction(IDLE, form({ bio: "", website: "" }))).toMatchObject({
      values: { bio: "", website: "" },
    });
  });

  it("change le mot de passe en gardant la session courante", async () => {
    expect(
      await changePasswordAction(
        IDLE,
        form({ currentPassword: SIGN_UP.password, newPassword: "court" }),
      ),
    ).toMatchObject({ fields: { newPassword: "passwordShort" } });
    expect(
      await changePasswordAction(
        IDLE,
        form({ currentPassword: "faux", newPassword: "nouvelle-phrase-secrete" }),
      ),
    ).toMatchObject({ fields: { currentPassword: "wrongPassword" } });
    expect(
      await changePasswordAction(
        IDLE,
        form({ currentPassword: SIGN_UP.password, newPassword: "nouvelle-phrase-secrete" }),
      ),
    ).toEqual({ status: "success", message: "settings.passwordChanged" });
    expect(await getCurrentUser()).not.toBeNull();
  });

  it("demande un changement d'adresse", async () => {
    expect(
      await requestEmailChangeAction(
        IDLE,
        form({ newEmail: "Nouvelle@Exemple.fr", password: SIGN_UP.password }),
      ),
    ).toEqual({
      status: "success",
      message: "settings.emailSent",
      messageValues: { email: "nouvelle@exemple.fr" },
    });
    expect(
      await requestEmailChangeAction(IDLE, form({ newEmail: "x", password: "" })),
    ).toMatchObject({
      fields: { newEmail: "email", password: "required" },
    });
    expect(
      await requestEmailChangeAction(
        IDLE,
        form({ newEmail: "autre@exemple.fr", password: "faux" }),
      ),
    ).toMatchObject({
      fields: { password: "wrongPassword" },
      values: { newEmail: "autre@exemple.fr" },
    });
    for (let i = 0; i < 2; i++) {
      await requestEmailChangeAction(
        IDLE,
        form({ newEmail: `n${i}@exemple.fr`, password: SIGN_UP.password }),
      );
    }
    expect(
      await requestEmailChangeAction(
        IDLE,
        form({ newEmail: "n9@exemple.fr", password: SIGN_UP.password }),
      ),
    ).toMatchObject({ message: "errors.rateLimited" });
  });

  it("limite les changements de mot de passe", async () => {
    for (let i = 0; i < 10; i++) {
      await changePasswordAction(
        IDLE,
        form({ currentPassword: `faux${i}`, newPassword: "nouvelle-phrase-secrete" }),
      );
    }
    expect(
      await changePasswordAction(
        IDLE,
        form({ currentPassword: "faux", newPassword: "nouvelle-phrase-secrete" }),
      ),
    ).toMatchObject({ message: "errors.rateLimited" });
  });

  it("renvoie le lien de confirmation, avec limite, et rien si l'adresse est confirmée", async () => {
    expect(await resendVerificationAction(IDLE)).toEqual({
      status: "success",
      message: "auth.unverified.sent",
      messageValues: { email: SIGN_UP.email },
    });
    expect(mail.sent).toHaveLength(1);
    await resendVerificationAction(IDLE);
    await resendVerificationAction(IDLE);
    expect(await resendVerificationAction(IDLE)).toMatchObject({ message: "errors.rateLimited" });

    await prisma.user.update({
      where: { email: SIGN_UP.email },
      data: { emailVerifiedAt: new Date() },
    });
    expect(await resendVerificationAction(IDLE)).toEqual({ status: "success" });
  });
});
