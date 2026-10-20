import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  hideModelAction: vi.fn(),
  unhideModelAction: vi.fn(),
  adminDeleteModelAction: vi.fn(),
  resolveReportAction: vi.fn(),
  dismissReportAction: vi.fn(),
  banMemberAction: vi.fn(),
  unbanMemberAction: vi.fn(),
  promoteMemberAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/admin/actions", () => actions);
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ActionLog } from "@/features/admin/components/action-log";
import {
  AdminSearch,
  AdminShell,
  EmptyState,
  FilterPills,
  listHref,
  ModelStatusBadge,
  Pagination,
} from "@/features/admin/components/admin-ui";
import {
  ModerationButton,
  type ModerationKind,
} from "@/features/admin/components/moderation-button";
import { ReportCard } from "@/features/admin/components/report-card";
import type { ReportView } from "@/features/admin/service";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

beforeEach(() => vi.clearAllMocks());

const OK = { ok: true, data: null };

describe("ModerationButton", () => {
  const cases: [ModerationKind, keyof typeof actions, string, unknown][] = [
    ["hide", "hideModelAction", "Masquer", { modelId: "t1", reason: "Raison" }],
    ["unhide", "unhideModelAction", "Réafficher", { modelId: "t1", reason: "Raison" }],
    ["deleteModel", "adminDeleteModelAction", "Supprimer", { modelId: "t1", reason: "Raison" }],
    [
      "resolveHide",
      "resolveReportAction",
      "Masquer le modèle",
      { reportId: "t1", reason: "Raison", modelAction: "HIDE" },
    ],
    [
      "resolveDelete",
      "resolveReportAction",
      "Supprimer le modèle",
      { reportId: "t1", reason: "Raison", modelAction: "DELETE" },
    ],
    [
      "resolveNone",
      "resolveReportAction",
      "Marquer comme traité",
      { reportId: "t1", reason: "Raison", modelAction: "NONE" },
    ],
    ["dismiss", "dismissReportAction", "Classer sans suite", { reportId: "t1", reason: "Raison" }],
    ["unban", "unbanMemberAction", "Lever le bannissement", { userId: "t1", reason: "Raison" }],
    ["promote", "promoteMemberAction", "Promouvoir", { userId: "t1", reason: "Raison" }],
  ];

  it.each(cases)(
    "%s : raison saisie puis action, message et rafraîchissement",
    async (kind, name, button, expected) => {
      const user = userEvent.setup();
      actions[name].mockResolvedValueOnce(OK);
      renderWithProviders(<ModerationButton kind={kind} targetId="t1" name="Papillon" />);
      await user.click(screen.getByRole("button", { name: button }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Raison"), "Raison");
      await user.click(within(dialog).getAllByRole("button").at(-1)!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(actions[name]).toHaveBeenCalledWith(expected);
      expect(toast.success).toHaveBeenCalledOnce();
      expect(router.refresh).toHaveBeenCalledOnce();
    },
  );

  it("bannir : option « masquer ses modèles », accessibilité de la modale", async () => {
    const user = userEvent.setup();
    actions.banMemberAction.mockResolvedValueOnce(OK);
    renderWithProviders(<ModerationButton kind="ban" targetId="u1" name="lucie" />);
    await user.click(screen.getByRole("button", { name: "Bannir" }));
    const dialog = screen.getByRole("dialog", { name: "Bannir lucie ?" });
    expect(await axe(dialog)).toHaveNoViolations();
    await user.type(within(dialog).getByLabelText("Raison"), "Spam");
    await user.click(within(dialog).getByRole("checkbox", { name: /Masquer aussi/ }));
    await user.click(within(dialog).getByRole("button", { name: "Bannir le membre" }));
    await waitFor(() =>
      expect(actions.banMemberAction).toHaveBeenCalledWith({
        userId: "u1",
        reason: "Spam",
        hideModels: true,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("lucie est banni.");
  });

  it("raison invalide : message sous le champ, modale ouverte", async () => {
    const user = userEvent.setup();
    actions.hideModelAction.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "errors.validation",
        fields: { reason: "reasonLength" },
      },
    });
    renderWithProviders(<ModerationButton kind="hide" targetId="m1" name="Papillon" />);
    await user.click(screen.getByRole("button", { name: "Masquer" }));
    await user.click(screen.getByRole("button", { name: "Masquer le modèle" }));
    expect(await screen.findByText("Entre 3 et 500 caractères.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("échec : message traduit (ou générique) et fermeture ; redirection après succès", async () => {
    const user = userEvent.setup();
    actions.adminDeleteModelAction
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "NOT_FOUND", message: "errors.notFound" },
      })
      .mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "inconnu" } })
      .mockResolvedValueOnce(OK);
    renderWithProviders(
      <ModerationButton
        kind="deleteModel"
        targetId="m1"
        name="Papillon"
        redirectTo="/admin/models"
      />,
    );
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole("button", { name: "Supprimer" }));
      await user.type(screen.getByLabelText("Raison"), "Illégal");
      await user.click(screen.getByRole("button", { name: "Supprimer le modèle" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    expect(toast.error.mock.calls.map(([message]) => message)).toEqual([
      "Ce modèle est introuvable.",
      "Une erreur est survenue. Réessayez.",
    ]);
    expect(router.push).toHaveBeenCalledWith("/admin/models");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("Annuler et Fermer referment sans agir", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModerationButton kind="promote" targetId="u1" name="lucie" />);
    await user.click(screen.getByRole("button", { name: "Promouvoir" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await user.click(screen.getByRole("button", { name: "Promouvoir" }));
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.promoteMemberAction).not.toHaveBeenCalled();
  });
});

const report = (overrides: Partial<ReportView> = {}, model: Partial<ReportView["model"]> = {}) =>
  ({
    id: "r1",
    reason: "FICHIER_DEFECTUEUX",
    details: "Contour ouvert",
    status: "OPEN",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    resolvedAt: null,
    resolution: null,
    reporter: { pseudo: "atelier-noa" },
    resolvedBy: null,
    ...overrides,
    model: {
      id: "m1",
      slug: "papillon",
      title: "Papillon",
      status: "PUBLISHED",
      format: "SVG",
      deleted: false,
      preview: null,
      author: { pseudo: "lucie", pseudoSlug: "lucie" },
      openReports: 3,
      ...model,
    },
  }) satisfies ReportView;

describe("ReportCard", () => {
  it("signalement ouvert d'un modèle publié : détails, autres signalements, actions", async () => {
    const { container } = renderWithProviders(<ReportCard report={report()} />);
    const card = screen.getByRole("article", { name: "Papillon" });
    expect(card).toHaveTextContent("Fichier défectueux");
    expect(card).toHaveTextContent("Modèle de lucie · Signalé par atelier-noa, le 20 octobre 2026");
    expect(card).toHaveTextContent("Contour ouvert");
    expect(card).toHaveTextContent("2 autres signalements ouverts sur ce modèle");
    expect(screen.getByRole("link", { name: "Papillon" })).toHaveAttribute(
      "href",
      "/models/papillon",
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Masquer le modèle",
      "Supprimer le modèle",
      "Classer sans suite",
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("modèle masqué ou supprimé : « Marquer comme traité » ; version compacte sans actions", () => {
    const { unmount } = renderWithProviders(
      <ReportCard report={report({ details: null }, { status: "HIDDEN", openReports: 1 })} />,
    );
    expect(screen.getByText("Masqué")).toBeInTheDocument();
    expect(screen.getByText("Aucune précision.")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Supprimer le modèle",
      "Marquer comme traité",
      "Classer sans suite",
    ]);
    unmount();

    const deleted = renderWithProviders(<ReportCard report={report({}, { deleted: true })} />);
    expect(screen.getByText("Modèle supprimé")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Marquer comme traité",
      "Classer sans suite",
    ]);
    deleted.unmount();

    renderWithProviders(<ReportCard report={report()} compact />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Contour ouvert")).toBeNull();
  });

  it("signalement traité : issue, auteur et raison", () => {
    renderWithProviders(
      <ReportCard
        report={report({
          status: "DISMISSED",
          resolvedAt: new Date("2026-10-21T10:00:00Z"),
          resolution: "Non fondé",
          resolvedBy: { pseudo: "admin" },
        })}
      />,
    );
    expect(screen.getByText("Classé sans suite par admin, le 21 octobre 2026")).toBeInTheDocument();
    expect(screen.getByText("Raison : Non fondé")).toBeInTheDocument();
    expect(screen.queryByText(/autres signalements/)).toBeNull();
  });
});

describe("gabarit d'administration", () => {
  it("sous-navigation avec le nombre de signalements, page courante marquée", async () => {
    const { container } = renderWithProviders(
      <AdminShell current="/admin/reports" openReports={4} title="Signalements">
        <EmptyState>Rien</EmptyState>
      </AdminShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Signalements" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections de l'administration" });
    expect(within(nav).getByRole("link", { name: "Signalements (4)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Journal" })).not.toHaveAttribute("aria-current");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("filtres, recherche, pagination, badges", async () => {
    const { container } = renderWithProviders(
      <>
        <FilterPills
          label="Filtres"
          items={[
            { href: "/a", label: "Tous", active: true },
            { href: "/a?f=b", label: "Bannis", active: false },
          ]}
        />
        <AdminSearch
          action="/admin/members"
          label="Rechercher un membre"
          placeholder="Pseudo"
          submit="Rechercher"
          defaultValue="lu"
          keep={{ filter: "banned" }}
        />
        <Pagination page={2} hasNext href={(page) => `/x?page=${page}`} />
        <ModelStatusBadge status="DRAFT" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Tous" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("searchbox", { name: "Rechercher un membre" })).toHaveValue("lu");
    expect(container.querySelector('input[type="hidden"][name="filter"]')).toHaveValue("banned");
    expect(screen.getByRole("link", { name: "Page précédente" })).toHaveAttribute(
      "href",
      "/x?page=1",
    );
    expect(screen.getByRole("link", { name: "Page suivante" })).toHaveAttribute(
      "href",
      "/x?page=3",
    );
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("pagination : rien sur une page unique ; extrémités sans lien", () => {
    const { rerender } = renderWithProviders(
      <Pagination page={1} hasNext={false} href={() => "/"} />,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    rerender(<Pagination page={1} hasNext href={() => "/n"} />);
    expect(screen.queryByRole("link", { name: "Page précédente" })).toBeNull();
    rerender(<Pagination page={3} hasNext={false} href={() => "/p"} />);
    expect(screen.queryByRole("link", { name: "Page suivante" })).toBeNull();
  });

  it("listHref omet les valeurs vides et la première page", () => {
    expect(listHref("/admin/models", { q: "", status: undefined, page: 1 })).toBe("/admin/models");
    expect(listHref("/admin/models", { q: "lapin", status: "HIDDEN", page: 2 })).toBe(
      "/admin/models?q=lapin&status=HIDDEN&page=2",
    );
  });

  it("journal : type, cible, raison, auteur et date", () => {
    renderWithProviders(
      <ActionLog
        actions={[
          {
            id: "a1",
            type: "MODEL_HIDE",
            targetType: "Model",
            targetId: "m1",
            createdAt: new Date("2026-10-20T10:00:00Z"),
            admin: { pseudo: "admin" },
            reason: "Copie",
            label: "Papillon",
          },
          {
            id: "a2",
            type: "USER_BAN",
            targetType: "User",
            targetId: "u1",
            createdAt: new Date("2026-10-20T11:00:00Z"),
            admin: { pseudo: "admin" },
            reason: null,
            label: null,
          },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Modèle masqué · « Papillon »");
    expect(items[0]).toHaveTextContent("Raison : Copie");
    expect(items[0]).toHaveTextContent("admin · 20 oct. 2026, 12:00");
    expect(items[1]).toHaveTextContent("Membre banni");
    expect(items[1]).not.toHaveTextContent("Raison");
  });
});
