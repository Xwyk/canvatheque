import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { axe } from "@/tests/setup/axe";
import { setPathname } from "@/tests/setup/components";
import { renderWithProviders } from "@/tests/setup/render";

describe("MobileTabBar", () => {
  it("propose les quatre onglets de la maquette", async () => {
    setPathname("/");
    const { container } = renderWithProviders(<MobileTabBar />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Accueil",
      "Modèles",
      "Publier",
      "Favoris",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/models",
      "/publish",
      "/me/favorites",
    ]);
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("met en évidence l'onglet de la section courante", () => {
    setPathname("/me/favorites");
    renderWithProviders(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Favoris" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("aria-current");
  });
});
