import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/features/auth/form-state";

const actions = vi.hoisted(() => ({
  signUpAction: vi.fn(),
  signInAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  updateProfileAction: vi.fn(),
  requestEmailChangeAction: vi.fn(),
  changePasswordAction: vi.fn(),
  resendVerificationAction: vi.fn(),
  signOutAction: vi.fn(),
}));
vi.mock("@/features/auth/actions", () => actions);

import { AuthCard } from "@/components/auth/auth-card";
import { AuthTabs } from "@/components/auth/auth-tabs";
import {
  ForgotPasswordForm,
  ResetPasswordForm,
} from "@/features/auth/components/password-reset-forms";
import { EmailForm, PasswordForm, ProfileForm } from "@/features/auth/components/settings-forms";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const respond = (mock: ReturnType<typeof vi.fn>, state: FormState) =>
  mock.mockImplementation(async (_prev: FormState, _data?: FormData) => state);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthCard et AuthTabs", () => {
  it("présentent le titre, les onglets et le pied", async () => {
    const { container } = renderWithProviders(
      <AuthCard title="Titre" subtitle="Sous-titre" footer={<span>Pied</span>}>
        <AuthTabs current="signUp" redirectTo="/models/x" />
      </AuthCard>,
    );
    expect(screen.getByRole("region", { name: "Titre" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Connexion ou inscription" });
    expect(within(nav).getByRole("link", { name: "Connexion" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fmodels%2Fx",
    );
    expect(within(nav).getByRole("link", { name: "Inscription" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Pied")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("onglets sans redirection et carte minimale", () => {
    renderWithProviders(
      <AuthCard title="T">
        <AuthTabs current="signIn" />
      </AuthCard>,
    );
    expect(screen.getByRole("link", { name: "Connexion" })).toHaveAttribute("href", "/login");
  });
});

describe("SignUpForm", () => {
  it("envoie les champs et affiche les erreurs renvoyées", async () => {
    const user = userEvent.setup();
    respond(actions.signUpAction, {
      status: "error",
      message: "errors.validation",
      fields: { pseudo: "pseudoTaken", acceptTos: "tos" },
      values: { pseudo: "lucie", email: "lucie@exemple.fr" },
    });
    const { container } = renderWithProviders(
      <SignUpForm redirectTo="/models/papillon" submitLabel="Go" />,
    );

    await user.type(screen.getByLabelText("Pseudo"), "lucie");
    await user.type(screen.getByLabelText("Adresse e-mail"), "lucie@exemple.fr");
    await user.type(screen.getByLabelText("Mot de passe"), "papillon-de-nuit-42");
    await user.click(screen.getByRole("button", { name: "Go" }));

    const data = actions.signUpAction.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      pseudo: "lucie",
      email: "lucie@exemple.fr",
      password: "papillon-de-nuit-42",
      redirectTo: "/models/papillon",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Certains champs sont à corriger.");
    expect(screen.getByText("Ce pseudo est déjà pris.")).toBeInTheDocument();
    expect(
      screen.getByText("Vous devez accepter les conditions pour créer un compte."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
      "Vous devez accepter les conditions pour créer un compte.",
    );
    expect(screen.getByLabelText("Pseudo")).toHaveValue("lucie");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SignInForm", () => {
  it("propose le lien de mot de passe oublié et affiche l'erreur générique", async () => {
    const user = userEvent.setup();
    respond(actions.signInAction, { status: "error", message: "errors.invalidCredentials" });
    const { container } = renderWithProviders(<SignInForm />);
    expect(screen.getByRole("link", { name: "Mot de passe oublié ?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    await user.type(screen.getByLabelText("Adresse e-mail"), "a@b.fr");
    await user.type(screen.getByLabelText("Mot de passe"), "x");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    expect((actions.signInAction.mock.calls[0]![1] as FormData).get("redirectTo")).toBe("/");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("mot de passe oublié / réinitialisation", () => {
  it("remplace le formulaire par la confirmation d'envoi", async () => {
    const user = userEvent.setup();
    respond(actions.requestPasswordResetAction, { status: "success", message: "auth.forgotSent" });
    const { container } = renderWithProviders(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "a@b.fr");
    await user.click(screen.getByRole("button", { name: "Recevoir le lien" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Si un compte existe pour cette adresse/,
    );
    expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("transmet le jeton avec le nouveau mot de passe", async () => {
    const user = userEvent.setup();
    respond(actions.resetPasswordAction, { status: "error", message: "auth.resetInvalid" });
    const { container } = renderWithProviders(<ResetPasswordForm token="jeton-123" />);
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "nouvelle-phrase-secrete");
    await user.click(screen.getByRole("button", { name: "Enregistrer et me connecter" }));
    expect((actions.resetPasswordAction.mock.calls[0]![1] as FormData).get("token")).toBe(
      "jeton-123",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ce lien n'est plus valable/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("formulaires des paramètres", () => {
  it("profil : préremplit puis affiche la confirmation", async () => {
    const user = userEvent.setup();
    respond(actions.updateProfileAction, {
      status: "success",
      message: "settings.profileSaved",
      values: { bio: "Nouveau", website: "" },
    });
    const { container } = renderWithProviders(
      <ProfileForm bio="Ancienne" website="https://x.fr" />,
    );
    expect(screen.getByLabelText("Présentation")).toHaveValue("Ancienne");
    expect(screen.getByLabelText("Site web")).toHaveValue("https://x.fr");
    await user.click(screen.getByRole("button", { name: "Enregistrer le profil" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Profil enregistré.");
    expect(screen.getByLabelText("Présentation")).toHaveValue("Nouveau");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("adresse : vide le champ après succès", async () => {
    const user = userEvent.setup();
    respond(actions.requestEmailChangeAction, {
      status: "success",
      message: "settings.emailSent",
      messageValues: { email: "n@b.fr" },
    });
    const { container } = renderWithProviders(<EmailForm />);
    await user.type(screen.getByLabelText("Nouvelle adresse e-mail"), "n@b.fr");
    await user.type(screen.getByLabelText("Mot de passe actuel"), "x");
    await user.click(screen.getByRole("button", { name: "Changer d'adresse" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/n@b.fr/);
    expect(screen.getByLabelText("Nouvelle adresse e-mail")).toHaveValue("");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("mot de passe : affiche l'erreur sur le mot de passe actuel", async () => {
    const user = userEvent.setup();
    respond(actions.changePasswordAction, {
      status: "error",
      message: "errors.wrongPassword",
      fields: { currentPassword: "wrongPassword" },
    });
    const { container } = renderWithProviders(<PasswordForm />);
    await user.type(screen.getByLabelText("Mot de passe actuel"), "faux");
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "nouvelle-phrase-secrete");
    await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
    expect(await screen.findByLabelText("Mot de passe actuel")).toHaveAccessibleDescription(
      "Mot de passe incorrect.",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
