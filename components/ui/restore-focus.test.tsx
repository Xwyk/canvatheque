import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { renderWithProviders } from "@/tests/setup/render";

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Titre</DialogTitle>
          <button type="button">Dedans</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Confirm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Supprimer
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sûr ?"
        description="Irréversible"
        confirmLabel="Oui"
        cancelLabel="Non"
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

describe("retour du focus à la fermeture des dialogues", () => {
  it("dialogue ouvert par un état : Échap rend le focus au bouton", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Controlled />);
    const opener = screen.getByRole("button", { name: "Ouvrir" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("confirmation : Annuler rend le focus au bouton", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Confirm />);
    const opener = screen.getByRole("button", { name: "Supprimer" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Non" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
