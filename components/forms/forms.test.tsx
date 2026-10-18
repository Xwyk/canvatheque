import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { PasswordStrength, strengthLevel } from "@/components/forms/password-strength";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

describe("strengthLevel", () => {
  it.each([
    ["", null, "empty"],
    ["court", 4, "tooShort"],
    ["assez-long", null, "weak"],
    ["assez-long", 1, "weak"],
    ["assez-long", 2, "good"],
    ["assez-long", 3, "good"],
    ["assez-long", 4, "strong"],
  ] as const)("%s (score %s) → %s", (password, score, level) => {
    expect(strengthLevel(password, score)).toBe(level);
  });
});

describe("TextField", () => {
  it("relie libellé, aide et erreur au champ", async () => {
    const { container } = renderWithProviders(
      <TextField name="pseudo" label="Pseudo" hint="Aide" error="pseudoLength" />,
    );
    const input = screen.getByRole("textbox", { name: "Pseudo" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Entre 3 et 30 caractères. Aide");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("affiche tel quel un message hors catalogue", () => {
    renderWithProviders(<TextField name="x" label="X" error="Message libre" />);
    expect(screen.getByText("Message libre")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAccessibleDescription("Aide");
  });
});

describe("PasswordField", () => {
  it("affiche et masque le mot de passe", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <PasswordField name="password" label="Mot de passe" autoComplete="current-password" />,
    );
    const input = screen.getByLabelText("Mot de passe");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Masquer le mot de passe" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(input).toHaveAttribute("type", "password");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("évalue la robustesse pendant la saisie (zxcvbn chargé à la demande)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PasswordField
        name="password"
        label="Mot de passe"
        autoComplete="new-password"
        withStrength
        error="passwordCommon"
      />,
    );
    const live = screen.getByText("10 caractères minimum");
    await user.type(screen.getByLabelText("Mot de passe"), "court");
    expect(live).toHaveTextContent("Robustesse : trop court · 10 caractères minimum");
    await user.type(screen.getByLabelText("Mot de passe"), "-papillon-de-nuit-2026");
    await waitFor(() => expect(live).toHaveTextContent("Robustesse : excellente"), {
      timeout: 5000,
    });
    expect(
      screen.getByText("Ce mot de passe est trop courant : choisissez-en un autre."),
    ).toBeInTheDocument();
  });

  it("note faible un mot de passe long mais prévisible", async () => {
    renderWithProviders(<PasswordStrength password="aaaaaaaaaaaa" />);
    await waitFor(() => expect(screen.getByText(/Robustesse : faible/)).toBeInTheDocument(), {
      timeout: 5000,
    });
  });
});

describe("FormMessage", () => {
  it("annonce une erreur comme alerte et un succès comme statut", async () => {
    const { rerender, container } = renderWithProviders(
      <FormMessage
        state={{ status: "error", message: "errors.rateLimited", messageValues: { minutes: 3 } }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Trop de tentatives. Réessayez dans 3 minutes.",
    );
    expect(await axe(container)).toHaveNoViolations();
    rerender(<FormMessage state={{ status: "success", message: "settings.profileSaved" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Profil enregistré.");
    rerender(<FormMessage state={{ status: "idle" }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("SubmitButton", () => {
  it("est un bouton d'envoi, désactivé pendant l'envoi", async () => {
    let resolve: () => void = () => {};
    const action = () => new Promise<void>((r) => (resolve = r));
    const user = userEvent.setup();
    renderWithProviders(
      <form action={action}>
        <SubmitButton variant="outline">Envoyer</SubmitButton>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    const pending = await screen.findByRole("button", { name: "Un instant…" });
    expect(pending).toBeDisabled();
    await act(async () => resolve());
    expect(await screen.findByRole("button", { name: "Envoyer" })).toBeEnabled();
  });
});
