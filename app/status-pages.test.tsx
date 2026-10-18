import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("NotFound", () => {
  it("propose de revenir à l'accueil", async () => {
    const { container } = renderWithProviders(<NotFound />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Cette page s'est envolée" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ErrorPage", () => {
  it("permet de réessayer et affiche la référence", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    const { container } = renderWithProviders(<ErrorPage error={error} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByText("Référence : abc123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("omet la référence absente", () => {
    renderWithProviders(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.queryByText(/Référence/)).not.toBeInTheDocument();
  });
});

describe("GlobalError", () => {
  it("rend une page autonome, sans fournisseur, avec un bouton de nouvel essai", async () => {
    // Composant <html> complet : vérifié en rendu statique (interaction couverte en E2E).
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("Un fil s&#x27;est coincé");
    expect(html).toContain("Réessayer");
  });
});
