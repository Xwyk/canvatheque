import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ toggleFavoriteAction: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/favorites/actions", () => action);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/auth/actions", () => ({ signUpAction: vi.fn(), signInAction: vi.fn() }));

import { AuthGateProvider } from "@/components/auth/auth-gate";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

beforeEach(() => vi.clearAllMocks());

const renderButton = (signedIn: boolean, variant?: "card" | "pill" | "icon", favorited = false) =>
  renderWithProviders(
    <AuthGateProvider signedIn={signedIn}>
      <div className="relative">
        <FavoriteButton modelId="m1" title="Papillon" favorited={favorited} variant={variant} />
      </div>
    </AuthGateProvider>,
  );

describe("FavoriteButton", () => {
  it("ajoute puis retire, état confirmé par le serveur", async () => {
    const user = userEvent.setup();
    action.toggleFavoriteAction
      .mockResolvedValueOnce({ ok: true, data: { favorited: true, favoriteCount: 1 } })
      .mockResolvedValueOnce({ ok: true, data: { favorited: false, favoriteCount: 0 } });
    const { container } = renderButton(true);
    const button = screen.getByRole("button", { name: "Ajouter « Papillon » aux favoris" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retirer « Papillon » des favoris" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(action.toggleFavoriteAction).toHaveBeenCalledWith("m1");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: /Retirer/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ajouter/ })).toBeInTheDocument(),
    );
  });

  it("revient en arrière et prévient en cas d'échec", async () => {
    const user = userEvent.setup();
    action.toggleFavoriteAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "NOT_FOUND", message: "errors.notFound" },
    });
    renderButton(true, "pill");
    await user.click(screen.getByRole("button", { name: "Favori" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ce modèle est introuvable."));
    expect(screen.getByRole("button", { name: "Favori" })).toHaveAttribute("aria-pressed", "false");

    action.toggleFavoriteAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "inconnu" },
    });
    await user.click(screen.getByRole("button", { name: "Favori" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith("Une erreur est survenue. Réessayez."),
    );
  });

  it("visiteur : ouvre la modale d'inscription sans appeler le serveur", async () => {
    const user = userEvent.setup();
    renderButton(false, "icon", false);
    await user.click(screen.getByRole("button", { name: /Ajouter « Papillon »/ }));
    expect(screen.getByRole("dialog", { name: /garder vos favoris/ })).toBeInTheDocument();
    expect(action.toggleFavoriteAction).not.toHaveBeenCalled();
  });

  it("pilule active pour un favori existant", () => {
    renderButton(true, "pill", true);
    expect(screen.getByRole("button", { name: "Dans vos favoris" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
