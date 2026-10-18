import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchForm } from "@/components/search-form";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("SearchForm", () => {
  it("soumet une recherche GET vers la galerie, sans JavaScript", async () => {
    const { container } = renderWithProviders(<SearchForm defaultValue="papillon" />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/models");
    expect(form).toHaveAttribute("method", "get");

    const input = screen.getByRole("searchbox", { name: "Rechercher un modèle" });
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveValue("papillon");
    expect(input).toHaveAttribute("placeholder", "Mandala, carte de vœux, lettrage…");

    // Bouton rond (mobile) et bouton pilule (desktop) : un seul visible selon la largeur.
    const buttons = screen.getAllByRole("button", { name: "Rechercher" });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.getAttribute("type") === "submit")).toBe(true);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("propose une taille compacte", () => {
    renderWithProviders(<SearchForm size="md" className="max-w-xl" />);
    expect(screen.getByRole("search")).toHaveClass("max-w-xl");
    expect(screen.getByRole("searchbox")).toHaveClass("h-[52px]");
  });
});
