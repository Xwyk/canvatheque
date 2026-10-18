import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoMark } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("SiteFooter", () => {
  it("liste les pages d'information et légales", async () => {
    const { container } = renderWithProviders(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "Pied de page" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["À propos", "/about"],
      ["Aide", "/help"],
      ["Mentions légales", "/legal"],
      ["Confidentialité", "/legal/privacy"],
      ["CGU", "/legal/terms"],
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("LogoMark", () => {
  it("est décoratif", () => {
    const { container } = renderWithProviders(<LogoMark className="size-12" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("size-12");
  });
});
