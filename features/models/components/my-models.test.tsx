import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  unpublishModelAction: vi.fn(),
  deleteModelAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/features/models/actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { MyModels } from "@/features/models/components/my-models";
import type { MyModel } from "@/features/models/service";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const model = (overrides: Partial<MyModel>): MyModel => ({
  id: "m1",
  slug: "papillon",
  title: "Papillon",
  status: "PUBLISHED",
  format: "SVG",
  preview: null,
  downloadCount: 3,
  updatedAt: "2026-10-18T10:00:00.000Z",
  hiddenReason: null,
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("MyModels", () => {
  const models = [
    model({}),
    model({ id: "m2", slug: "brouillon", title: "Brouillon", status: "DRAFT", format: "CWPRJ" }),
    model({ id: "m3", slug: "masque", title: "Masqué", status: "HIDDEN" }),
  ];

  it("affiche état, lien de modification et date", async () => {
    const { container } = renderWithProviders(<MyModels models={models} authorPseudo="lucie.m" />);
    expect(screen.getByRole("link", { name: "Papillon" })).toHaveAttribute(
      "href",
      "/models/papillon/edit",
    );
    expect(screen.getByText("Publié")).toBeInTheDocument();
    expect(screen.getByText("Brouillon", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Masqué", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("Modifié le 18 oct. 2026")).toHaveLength(3);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("dépublie un modèle publié", async () => {
    const user = userEvent.setup();
    actions.unpublishModelAction.mockResolvedValueOnce({ ok: true, data: { slug: "papillon" } });
    renderWithProviders(<MyModels models={models} authorPseudo="lucie.m" />);
    await user.click(screen.getByRole("button", { name: "Actions pour « Papillon »" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dépublier" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Le modèle est repassé en brouillon."),
    );
    expect(actions.unpublishModelAction).toHaveBeenCalledWith({ modelId: "m1" });

    // Pas de « Dépublier » pour un brouillon.
    await user.click(screen.getByRole("button", { name: "Actions pour « Brouillon »" }));
    expect(await screen.findByRole("menuitem", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Dépublier" })).toBeNull();
  });

  it("supprime après confirmation, signale un échec", async () => {
    const user = userEvent.setup();
    actions.deleteModelAction.mockResolvedValueOnce({ ok: true, data: { title: "Papillon" } });
    renderWithProviders(<MyModels models={models} authorPseudo="lucie.m" />);
    await user.click(screen.getByRole("button", { name: "Actions pour « Papillon »" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Supprimer « Papillon » ?" });
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("« Papillon » a été supprimé."));
    expect(actions.deleteModelAction).toHaveBeenCalledWith({ modelId: "m1" });

    actions.deleteModelAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "FORBIDDEN", message: "errors.forbidden" },
    });
    await user.click(screen.getByRole("button", { name: "Actions pour « Brouillon »" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Action non autorisée."));

    actions.unpublishModelAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "inconnu" },
    });
    await user.click(screen.getByRole("button", { name: "Actions pour « Papillon »" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dépublier" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Une erreur est survenue. Réessayez."),
    );
  });

  it("annuler ferme la confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyModels models={models} authorPseudo="lucie.m" />);
    await user.click(screen.getByRole("button", { name: "Actions pour « Papillon »" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(actions.deleteModelAction).not.toHaveBeenCalled();
  });
});
