import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormatBadge, ModelCard } from "@/components/model-card";
import { Stepper } from "@/components/stepper";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const preview = {
  sm: "http://s3/p/a-sm.webp",
  md: "http://s3/p/a-md.webp",
  lg: "http://s3/p/a-lg.webp",
  width: 1600,
  height: 1200,
};

describe("ModelCard", () => {
  it("affiche aperçu, badge, titre lié, auteur et téléchargements", async () => {
    const { container } = renderWithProviders(
      <ModelCard
        href="/models/papillon"
        model={{
          title: "Papillon ajouré",
          authorPseudo: "lucie.m",
          format: "SVG",
          preview,
          downloadCount: 12,
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Papillon ajouré" })).toHaveAttribute(
      "href",
      "/models/papillon",
    );
    expect(screen.getByText("par lucie.m")).toBeInTheDocument();
    expect(screen.getByText("12 téléchargements")).toBeInTheDocument();
    const image = container.querySelector("img")!;
    expect(image).toHaveAttribute("src", preview.sm);
    expect(image).toHaveAttribute("srcset", `${preview.sm} 400w, ${preview.md} 800w`);
    expect(image).toHaveAttribute("alt", "");
    expect(screen.getByText("SVG")).toHaveClass("bg-highlight");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("carte statique sans aperçu (forme décorative)", () => {
    const { container } = renderWithProviders(
      <ModelCard
        model={{ title: "Brouillon", authorPseudo: "x", format: "CWPRJ", preview: null }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(screen.queryByText(/téléchargement/)).toBeNull();
  });

  it("badge CWPRJ en encre", () => {
    renderWithProviders(<FormatBadge format="CWPRJ" />);
    expect(screen.getByText("CWPRJ")).toHaveClass("bg-ink");
  });
});

describe("Stepper", () => {
  const steps = [
    { label: "Fichier", done: true, enabled: true },
    { label: "Aperçu", done: false, enabled: true },
    { label: "Informations", done: false, enabled: false },
  ];

  it("marque l'étape courante et permet de revenir aux étapes accessibles", async () => {
    const onSelect = vi.fn();
    const { container } = renderWithProviders(
      <Stepper label="Étapes" steps={steps} current={1} onSelect={onSelect} />,
    );
    const list = screen.getByRole("list", { name: "Étapes" });
    expect(list.querySelector('[aria-current="step"]')).toHaveTextContent("Aperçu");
    await userEvent.click(screen.getByRole("button", { name: "Fichier" }));
    expect(onSelect).toHaveBeenCalledWith(0);
    // Étape courante et étape inaccessible : pas de bouton.
    expect(screen.queryByRole("button", { name: /Aperçu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Informations/ })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sans onSelect, simple liste", () => {
    renderWithProviders(<Stepper label="Étapes" steps={steps} current={0} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("ConfirmDialog", () => {
  it("confirme ou annule", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Supprimer « X » ?"
        description="Irréversible."
        confirmLabel="Supprimer définitivement"
        cancelLabel="Annuler"
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer « X » ?" });
    expect(dialog).toHaveAccessibleDescription("Irréversible.");
    await userEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("désactive la confirmation pendant l'action", () => {
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="T"
        description="D"
        confirmLabel="OK"
        cancelLabel="Annuler"
        pending
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });
});
