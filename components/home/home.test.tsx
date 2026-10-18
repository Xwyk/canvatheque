import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryPill } from "@/components/category-pill";
import { CategoryBand } from "@/components/home/category-band";
import { DarkCtaPanel } from "@/components/home/dark-cta-panel";
import { HeroCards } from "@/components/home/hero-cards";
import { HomeHero } from "@/components/home/home-hero";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const CATEGORIES = [
  { slug: "cartes-et-papeterie", name: "Cartes et papeterie", color: "#C81E4B" },
  { slug: "nature-et-animaux", name: "Nature et animaux", color: "#0F7C7E" },
];

describe("HomeHero", () => {
  it("présente l'accroche, la recherche et les recherches populaires", async () => {
    const { container } = renderWithProviders(<HomeHero popularTags={["Mandala", "Boîtes"]} />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Des modèles de découpe, partagés par celles et ceux qui les créent.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("100 % gratuit · fait par la communauté")).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();

    const popular = screen.getByRole("list", { name: "Populaires :" });
    const links = within(popular).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/models?q=Mandala",
      "/models?q=Bo%C3%AEtes",
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("masque la ligne « Populaires » sans suggestion", () => {
    renderWithProviders(<HomeHero popularTags={[]} />);
    expect(screen.queryByText("Populaires :")).not.toBeInTheDocument();
  });
});

describe("HeroCards", () => {
  it("est une illustration masquée aux technologies d'assistance", () => {
    const { container } = renderWithProviders(<HeroCards />);
    expect(container.querySelector("div")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });
});

describe("CategoryBand", () => {
  it("liste les catégories avec leur pastille", async () => {
    const { container } = renderWithProviders(<CategoryBand categories={CATEGORIES} />);
    const section = screen.getByRole("region", { name: "Parcourir par catégorie" });
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/categories/cartes-et-papeterie",
      "/categories/nature-et-animaux",
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ne rend rien sans catégorie", () => {
    const { container } = renderWithProviders(<CategoryBand categories={[]} />);
    expect(container.querySelector("section")).toBeNull();
  });
});

describe("CategoryPill", () => {
  it("colore la pastille décorative", () => {
    const { container } = renderWithProviders(<CategoryPill category={CATEGORIES[1]!} />);
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot).toHaveStyle({ backgroundColor: "#0F7C7E" });
  });
});

describe("DarkCtaPanel", () => {
  it("invite à créer un compte gratuit", async () => {
    const { container } = renderWithProviders(<DarkCtaPanel />);
    expect(
      screen.getByRole("heading", { name: "Un compte gratuit, et tout s'ouvre." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer mon compte gratuit" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
