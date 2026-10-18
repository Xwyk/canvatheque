import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyCatalog } from "@/components/home/empty-catalog";
import { LatestSection, PopularSection } from "@/components/home/model-section";
import type { CatalogItem } from "@/features/catalog/search";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

function item(index: number): CatalogItem {
  return {
    id: `modele-${index}`,
    slug: `papillon-${index}`,
    title: `Papillon ${index}`,
    format: index % 2 ? "SVG" : "CWPRJ",
    preview: null,
    authorPseudo: "Brodeuse",
    authorSlug: "brodeuse",
    downloadCount: index * 3,
  };
}

const MODELS = Array.from({ length: 8 }, (_, index) => item(index + 1));

describe("LatestSection", () => {
  it("affiche les cartes et le lien « Tout voir » vers la galerie", async () => {
    const { container } = renderWithProviders(
      <LatestSection models={MODELS} empty={<EmptyCatalog />} />,
    );
    const section = screen.getByRole("region", { name: "Derniers modèles" });
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Derniers modèles",
    );
    const seeAll = within(section).getByRole("link", { name: "Tout voir les derniers modèles" });
    expect(seeAll).toHaveAttribute("href", "/models");

    const cards = within(section).getAllByRole("article");
    expect(cards).toHaveLength(8);
    expect(within(cards[0]!).getByRole("link", { name: "Papillon 1" })).toHaveAttribute(
      "href",
      "/models/papillon-1",
    );
    // Aperçus hors du premier écran : aucun chargement prioritaire.
    expect(container.querySelector("img[fetchpriority]")).toBeNull();
    expect(screen.queryByText("Publier un modèle")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("invite à publier quand le catalogue est vide", async () => {
    const { container } = renderWithProviders(
      <LatestSection models={[]} empty={<EmptyCatalog />} />,
    );
    const section = screen.getByRole("region", { name: "Derniers modèles" });
    expect(within(section).queryByRole("article")).not.toBeInTheDocument();
    expect(within(section).queryByRole("link", { name: /Tout voir/ })).not.toBeInTheDocument();
    expect(within(section).getByText("Le catalogue attend ses premiers modèles")).toBeVisible();
    expect(within(section).getByRole("link", { name: "Publier un modèle" })).toHaveAttribute(
      "href",
      "/publish",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PopularSection", () => {
  it("affiche quatre cartes et mène au tri par popularité", async () => {
    const { container } = renderWithProviders(<PopularSection models={MODELS.slice(0, 4)} />);
    const section = screen.getByRole("region", { name: "Populaires cette semaine" });
    expect(within(section).getAllByRole("article")).toHaveLength(4);
    expect(
      within(section).getByRole("link", { name: "Tout voir les modèles populaires" }),
    ).toHaveAttribute("href", "/models?sort=popular");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("est masquée sans modèle", () => {
    renderWithProviders(<PopularSection models={[]} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
