import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({
  signUpAction: vi.fn(async () => ({ status: "idle" })),
  signInAction: vi.fn(async () => ({ status: "idle" })),
}));

import { AuthGateProvider, useAuthGate, type GateReason } from "@/components/auth/auth-gate";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

function Opener({ reason }: { reason: GateReason }) {
  const gate = useAuthGate();
  return (
    <button type="button" onClick={() => gate.open(reason, "/models/papillon?download=1")}>
      {gate.signedIn ? "connecté" : "ouvrir"}
    </button>
  );
}

describe("AuthGateProvider", () => {
  it("ouvre la modale d'inscription avec retour vers la fiche, onglets au clavier", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuthGateProvider signedIn={false}>
        <Opener reason="download" />
      </AuthGateProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ouvrir" }));
    const dialog = screen.getByRole("dialog", { name: "Créez un compte gratuit pour télécharger" });
    expect(dialog).toHaveAccessibleDescription(/Votre téléchargement démarre dès l'inscription/);
    expect(screen.getByRole("tab", { name: "Inscription" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Créer mon compte et télécharger" }),
    ).toBeInTheDocument();
    expect(dialog.querySelector('input[name="redirectTo"]')).toHaveValue(
      "/models/papillon?download=1",
    );
    expect(await axe(dialog)).toHaveNoViolations();

    // Flèches : bascule vers Connexion, focus déplacé.
    screen.getByRole("tab", { name: "Inscription" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Connexion" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Se connecter et télécharger" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer un compte" }));
    expect(screen.getByRole("tab", { name: "Inscription" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByRole("tab", { name: "Connexion" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("textes adaptés aux favoris et à la publication ; Échap ferme", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <AuthGateProvider signedIn={false}>
        <Opener reason="favorite" />
      </AuthGateProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ouvrir" }));
    expect(screen.getByRole("dialog", { name: /garder vos favoris/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer mon compte" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <AuthGateProvider signedIn={false}>
        <Opener reason="publish" />
      </AuthGateProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ouvrir" }));
    expect(screen.getByRole("dialog", { name: /pour publier/ })).toBeInTheDocument();
  });

  it("se ferme d'elle-même une fois connecté", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <AuthGateProvider signedIn={false}>
        <Opener reason="download" />
      </AuthGateProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ouvrir" }));
    rerender(
      <AuthGateProvider signedIn>
        <Opener reason="download" />
      </AuthGateProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "connecté" })).toBeInTheDocument();
  });
});
