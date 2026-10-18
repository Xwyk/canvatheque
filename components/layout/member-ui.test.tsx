import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  resendVerificationAction: vi.fn(),
  signOutAction: vi.fn(),
}));
vi.mock("@/features/auth/actions", () => actions);

import { FlashToast } from "@/components/flash-toast";
import { DarkCtaPanel } from "@/components/home/dark-cta-panel";
import { AccountMenu } from "@/components/layout/account-menu";
import { SiteHeader } from "@/components/layout/site-header";
import { UnverifiedBanner } from "@/components/layout/unverified-banner";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const MEMBER = { pseudo: "lucie", email: "lucie@exemple.fr", isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "canvatheque.flash=; Max-Age=0; Path=/";
});

describe("SiteHeader (membre)", () => {
  it("remplace les boutons visiteur par « Publier » et le menu du compte", async () => {
    const { container } = renderWithProviders(<SiteHeader user={MEMBER} />);
    expect(screen.queryByRole("link", { name: "Se connecter" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publier un modèle" })).toHaveAttribute(
      "href",
      "/publish",
    );
    expect(screen.getByRole("button", { name: "Compte de lucie" })).toHaveTextContent("L");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AccountMenu", () => {
  it("ouvre le menu : paramètres et déconnexion", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu user={MEMBER} />);
    await user.click(screen.getByRole("button", { name: "Compte de lucie" }));
    expect(await screen.findByRole("menuitem", { name: "Paramètres du compte" })).toHaveAttribute(
      "href",
      "/me/settings",
    );
    expect(screen.queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.getByText("lucie@exemple.fr")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));
    expect(actions.signOutAction).toHaveBeenCalled();
  });

  it("propose l'administration à un administrateur", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu user={{ ...MEMBER, isAdmin: true }} />);
    await user.click(screen.getByRole("button", { name: "Compte de lucie" }));
    expect(await screen.findByRole("menuitem", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});

describe("UnverifiedBanner", () => {
  it("renvoie le lien et annonce le résultat", async () => {
    const user = userEvent.setup();
    actions.resendVerificationAction.mockResolvedValue({
      status: "success",
      message: "auth.unverified.sent",
      messageValues: { email: "lucie@exemple.fr" },
    });
    const { container } = renderWithProviders(<UnverifiedBanner email="lucie@exemple.fr" />);
    expect(screen.getByText(/le lien vous a été envoyé à lucie@exemple.fr/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Renvoyer le lien" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Nouveau lien envoyé à lucie@exemple.fr.",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DarkCtaPanel (membre)", () => {
  it("invite à publier", () => {
    renderWithProviders(<DarkCtaPanel member />);
    expect(screen.getByRole("heading", { name: "Votre atelier vous attend." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publier un modèle" })).toHaveAttribute(
      "href",
      "/publish",
    );
  });
});

describe("FlashToast", () => {
  it("affiche le message flash une seule fois puis efface le cookie", async () => {
    document.cookie = `canvatheque.flash=${encodeURIComponent(JSON.stringify({ key: "auth.flash.welcome", values: { pseudo: "Lucie" } }))}; Path=/`;
    renderWithProviders(
      <>
        <Toaster />
        <FlashToast />
      </>,
    );
    expect(
      await screen.findByText("Bienvenue Lucie ! Un e-mail de confirmation vient de partir."),
    ).toBeInTheDocument();
    expect(document.cookie).not.toContain("canvatheque.flash=");
  });

  it("ne fait rien sans cookie", async () => {
    renderWithProviders(
      <>
        <Toaster />
        <FlashToast />
      </>,
    );
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
