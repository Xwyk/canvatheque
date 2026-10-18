import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberProfileView } from "@/features/catalog/components/member/member-profile";
import type { MemberProfile } from "@/features/catalog/member";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const profile = (overrides: Partial<MemberProfile> = {}): MemberProfile => ({
  pseudo: "lucie.m",
  pseudoSlug: "lucie-m",
  bio: "Je découpe du papier depuis 2019.\nCartes et boîtes surtout.",
  website: "https://www.atelier-lucie.fr/",
  createdAt: new Date("2026-03-04T10:00:00Z"),
  stats: { models: 2, downloads: 1 },
  models: [
    {
      id: "m1",
      slug: "etoile-festive",
      title: "Étoile festive",
      format: "CWPRJ",
      preview: null,
      authorPseudo: "lucie.m",
      authorSlug: "lucie-m",
      downloadCount: 1,
    },
  ],
  ...overrides,
});

describe("MemberProfileView", () => {
  it("affiche avatar, pseudo, bio, lien, statistiques et modèles", async () => {
    const { container } = renderWithProviders(<MemberProfileView profile={profile()} />);
    expect(screen.getByRole("heading", { level: 1, name: "lucie.m" })).toBeInTheDocument();
    expect(screen.getByText("Membre depuis mars 2026")).toBeInTheDocument();
    expect(screen.getByText(/Je découpe du papier/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /atelier-lucie\.fr/ });
    expect(link).toHaveAttribute("href", "https://www.atelier-lucie.fr/");
    expect(link).toHaveAttribute("rel", "nofollow ugc noopener");
    expect(link).toHaveTextContent("Site web : atelier-lucie.fr");
    const stats = screen.getByRole("list", { name: "Statistiques" });
    expect(stats).toHaveTextContent("2 modèles publiés");
    expect(stats).toHaveTextContent("1 téléchargement");
    expect(screen.getByRole("heading", { name: "Ses modèles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Étoile festive" })).toHaveAttribute(
      "href",
      "/models/etoile-festive",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("profil sans bio ni modèle, lien avec chemin", async () => {
    const { container } = renderWithProviders(
      <MemberProfileView
        profile={profile({
          bio: null,
          website: "https://exemple.fr/atelier/",
          stats: { models: 0, downloads: 0 },
          models: [],
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /exemple\.fr\/atelier$/ })).toBeInTheDocument();
    expect(screen.getByText("Aucun modèle publié")).toBeInTheDocument();
    expect(screen.getByText("lucie.m n'a pas encore publié de modèle.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
