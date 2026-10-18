import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/layout/site-header";
import { axe } from "@/tests/setup/axe";
import { setPathname } from "@/tests/setup/components";
import { renderWithProviders } from "@/tests/setup/render";

describe("SiteHeader", () => {
  it("affiche le logo, la navigation et les actions visiteur", async () => {
    setPathname("/");
    const { container } = renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Canvathèque, accueil" })).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Modèles" })).toHaveAttribute("href", "/models");
    expect(within(nav).getByRole("link", { name: "Catégories" })).toHaveAttribute(
      "href",
      "/categories",
    );
    expect(within(nav).getByRole("link", { name: "Aide" })).toHaveAttribute("href", "/help");

    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Connexion" })).toHaveClass("md:hidden");
    expect(screen.getByRole("button", { name: "Activer le thème sombre" })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("signale la page courante dans la navigation", () => {
    setPathname("/models/papillon-ajoure");
    renderWithProviders(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Modèles" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Aide" })).not.toHaveAttribute("aria-current");
  });
});
