import { NextIntlClientProvider, createTranslator } from "next-intl";
import type * as NextIntl from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/fr.json";

vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock(
  "next/navigation",
  async () => (await import("@/tests/support/next-request")).navigationModule,
);
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "fr", messages, namespace: namespace as never }),
}));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const { default: fr } = await import("@/messages/fr.json");
  return {
    ...actual,
    NextIntlClientProvider: (props: React.ComponentProps<typeof actual.NextIntlClientProvider>) => (
      <actual.NextIntlClientProvider locale="fr" messages={fr} timeZone="Europe/Paris" {...props} />
    ),
  };
});

import { GET as checkMailRoute } from "@/app/(auth)/check-mail/[token]/route";
import CheckMailResultPage from "@/app/(auth)/check-mail/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage, { generateMetadata as loginMetadata } from "@/app/(auth)/login/page";
import ResetPasswordPage from "@/app/(auth)/reset/[token]/page";
import SignUpPage from "@/app/(auth)/signup/page";
import SettingsPage from "@/app/(member)/me/settings/page";
import * as service from "@/features/auth/service";
import { createSession } from "@/lib/auth/session";
import { createMemoryMailer, setMailerForTests } from "@/lib/mail/mailer";
import { prisma } from "@/tests/setup/backend";
import { expectRedirect, requestContext } from "@/tests/support/next-request";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );
const search = (value: Record<string, string>) => Promise.resolve(value);
let mail: ReturnType<typeof createMemoryMailer>;

async function signedInUser(verified = true) {
  const user = await prisma.user.create({
    data: {
      pseudo: "lucie",
      pseudoSlug: "lucie",
      email: "lucie@exemple.fr",
      bio: "Papeterie",
      tosAcceptedAt: new Date(),
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  const { token } = await createSession(prisma, user.id);
  requestContext.cookies.set("canvatheque.session", { value: token });
  return user;
}

beforeEach(() => {
  requestContext.reset();
  mail = createMemoryMailer();
  setMailerForTests(mail);
});

describe("pages de connexion et d'inscription", () => {
  it("affichent le formulaire et transmettent la redirection", async () => {
    const login = html(
      await LoginPage({ searchParams: search({ redirectTo: "/me/settings" }) } as never),
    );
    expect(login).toContain("Bon retour parmi nous");
    expect(login).toContain('aria-current="page"');
    expect(login).toContain('href="/signup?redirectTo=%2Fme%2Fsettings"');
    expect(login).toContain('value="/me/settings"');

    const signup = html(await SignUpPage({ searchParams: search({}) } as never));
    expect(signup).toContain("Créez votre compte gratuit");
    expect(signup).toContain('autoComplete="new-password"');
    expect(signup).toContain('href="/legal/terms"');
    expect((await loginMetadata()).robots).toEqual({ index: false });
  });

  it("redirigent un membre déjà connecté", async () => {
    await signedInUser();
    expect(
      await expectRedirect(() =>
        LoginPage({ searchParams: search({ redirectTo: "/models" }) } as never),
      ),
    ).toBe("/models");
    expect(await expectRedirect(() => SignUpPage({ searchParams: search({}) } as never))).toBe("/");
  });
});

describe("mot de passe oublié et réinitialisation", () => {
  it("affiche le formulaire de demande", async () => {
    expect(html(await ForgotPasswordPage())).toContain("Recevoir le lien");
  });

  it("affiche le formulaire si le lien est valable, sinon propose d'en redemander un", async () => {
    const user = await signedInUser();
    const token = await service.issueEmailToken(
      { prisma, mailer: mail, appUrl: "http://localhost:3000" },
      user.id,
      "RESET_PASSWORD",
    );
    const valid = html(await ResetPasswordPage({ params: Promise.resolve({ token }) } as never));
    expect(valid).toContain("Enregistrer et me connecter");
    expect(valid).toContain(`value="${token}"`);

    const invalid = html(
      await ResetPasswordPage({ params: Promise.resolve({ token: "faux" }) } as never),
    );
    expect(invalid).toContain("Demander un nouveau lien");
    expect(invalid).not.toContain("Enregistrer et me connecter");
  });
});

describe("liens de confirmation", () => {
  const call = (token: string) =>
    checkMailRoute(new Request(`http://localhost:3000/check-mail/${token}`), {
      params: Promise.resolve({ token }),
    } as never);

  it("confirme puis redirige vers une page sans jeton", async () => {
    const user = await signedInUser(false);
    const deps = { prisma, mailer: mail, appUrl: "http://localhost:3000" };
    const token = await service.issueEmailToken(deps, user.id, "VERIFY_EMAIL");

    const response = await call(token);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/check-mail?result=verified",
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect((await call(token)).headers.get("location")).toContain("result=invalid");
  });

  it.each([
    ["verified", "Adresse confirmée", "vous pouvez publier"],
    ["alreadyVerified", "Adresse confirmée", "déjà confirmée"],
    ["invalid", "Lien invalide ou expiré", "Ce lien n&#x27;est plus valable"],
    [undefined, "Lien invalide ou expiré", "Ce lien n&#x27;est plus valable"],
  ])("page de résultat %s", async (result, title, text) => {
    const page = html(
      await CheckMailResultPage({ searchParams: search(result ? { result } : {}) } as never),
    );
    expect(page).toContain(title);
    expect(page).toContain(text);
  });

  it("nouvelle adresse : affichée au membre connecté, générique sinon", async () => {
    const anonymous = html(
      await CheckMailResultPage({ searchParams: search({ result: "emailChanged" }) } as never),
    );
    expect(anonymous).toContain("Connectez-vous avec elle");
    await signedInUser();
    const member = html(
      await CheckMailResultPage({ searchParams: search({ result: "emailChanged" }) } as never),
    );
    expect(member).toContain("lucie@exemple.fr");
  });
});

describe("paramètres du compte", () => {
  it("exige une session", async () => {
    expect(await expectRedirect(() => SettingsPage())).toBe("/login?redirectTo=%2Fme%2Fsettings");
  });

  it("affiche profil, adresse (avec son état) et mot de passe", async () => {
    await signedInUser(false);
    const page = html(await SettingsPage());
    expect(page).toContain("Connecté·e en tant que lucie");
    expect(page).toContain("Papeterie");
    expect(page).toContain("Adresse actuelle : lucie@exemple.fr");
    expect(page).toContain("non confirmée");
    expect(page).toContain("Changer le mot de passe");
  });
});
