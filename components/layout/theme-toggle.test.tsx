import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("ThemeToggle", () => {
  it("bascule entre clair et sombre", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ThemeToggle />);

    const toDark = screen.getByRole("button", { name: "Activer le thème sombre" });
    await user.click(toDark);
    expect(
      await screen.findByRole("button", { name: "Activer le thème clair" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Activer le thème clair" }));
    expect(
      await screen.findByRole("button", { name: "Activer le thème sombre" }),
    ).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");

    expect(await axe(container)).toHaveNoViolations();
  });

  it("fournit le thème avec le nonce CSP", () => {
    renderWithProviders(
      <ThemeProvider nonce="nonce-test">
        <span>contenu</span>
      </ThemeProvider>,
    );
    expect(screen.getByText("contenu")).toBeInTheDocument();
  });
});
