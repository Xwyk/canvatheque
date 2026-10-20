import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ createReportAction: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/reports/actions", () => action);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/auth/actions", () => ({ signUpAction: vi.fn(), signInAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/models/papillon",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthGateProvider } from "@/components/auth/auth-gate";
import { ReportButton } from "@/features/reports/components/report-button";
import { reportSchema } from "@/features/reports/schemas";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

beforeEach(() => vi.clearAllMocks());

const renderButton = (signedIn = true) =>
  renderWithProviders(
    <AuthGateProvider signedIn={signedIn}>
      <ReportButton modelId="m1" title="Papillon" />
    </AuthGateProvider>,
  );

async function openDialog() {
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: "Signaler" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Signaler « Papillon »" }) };
}

describe("ReportButton", () => {
  it("envoie motif et précisions, puis remercie et ferme", async () => {
    action.createReportAction.mockResolvedValueOnce({ ok: true, data: { reportId: "r1" } });
    const { user, dialog } = await openDialog();
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(screen.getByRole("radio", { name: /Atteinte aux droits d'auteur/ }));
    await user.type(screen.getByLabelText("Précisions (facultatif)"), "Copie de mon modèle");
    expect(screen.getByText("981 caractères restants")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(action.createReportAction).toHaveBeenCalledWith({
      modelId: "m1",
      reason: "DROITS_AUTEUR",
      details: "Copie de mon modèle",
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Merci, votre signalement a été envoyé à l'équipe de modération.",
    );
  });

  it("affiche les erreurs de champ ; « Autre » rend les précisions obligatoires", async () => {
    action.createReportAction.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "errors.validation",
        fields: { reason: "reportReason", details: "reportDetailsRequired" },
      },
    });
    const { user } = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Autre motif/ }));
    expect(screen.getByLabelText("Précisions")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(await screen.findByText("Choisissez un motif.")).toBeInTheDocument();
    expect(screen.getByLabelText("Précisions")).toHaveAccessibleDescription(
      expect.stringContaining("Précisez le problème."),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("déjà signalé : message et fermeture ; limite : message, modale ouverte", async () => {
    action.createReportAction
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "RATE_LIMITED", message: "errors.rateLimited", retryAfter: 60 },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "CONFLICT", message: "errors.report.duplicate" },
      });
    const { user } = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Spam/ }));
    await user.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Vous avez envoyé beaucoup de signalements aujourd'hui : réessayez demain.",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.error).toHaveBeenLastCalledWith(
      "Vous avez déjà signalé ce modèle : il est en cours d'examen.",
    );
  });

  it("erreur inconnue : message générique ; Annuler et Fermer vident le formulaire", async () => {
    action.createReportAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "inconnu" },
    });
    const { user } = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Fichier défectueux/ }));
    await user.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Une erreur est survenue. Réessayez."),
    );
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Signaler" }));
    expect(screen.getByRole("radio", { name: /Fichier défectueux/ })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("visiteur : modale d'inscription", async () => {
    const user = userEvent.setup();
    renderButton(false);
    await user.click(screen.getByRole("button", { name: "Signaler" }));
    expect(
      screen.getByRole("dialog", { name: "Connectez-vous pour signaler ce modèle" }),
    ).toBeInTheDocument();
  });
});

describe("reportSchema", () => {
  it("valide motif et précisions", () => {
    expect(reportSchema.parse({ modelId: "m", reason: "SPAM" })).toEqual({
      modelId: "m",
      reason: "SPAM",
      details: null,
    });
    expect(
      reportSchema.safeParse({ modelId: "m", reason: "AUTRE", details: "  " }).error?.issues[0],
    ).toMatchObject({ path: ["details"], message: "reportDetailsRequired" });
    expect(reportSchema.safeParse({ modelId: "m", reason: "X" }).error?.issues[0]?.message).toBe(
      "reportReason",
    );
    expect(
      reportSchema.safeParse({ modelId: "m", reason: "SPAM", details: "x".repeat(1001) }).error
        ?.issues[0]?.message,
    ).toBe("reportDetailsLength");
  });
});
