import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentPage } from "@/features/content/content-page";
import { fillPlaceholders, inlineText } from "@/lib/inline-text";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("inlineText", () => {
  it("gras, liens internes, externes ; schéma refusé réduit au libellé", () => {
    render(
      <p>
        {inlineText(
          "Voir **ceci**, [l'aide](/help), [Brother](https://brother.com), [écrire](mailto:a@b.fr) et [piège](javascript:alert(1)) !",
        )}
      </p>,
    );
    expect(screen.getByText("ceci").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "l'aide" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Brother" })).toHaveAttribute("rel", "noopener");
    expect(screen.getByRole("link", { name: "écrire" })).toHaveAttribute("href", "mailto:a@b.fr");
    expect(screen.queryByRole("link", { name: "piège" })).toBeNull();
    expect(screen.getByText(/piège/)).toBeInTheDocument();
  });

  it("texte sans balisage et valeurs à remplacer", () => {
    expect(inlineText("simple")).toEqual(["simple"]);
    // Balisages incomplets ou invalides : laissés tels quels.
    for (const text of ["a ** b", "[x] y", "[x](y z)", "[x]("]) {
      expect(inlineText(text)).toEqual([text]);
    }
    expect(inlineText("[[x](/a)")[0]).toBe("[");
    expect(fillPlaceholders("{a} et {b}", { a: "1" })).toBe("1 et {b}");
  });
});

describe("ContentPage", () => {
  it("titre, sommaire relié aux sections, listes ; sans violation axe", async () => {
    const { container } = renderWithProviders(
      <ContentPage page="help" values={{ contact: "contact" }} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Aide" })).toBeInTheDocument();
    const toc = screen.getByRole("navigation", { name: "Sommaire" });
    expect(toc.querySelector('a[href="#canvasworkspace"]')).toHaveTextContent(
      "Ouvrir un .cwprj dans CanvasWorkspace",
    );
    expect(document.getElementById("canvasworkspace")?.querySelector("ol")).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("date de mise à jour des pages légales", () => {
    renderWithProviders(<ContentPage page="terms" />);
    expect(screen.getByText("Mise à jour le 20 octobre 2026")).toBeInTheDocument();
  });
});
