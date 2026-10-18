import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCatalogParams } from "@/features/catalog/params";
import type { CatalogItem } from "@/features/catalog/search";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";
import { BackToTop } from "./back-to-top";
import { CategoryIndex } from "./category-index";
import {
  galleryHref,
  isRefined,
  pickGalleryFilters,
  sortAfterSearch,
  toggleValue,
} from "./gallery-href";
import { GalleryScreen } from "./gallery-screen";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/models",
  useRouter: () => ({ ...router, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CATEGORIES = [
  { slug: "decoration", name: "Décoration", color: "#F5B82E" },
  { slug: "nature-et-animaux", name: "Nature et animaux", color: "#0F7C7E" },
];

function item(n: number): CatalogItem {
  return {
    id: `id-${n}`,
    slug: `modele-${n}`,
    title: `Modèle ${n}`,
    format: n % 2 ? "SVG" : "CWPRJ",
    preview: null,
    authorPseudo: "mamie-ciseaux",
    authorSlug: "mamie-ciseaux",
    downloadCount: n,
  };
}

const items = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => item(from + i));

type ScreenOptions = {
  query?: string;
  locked?: string | null;
  list?: CatalogItem[];
  nextCursor?: string | null;
  total?: number;
};

function renderScreen({
  query = "",
  locked = null,
  list = items(1, 3),
  nextCursor = null,
  total = list.length,
}: ScreenOptions = {}) {
  const filters = parseCatalogParams(new URLSearchParams(query));
  if (locked) filters.categories = [locked];
  return renderWithProviders(
    <GalleryScreen
      title="Tous les modèles"
      filters={filters}
      locked={locked}
      categories={CATEGORIES}
      items={list}
      nextCursor={nextCursor}
      total={total}
    />,
  );
}

beforeEach(() => {
  router.push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("URL de la galerie", () => {
  const base = parseCatalogParams(new URLSearchParams());

  it("construit une URL stable, sur /models ou sur la page de la catégorie", () => {
    expect(galleryHref(base)).toBe("/models");
    expect(galleryHref({ ...base, formats: ["svg"], sort: "downloads" })).toBe(
      "/models?format=svg&sort=downloads",
    );
    expect(galleryHref({ ...base, categories: ["deco"] }, "deco")).toBe("/categories/deco");
    expect(
      galleryHref({ ...base, q: "chat", sort: "relevance", categories: ["deco"] }, "deco"),
    ).toBe("/categories/deco?q=chat");
    expect(galleryHref({ ...base, categories: ["deco", "fetes"] }, "deco")).toBe(
      "/models?category=deco&category=fetes",
    );
    expect(galleryHref({ ...base, categories: [] }, "deco")).toBe("/models");
  });

  it("bascule les valeurs, choisit le tri après recherche et repère les URL affinées", () => {
    expect(toggleValue(["svg"], "cwprj")).toEqual(["svg", "cwprj"]);
    expect(toggleValue(["svg", "cwprj"], "svg")).toEqual(["cwprj"]);
    expect(sortAfterSearch("chat", "downloads")).toBe("relevance");
    expect(sortAfterSearch("", "relevance")).toBe("recent");
    expect(sortAfterSearch("", "popular")).toBe("popular");
    expect(isRefined(base)).toBe(false);
    expect(isRefined({ ...base, categories: ["deco"] }, "deco")).toBe(false);
    expect(isRefined({ ...base, sort: "popular" })).toBe(true);
    expect(
      pickGalleryFilters({ ...base, cursor: "x", limit: 3 } as typeof base),
    ).not.toHaveProperty("cursor");
  });
});

describe("GalleryScreen", () => {
  it("affiche recherche, filtres, compteur, puces actives et tri (planche Galerie)", async () => {
    const { container } = renderScreen({
      query: "q=papillon&format=svg&category=nature-et-animaux&license=free&tag=noel",
      total: 6,
    });

    expect(screen.getByRole("heading", { level: 1, name: "Tous les modèles" })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Rechercher un modèle" })).toHaveValue("papillon");

    const filters = screen.getByRole("complementary", { name: "Filtres" });
    expect(within(filters).getByRole("checkbox", { name: "SVG" })).toBeChecked();
    expect(
      within(filters).getByRole("checkbox", { name: "CWPRJ (CanvasWorkspace)" }),
    ).not.toBeChecked();
    expect(within(filters).getByRole("checkbox", { name: "Nature et animaux" })).toBeChecked();
    expect(within(filters).getByRole("checkbox", { name: "Libre, même commercial" })).toBeChecked();
    expect(
      within(filters).getByRole("checkbox", { name: "Libre, hors usage commercial" }),
    ).not.toBeChecked();
    expect(
      within(filters).getByRole("checkbox", { name: "Usage personnel uniquement" }),
    ).toBeInTheDocument();
    // Sans JavaScript : le formulaire GET conserve recherche et mots-clés.
    const form = container.querySelector("aside form")!;
    expect(form).toHaveAttribute("action", "/models");
    expect(form.querySelector('input[type="hidden"][name="q"]')).toHaveValue("papillon");
    expect(form.querySelector('input[type="hidden"][name="tag"]')).toHaveValue("noel");
    expect(screen.getAllByRole("button", { name: "Appliquer les filtres" })[0]).toHaveAttribute(
      "type",
      "submit",
    );

    expect(screen.getByText("6 modèles")).toHaveAttribute("aria-live", "polite");
    const chips = screen.getByRole("list", { name: "Filtres actifs" });
    expect(within(chips).getByRole("link", { name: "Retirer le filtre SVG" })).toHaveAttribute(
      "href",
      "/models?q=papillon&category=nature-et-animaux&license=free&tag=noel",
    );
    expect(within(chips).getByRole("link", { name: "Retirer le filtre #noel" })).toBeVisible();
    expect(
      within(chips).getByRole("link", { name: "Retirer le filtre Libre, même commercial" }),
    ).toBeVisible();

    const sort = screen.getByRole("combobox", { name: "Trier par" });
    expect(sort).toHaveValue("relevance");
    expect(
      within(sort)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Pertinence", "Plus récents", "Populaires cette semaine", "Plus téléchargés"]);
    expect(screen.getByRole("button", { name: "Filtres (4)" })).toBeVisible();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(3);
    expect(screen.getByRole("link", { name: "Modèle 1" })).toHaveAttribute(
      "href",
      "/models/modele-1",
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("met l'URL à jour à chaque filtre, sans rechargement ni retour en haut", async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(
      within(screen.getByRole("combobox", { name: "Trier par" })).queryByText("Pertinence"),
    ).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "SVG" }));
    expect(router.push).toHaveBeenLastCalledWith("/models?format=svg", { scroll: false });

    await user.click(screen.getByRole("checkbox", { name: "Décoration" }));
    await user.click(screen.getByRole("checkbox", { name: "Usage personnel uniquement" }));
    expect(router.push).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/models\?.*license=personal/),
      { scroll: false },
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Trier par" }), "downloads");
    expect(router.push).toHaveBeenLastCalledWith(expect.stringContaining("sort=downloads"), {
      scroll: false,
    });

    // Entrée dans le formulaire de filtres : rien n'est rechargé.
    const form = document.querySelector("aside form") as HTMLFormElement;
    expect(fireEvent.submit(form)).toBe(false);
  });

  it("cherche en conservant les filtres et en triant par pertinence", async () => {
    const user = userEvent.setup();
    renderScreen({ query: "format=cwprj&sort=popular" });
    const search = screen.getByRole("searchbox", { name: "Rechercher un modèle" });
    await user.type(search, "  étoile  {Enter}");
    expect(router.push).toHaveBeenLastCalledWith("/models?q=%C3%A9toile&format=cwprj", {
      scroll: false,
    });
    const hidden = screen.getByRole("search").querySelector('input[type="hidden"][name="format"]');
    expect(hidden).toHaveValue("cwprj");
  });

  it("retire une puce et passe le focus au compteur ; réinitialise les filtres", async () => {
    const user = userEvent.setup();
    renderScreen({ query: "format=svg&tag=noel", total: 2 });
    await user.click(screen.getByRole("link", { name: "Retirer le filtre SVG" }));
    expect(router.push).toHaveBeenLastCalledWith("/models?tag=noel", { scroll: false });
    expect(screen.getByText("2 modèles")).toHaveFocus();

    await user.click(screen.getAllByRole("link", { name: "Réinitialiser les filtres" })[0]!);
    expect(router.push).toHaveBeenLastCalledWith("/models", { scroll: false });

    // Clic avec modificateur : le navigateur ouvre le lien lui-même.
    router.push.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Retirer le filtre #noel" }), {
      ctrlKey: true,
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("préfiltre la page d'une catégorie et la quitte si on décoche la catégorie", async () => {
    const user = userEvent.setup();
    renderScreen({ locked: "decoration", query: "format=svg" });
    expect(screen.getByRole("checkbox", { name: "Décoration" })).toBeChecked();

    await user.click(screen.getAllByRole("link", { name: "Réinitialiser les filtres" })[0]!);
    expect(router.push).toHaveBeenLastCalledWith("/categories/decoration", { scroll: false });

    await user.click(screen.getByRole("checkbox", { name: "Décoration" }));
    expect(router.push).toHaveBeenLastCalledWith("/models?format=svg", { scroll: false });
  });

  it("ouvre les filtres en panneau latéral sous 1024 px", async () => {
    const user = userEvent.setup();
    renderScreen({ query: "format=svg", total: 1 });
    await user.click(screen.getByRole("button", { name: "Filtres (1)" }));
    const dialog = await screen.findByRole("dialog", { name: "Filtres" });
    expect(within(dialog).getByRole("checkbox", { name: "SVG" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Voir 1 modèle" })).toBeVisible();
    expect(await axe(dialog)).toHaveNoViolations();

    await user.click(within(dialog).getByRole("button", { name: "Fermer les filtres" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("propose l'état vide adapté : filtres, catégorie ou catalogue", async () => {
    const { container, unmount } = renderScreen({ query: "q=licorne", list: [], total: 0 });
    expect(screen.getByRole("heading", { name: "Aucun modèle ne correspond" })).toBeVisible();
    expect(screen.getByText("Aucun modèle")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Réinitialiser les filtres" }).at(-1),
    ).toHaveAttribute("href", "/models");
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    const category = renderScreen({ locked: "decoration", list: [], total: 0 });
    expect(
      screen.getByRole("heading", { name: "Aucun modèle dans cette catégorie pour l'instant" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Voir tous les modèles" })).toHaveAttribute(
      "href",
      "/models",
    );
    category.unmount();

    renderScreen({ list: [], total: 0 });
    expect(
      screen.getByRole("heading", { name: "Aucun modèle publié pour l'instant" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Publier un modèle" })).toHaveAttribute(
      "href",
      "/publish",
    );
  });
});

describe("défilement infini", () => {
  function page(list: CatalogItem[], nextCursor: string | null) {
    return { ok: true, json: async () => ({ items: list, nextCursor, total: null }) };
  }

  it("charge la page suivante avec « Charger plus » et place le focus sur la première nouvelle carte", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(page([item(3), item(4)], null));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = renderScreen({
      query: "format=svg",
      list: items(1, 3),
      nextCursor: "c1",
      total: 5,
    });

    const more = screen.getByRole("link", { name: "Charger plus de modèles" });
    // Sans JavaScript : lien vers la page suivante.
    expect(more).toHaveAttribute("href", "/models?format=svg&cursor=c1");
    await user.click(more);

    expect(fetchMock).toHaveBeenCalledWith("/api/models?format=svg&cursor=c1", {
      headers: { accept: "application/json" },
    });
    // Doublon (id-3) ignoré, nouvelle carte focalisée, plus de bouton.
    await waitFor(() => expect(screen.getByRole("link", { name: "Modèle 4" })).toHaveFocus());
    expect(screen.getAllByRole("link", { name: "Modèle 3" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Charger plus de modèles" })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("charge automatiquement à l'approche de la fin, affiche les squelettes puis gère l'erreur", async () => {
    let trigger: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof trigger) {
          trigger = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    let resolve: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(page([item(9)], null));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderScreen({ list: items(1, 2), nextCursor: "c1", total: 4 });

    act(() => trigger([{ isIntersecting: false }]));
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => trigger([{ isIntersecting: true }]));
    expect(
      await screen.findByRole("status", { name: "Chargement des modèles suivants" }),
    ).toBeVisible();
    // Un seul chargement à la fois.
    await user.click(screen.getByRole("link", { name: "Charger plus de modèles" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve(page([item(3)], "c2")));
    expect(await screen.findByRole("link", { name: "Modèle 3" })).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/models?cursor=c1", expect.anything());

    act(() => trigger([{ isIntersecting: true }]));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les modèles suivants n'ont pas pu être chargés.",
    );
    expect(screen.queryByRole("link", { name: "Charger plus de modèles" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: "Modèle 9" })).toHaveFocus();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/models?cursor=c2", expect.anything());
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("Revenir en haut", () => {
  it("apparaît après un long défilement et ramène le focus sur le titre", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <>
        <h1 id="titre" tabIndex={-1}>
          Tous les modèles
        </h1>
        <BackToTop targetId="titre" />
      </>,
    );
    expect(screen.queryByRole("button", { name: "Revenir en haut" })).toBeNull();

    act(() => {
      Object.defineProperty(window, "scrollY", { value: 2000, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    await user.click(screen.getByRole("button", { name: "Revenir en haut" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(screen.getByRole("heading", { name: "Tous les modèles" })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();

    act(() => {
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("button", { name: "Revenir en haut" })).toBeNull();
  });
});

describe("CategoryIndex", () => {
  it("liste les catégories avec pastille et nombre de modèles", async () => {
    const { container } = renderWithProviders(
      <CategoryIndex
        categories={[
          { slug: "decoration", name: "Décoration", color: "#F5B82E", icon: "flower-2", count: 12 },
          { slug: "enfants", name: "Enfants", color: "#C81E4B", icon: "baby", count: 1 },
          { slug: "autres", name: "Autres", color: "#221F3A", icon: "shapes", count: 0 },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Liste des catégories" });
    expect(within(list).getByRole("link", { name: /Décoration\s*12 modèles/ })).toHaveAttribute(
      "href",
      "/categories/decoration",
    );
    expect(screen.getByText("1 modèle")).toBeVisible();
    expect(screen.getByText("Aucun modèle")).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("annonce l'absence de catégories", () => {
    renderWithProviders(<CategoryIndex categories={[]} />);
    expect(screen.getByText("Aucune catégorie pour l'instant.")).toBeVisible();
  });
});
