import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  loadCommentsAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/comments/actions", () => actions);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/auth/actions", () => ({ signUpAction: vi.fn(), signInAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/models/papillon",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthGateProvider } from "@/components/auth/auth-gate";
import { CommentsSection } from "@/features/comments/components/comments-section";
import { commentSchema } from "@/features/comments/schemas";
import type { CommentView } from "@/features/comments/service";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

beforeEach(() => vi.clearAllMocks());

const comment = (id: string, overrides: Partial<CommentView> = {}): CommentView => ({
  id,
  content: `Commentaire ${id}`,
  createdAt: new Date("2026-10-20T10:00:00Z"),
  author: { pseudo: `membre-${id}`, pseudoSlug: `membre-${id}`, hasProfile: true },
  canDelete: false,
  ...overrides,
});

const renderSection = ({
  signedIn = true,
  items = [comment("c1")],
  nextCursor = null as string | null,
  total = 1,
} = {}) =>
  renderWithProviders(
    <AuthGateProvider signedIn={signedIn}>
      <CommentsSection modelId="m1" initial={{ items, nextCursor }} total={total} />
    </AuthGateProvider>,
  );

describe("CommentsSection", () => {
  it("liste, publication en tête et compteur ; sans violation axe", async () => {
    const user = userEvent.setup();
    actions.createCommentAction.mockResolvedValueOnce({
      ok: true,
      data: comment("c2", { content: "Très joli !" }),
    });
    const { container } = renderSection();
    expect(screen.getByRole("heading", { level: 2, name: "1 commentaire" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "membre-c1" })).toHaveAttribute(
      "href",
      "/members/membre-c1",
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Votre commentaire"), "Très joli !");
    expect(screen.getByText("989 caractères restants")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publier le commentaire" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "2 commentaires" })).toBeInTheDocument(),
    );
    expect(actions.createCommentAction).toHaveBeenCalledWith({
      modelId: "m1",
      content: "Très joli !",
    });
    const items = screen.getAllByRole("article");
    expect(items[0]).toHaveTextContent("Très joli !");
    expect(screen.getByLabelText("Votre commentaire")).toHaveValue("");
    expect(toast.success).toHaveBeenCalledWith("Commentaire publié.");
  });

  it("erreurs : champ, limite, autre", async () => {
    const user = userEvent.setup();
    actions.createCommentAction
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { content: "commentRequired" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "RATE_LIMITED", message: "x", retryAfter: 9 },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "NOT_FOUND", message: "errors.notFound" },
      });
    renderSection({ items: [], total: 0 });
    expect(screen.getByText(/Aucun commentaire pour l'instant/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Publier le commentaire" });
    await user.click(submit);
    expect(await screen.findByText("Écrivez votre commentaire.")).toBeInTheDocument();
    await user.click(submit);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Vous avez beaucoup commenté : réessayez dans une heure.",
      ),
    );
    await user.click(submit);
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("Ce modèle est introuvable."));
  });

  it("supprimer après confirmation ; échec signalé", async () => {
    const user = userEvent.setup();
    actions.deleteCommentAction
      .mockResolvedValueOnce({ ok: false, error: { code: "FORBIDDEN", message: "inconnu" } })
      .mockResolvedValueOnce({ ok: true, data: null });
    renderSection({
      items: [comment("c1", { canDelete: true }), comment("c2")],
      total: 2,
    });
    expect(screen.getAllByRole("button", { name: /Supprimer le commentaire/ })).toHaveLength(1);
    const remove = screen.getByRole("button", { name: "Supprimer le commentaire de membre-c1" });
    await user.click(remove);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Une erreur est survenue. Réessayez."),
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await user.click(remove);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
    );
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(actions.deleteCommentAction).toHaveBeenLastCalledWith({ commentId: "c1" });
    expect(screen.getByRole("heading", { level: 2, name: "1 commentaire" })).toBeInTheDocument();
  });

  it("charge les commentaires plus anciens ; échec signalé", async () => {
    const user = userEvent.setup();
    actions.loadCommentsAction
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "NOT_FOUND", message: "errors.notFound" },
      })
      .mockResolvedValueOnce({ ok: true, data: { items: [comment("c9")], nextCursor: null } });
    renderSection({ nextCursor: "curseur", total: 21 });
    const more = screen.getByRole("button", { name: "Afficher les commentaires plus anciens" });
    await user.click(more);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await user.click(more);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(actions.loadCommentsAction).toHaveBeenLastCalledWith({
      modelId: "m1",
      cursor: "curseur",
    });
    expect(screen.queryByRole("button", { name: /plus anciens/ })).toBeNull();
  });

  it("visiteur : invitation à se connecter (modale) ; auteur sans profil sans lien", async () => {
    const user = userEvent.setup();
    renderSection({
      signedIn: false,
      items: [
        comment("c1", {
          author: { pseudo: "Auteur supprimé", pseudoSlug: "auteur-supprime", hasProfile: false },
        }),
      ],
    });
    expect(screen.queryByLabelText("Votre commentaire")).toBeNull();
    expect(screen.queryByRole("link", { name: "Auteur supprimé" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Se connecter pour commenter" }));
    expect(
      await screen.findByRole("dialog", { name: "Connectez-vous pour commenter" }),
    ).toBeInTheDocument();
  });
});

describe("commentSchema", () => {
  it("texte de 1 à 1 000 caractères, espaces retirés", () => {
    expect(commentSchema.parse({ modelId: "m", content: "  Bravo  " }).content).toBe("Bravo");
    expect(
      commentSchema.safeParse({ modelId: "m", content: "   " }).error?.issues[0]?.message,
    ).toBe("commentRequired");
    expect(
      commentSchema.safeParse({ modelId: "m", content: "x".repeat(1001) }).error?.issues[0]
        ?.message,
    ).toBe("commentLength");
  });
});
