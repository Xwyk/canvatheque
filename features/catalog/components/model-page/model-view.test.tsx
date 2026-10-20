import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ deleteModelAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/models/actions", () => actions);
vi.mock("@/features/reports/actions", () => ({ createReportAction: vi.fn() }));
vi.mock("@/features/admin/actions", () => ({}));
vi.mock("@/features/comments/actions", () => ({}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/models/papillon-ajoure",
  useSearchParams: () => new URLSearchParams(),
}));

import { clientOs, downloadHref } from "@/features/downloads/links";
import { ModelView } from "@/features/catalog/components/model-page/model-view";
import type { ModelPageData } from "@/features/catalog/model-page";
import type { CatalogItem } from "@/features/catalog/search";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const preview = {
  sm: "http://s3/p/m1/v-sm.webp",
  md: "http://s3/p/m1/v-md.webp",
  lg: "http://s3/p/m1/v-lg.webp",
  width: 1600,
  height: 1200,
};

const CANONICAL = "http://localhost:3000/models/papillon-ajoure";

function pageData(
  overrides: {
    model?: Partial<ModelPageData["model"]>;
    author?: Partial<ModelPageData["author"]>;
    rest?: Partial<Omit<ModelPageData, "model" | "author">>;
  } = {},
): ModelPageData {
  return {
    model: {
      id: "m1",
      slug: "papillon-ajoure",
      title: "Papillon ajouré",
      format: "CWPRJ",
      status: "PUBLISHED",
      hiddenReason: null,
      license: "CC_BY_NC",
      downloadCount: 874,
      publishedAt: new Date("2026-10-02T10:00:00Z"),
      updatedAt: new Date("2026-10-03T10:00:00Z"),
      fileSizeLabel: "184 Ko",
      categoryId: "c1",
      ...overrides.model,
    },
    author: {
      id: "u1",
      pseudo: "mamie-ciseaux",
      pseudoSlug: "mamie-ciseaux",
      hasProfile: true,
      ...overrides.author,
    },
    category: { slug: "nature-et-animaux", name: "Nature et animaux" },
    tags: ["carte de vœux", "papillon"],
    descriptionHtml: "<p>Un papillon aux <strong>ailes dentelées</strong>.</p>",
    descriptionText: "Un papillon aux ailes dentelées.",
    preview,
    canEdit: false,
    canModerate: false,
    canReport: true,
    ...overrides.rest,
  };
}

const item = (id: string, title: string): CatalogItem => ({
  id,
  slug: id,
  title,
  format: "SVG",
  preview: null,
  authorPseudo: "claire_cuts",
  authorSlug: "claire_cuts",
  downloadCount: 2,
});

function render(
  data: ModelPageData,
  extra: { similar?: CatalogItem[]; authorModels?: CatalogItem[]; os?: "mac" | "windows" } = {},
) {
  return renderWithProviders(
    <ModelView
      data={data}
      similar={extra.similar ?? []}
      authorModels={extra.authorModels ?? []}
      canonicalUrl={CANONICAL}
      os={extra.os ?? "windows"}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
});

