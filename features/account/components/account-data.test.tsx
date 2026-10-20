import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ deleteAccountAction: vi.fn() }));
vi.mock("@/features/account/actions", () => actions);

import { DeleteAccountForm, ExportData } from "@/features/account/components/account-data";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

beforeEach(() => vi.clearAllMocks());

describe("ExportData", () => {
  it("lien de téléchargement du fichier JSON", async () => {
    const { container } = renderWithProviders(<ExportData />);
    const link = screen.getByRole("link", { name: "Exporter mes données" });
    expect(link).toHaveAttribute("href", "/api/me/export");
    expect(link).toHaveAttribute("download");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DeleteAccountForm", () => {
  it("demande confirmation puis envoie mode et mot de passe ; erreurs affichées", async () => {
    const user = userEvent.setup();
    actions.deleteAccountAction.mockResolvedValueOnce({
      status: "error",
      message: "errors.wrongPassword",
      fields: { password: "wrongPassword" },
      values: { mode: "DELETE_ALL" },
    });
    const { container } = renderWithProviders(<DeleteAccountForm isAdmin={false} />);
    expect(screen.getByRole("radio", { name: /Les transférer/ })).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("radio", { name: /Tout supprimer/ }));
    await user.type(screen.getByLabelText("Mot de passe actuel"), "secret");
    await user.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Supprimer définitivement votre compte ?",
    });
    expect(dialog).toHaveTextContent("Votre compte et tous vos modèles seront supprimés.");
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() => expect(actions.deleteAccountAction).toHaveBeenCalledOnce());
    const data = actions.deleteAccountAction.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(data)).toEqual({ mode: "DELETE_ALL", password: "secret" });
    expect(await screen.findAllByText("Mot de passe incorrect.")).not.toHaveLength(0);
  });

  it("annuler la confirmation n'envoie rien ; transfert expliqué", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeleteAccountForm isAdmin={false} />);
    await user.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("transférés à « Auteur supprimé »");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(actions.deleteAccountAction).not.toHaveBeenCalled();
  });

  it("administrateur : explication, pas de formulaire", () => {
    renderWithProviders(<DeleteAccountForm isAdmin />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Un administrateur ne peut pas supprimer/)).toBeInTheDocument();
  });

  it("mode manquant : message sous le choix", async () => {
    const user = userEvent.setup();
    actions.deleteAccountAction.mockResolvedValueOnce({
      status: "error",
      message: "errors.validation",
      fields: { mode: "deleteMode" },
    });
    renderWithProviders(<DeleteAccountForm isAdmin={false} />);
    await user.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    expect(await screen.findByText("Choisissez que faire de vos modèles.")).toBeInTheDocument();
  });
});