describe("ModelView", () => {
  it("affiche la fiche d'un CWPRJ publié (planche Fiche)", async () => {
    const { container } = render(pageData(), {
      similar: [item("s1", "Papillon de nuit"), item("s2", "Feuille d'automne")],
      authorModels: [item("a1", "Étoile festive")],
    });

    const crumbs = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    expect(within(crumbs).getByRole("link", { name: "Modèles" })).toHaveAttribute(
      "href",
      "/models",
    );
    expect(within(crumbs).getByRole("link", { name: "Nature et animaux" })).toHaveAttribute(
      "href",
      "/categories/nature-et-animaux",
    );
    expect(within(crumbs).getByText("Papillon ajouré")).toHaveAttribute("aria-current", "page");

    expect(screen.getByRole("heading", { level: 1, name: "Papillon ajouré" })).toBeInTheDocument();
    expect(screen.getByText("Publié le 2 octobre 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mamie-ciseaux/ })).toHaveAttribute(
      "href",
      "/members/mamie-ciseaux",
    );

    const image = screen.getByRole("img", { name: "Aperçu de « Papillon ajouré »" });
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("fetchpriority", "high");

    const href = downloadHref("papillon-ajoure");
    for (const link of screen.getAllByRole("link", { name: /Ouvrir dans CanvasWorkspace/ })) {
      expect(link).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Télécharger le fichier · 184 Ko" })).toHaveAttribute(
      "href",
      href,
    );
    expect(screen.getByRole("link", { name: "Télécharger le fichier (184 Ko)" })).toHaveAttribute(
      "href",
      href,
    );
    expect(
      screen.getByRole("link", { name: "Le télécharger pour Windows ou macOS" }),
    ).toHaveAttribute("href", expect.stringContaining("canvasworkspace.brother.com"));
    expect(screen.getByText(/CanvasWorkspace s'utilise sur ordinateur/)).toBeInTheDocument();

    expect(screen.getByText("CC BY-NC")).toBeInTheDocument();
    expect(
      screen.getByText("Usage libre hors usage commercial, en vous citant."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "carte de vœux" })).toHaveAttribute(
      "href",
      "/models?tag=carte%20de%20v%C5%93ux",
    );
    expect(screen.getByText("874")).toBeInTheDocument();
    expect(screen.getByText("ailes dentelées").tagName).toBe("STRONG");

    expect(screen.getByRole("heading", { name: "Dans le même esprit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Papillon de nuit" })).toHaveAttribute(
      "href",
      "/models/s1",
    );
    expect(
      screen.getByRole("heading", { name: "Autres modèles de mamie-ciseaux" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir son profil" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("SVG : CTA « Télécharger le SVG », sans catégorie, licence, mots-clés ni description", async () => {
    const { container } = render(
      pageData({
        model: { format: "SVG", license: null, publishedAt: null },
        author: { hasProfile: false, pseudo: "Auteur supprimé" },
        rest: { category: null, tags: [], descriptionHtml: "", preview: null },
      }),
    );
    expect(screen.getAllByRole("link", { name: /Télécharger le SVG/ })).toHaveLength(2);
    expect(screen.getAllByText("Importable dans CanvasWorkspace · 184 Ko")).toHaveLength(2);
    expect(screen.queryByText(/Ouvrir dans CanvasWorkspace/)).not.toBeInTheDocument();
    expect(screen.getByText("Non classé")).toBeInTheDocument();
    expect(screen.getByText("Licence non précisée")).toBeInTheDocument();
    expect(screen.queryByText("Mots-clés")).not.toBeInTheDocument();
    expect(screen.getByText("L'auteur n'a pas encore ajouté de description.")).toBeInTheDocument();
    expect(screen.getByText("Aucun aperçu disponible")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Auteur supprimé/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Publié le/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dans le même esprit" })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("propose macOS en premier sur un Mac", () => {
    expect(clientOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(clientOs(null)).toBe("windows");
    render(pageData(), { os: "mac" });
    expect(
      screen.getByRole("link", { name: "Le télécharger pour macOS ou Windows" }),
    ).toBeInTheDocument();
  });

  it("brouillon sans fichier : bandeau neutre, aucune action de téléchargement", async () => {
    const { container } = render(
      pageData({ model: { status: "DRAFT", fileSizeLabel: null }, rest: { canEdit: true } }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Brouillon : non publié");
    expect(screen.queryByRole("link", { name: /Télécharger/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute(
      "href",
      "/models/papillon-ajoure/edit",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("affiche les commentaires quand la page les fournit", () => {
    renderWithProviders(
      <ModelView
        data={pageData()}
        similar={[]}
        authorModels={[]}
        canonicalUrl={CANONICAL}
        os="windows"
        comments={{ initial: { items: [], nextCursor: null }, total: 0 }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Commentaires" })).toBeInTheDocument();
  });

  it("modèle masqué : bandeau ambre avec motif", () => {
    render(pageData({ model: { status: "HIDDEN", hiddenReason: "Droits d'auteur" } }));
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Ce modèle est masqué");
    expect(banner).toHaveTextContent("Motif : Droits d'auteur");
    expect(banner).toHaveClass("bg-highlight-soft");
  });

  it("supprime le modèle après confirmation puis renvoie vers « Mon espace »", async () => {
    const user = userEvent.setup();
    actions.deleteModelAction.mockResolvedValueOnce({
      ok: true,
      data: { title: "Papillon ajouré" },
    });
    render(pageData({ rest: { canEdit: true } }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Supprimer « Papillon ajouré » ?");
    await user.click(within(dialog).getByRole("button", { name: "Supprimer définitivement" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/me"));
    expect(actions.deleteModelAction).toHaveBeenCalledWith({ modelId: "m1" });
    expect(toast.success).toHaveBeenCalledWith("« Papillon ajouré » a été supprimé.");
  });

  it("signale l'échec de la suppression", async () => {
    const user = userEvent.setup();
    actions.deleteModelAction
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "FORBIDDEN", message: "errors.forbidden" },
      })
      .mockResolvedValueOnce({ ok: false, error: { code: "X", message: "inconnu" } });
    render(pageData({ rest: { canEdit: true } }));
    for (const expected of ["Action non autorisée.", "Une erreur est survenue. Réessayez."]) {
      await user.click(screen.getByRole("button", { name: "Supprimer" }));
      await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expected));
    }
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("ShareButton", () => {
  it("utilise la feuille de partage du système quand elle existe", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new Error("AbortError"))
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(pageData());
    for (const button of screen.getAllByRole("button", { name: "Partager" })) {
      fireEvent.click(button);
    }
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(share).toHaveBeenCalledWith({ title: "Papillon ajouré", url: CANONICAL });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("copie le lien sinon, et signale un échec de copie", async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("refus"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(pageData());
    const [, pill] = screen.getAllByRole("button", { name: "Partager" });
    fireEvent.click(pill!);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Lien copié dans le presse-papiers."),
    );
    fireEvent.click(pill!);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(CANONICAL);
  });
});

describe("ZoomablePreview", () => {
  const transform = () =>
    screen.getByRole("img", { name: "Aperçu de « Papillon ajouré »" }).style.transform;

  function sized() {
    const viewport = screen.getByTestId("preview-viewport");
    Object.defineProperty(viewport, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 300, configurable: true });
    return viewport;
  }

  it("zoome avec les boutons, bornes comprises", async () => {
    const user = userEvent.setup();
    render(pageData());
    sized();
    const zoomIn = screen.getByRole("button", { name: "Agrandir l'aperçu" });
    const zoomOut = screen.getByRole("button", { name: "Réduire l'aperçu" });
    expect(zoomOut).toBeDisabled();
    await user.click(zoomIn);
    expect(transform()).toContain("scale(1.5)");
    expect(screen.getByText("Zoom 150 %")).toBeInTheDocument();
    for (let i = 0; i < 4; i += 1) if (!zoomIn.hasAttribute("disabled")) await user.click(zoomIn);
    expect(transform()).toContain("scale(4)");
    expect(zoomIn).toBeDisabled();
    for (let i = 0; i < 5; i += 1) if (!zoomOut.hasAttribute("disabled")) await user.click(zoomOut);
    expect(transform()).toBe("translate(0px, 0px) scale(1)");
  });

  it("zoome à la molette sans bloquer le défilement au zoom minimal", () => {
    render(pageData());
    const viewport = sized();
    const down = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    act(() => {
      viewport.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(false);
    const up = new WheelEvent("wheel", { deltaY: -200, cancelable: true });
    act(() => {
      viewport.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);
    expect(transform()).toMatch(/scale\(1\.49/);
    act(() => {
      viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, cancelable: true }));
    });
    expect(transform()).toMatch(/scale\(1\.49/);
  });

  it("déplace l'image agrandie (bornée) et zoome au pincement", () => {
    render(pageData());
    const viewport = sized();
    // Sans zoom, le glisser ne déplace rien.
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 150, clientY: 120 });
    expect(transform()).toBe("translate(0px, 0px) scale(1)");
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    // Pointeur inconnu : ignoré.
    fireEvent.pointerMove(viewport, { pointerId: 9, clientX: 0, clientY: 0 });

    // Pincement : écart doublé, zoom ×2.
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 300, clientY: 100 });
    expect(transform()).toContain("scale(2)");
    fireEvent.pointerUp(viewport, { pointerId: 2 });

    // Glisser à un doigt : déplacement borné à (zoom - 1) × taille / 2.
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 1000, clientY: 130 });
    expect(transform()).toBe("translate(200px, 30px) scale(2)");
    fireEvent.pointerCancel(viewport, { pointerId: 1 });
  });
});
