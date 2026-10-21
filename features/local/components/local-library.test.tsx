import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
const store = vi.hoisted(() => ({
  loadLibrary: vi.fn(async () => null as unknown),
  saveLibrary: vi.fn(async () => {}),
  forgetLibrary: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/local",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/local/store", () => store);
vi.mock("@/features/auth/actions", () => ({ signUpAction: vi.fn(), signInAction: vi.fn() }));

import { AuthGateProvider } from "@/components/auth/auth-gate";
import { LocalLibrary } from "@/features/local/components/local-library";
import { takeHandedOffFile } from "@/features/local/handoff";
import { directHasher } from "@/features/local/hasher";
import type { LocalEntry } from "@/features/local/scan";
import type { DirectoryHandleLike } from "@/features/local/walk";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
const fetchMock = vi.fn();
const terminate = vi.fn();
const hasherFactory = () => ({ hash: directHasher, terminate });

const file = (relative: string, content: string, lastModified = Date.now()) => {
  const result = new File([content], relative.split("/").pop()!, { lastModified });
  Object.defineProperty(result, "webkitRelativePath", { value: relative });
  return result;
};

const folder = () => [
  file("Modèles/etoile.svg", SVG),
  file("Modèles/Noël/etoile-copie.svg", SVG),
  file("Modèles/Noël/couronne.cwprj", "projet chiffré"),
  file("Modèles/.cache/cache.svg", SVG),
  file("Modèles/notes.txt", "texte"),
];

beforeEach(() => {
  vi.clearAllMocks();
  store.loadLibrary.mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:apercu");
  URL.revokeObjectURL = vi.fn();
  takeHandedOffFile();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

function renderLibrary({ signedIn = false, preview = true } = {}) {
  return renderWithProviders(
    <AuthGateProvider signedIn={signedIn}>
      <LocalLibrary
        maxFileBytes={1024}
        cwprjPreviewEnabled={preview}
        hasherFactory={hasherFactory}
      />
    </AuthGateProvider>,
  );
}

async function chooseFolder(files = folder()) {
  fireEvent.change(screen.getByLabelText("Dossier à analyser"), { target: { files } });
  return screen.findByRole("heading", { name: "Dossier « Modèles »" });
}

describe("LocalLibrary", () => {
  it("accueil : promesse de confidentialité, bouton, sans violation axe", async () => {
    const { container } = renderLibrary();
    expect(screen.getByRole("note")).toHaveTextContent("Tout reste sur votre ordinateur");
    expect(screen.getByRole("button", { name: "Choisir un dossier" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("analyse : synthèse, doublons, aperçus SVG locaux, filtres, liste ; aucun appel réseau", async () => {
    const user = userEvent.setup();
    const { container } = renderLibrary();
    await chooseFolder();
    const summary = screen.getByRole("region", { name: "Synthèse" });
    expect(summary).toHaveTextContent("3 modèles");
    expect(summary).toHaveTextContent("2 SVG · 1 CWPRJ");
    expect(summary).toHaveTextContent("2 fichiers en double");
    expect(screen.getByRole("region", { name: "Doublons" })).toHaveTextContent(
      "etoile.svg · 2 copies identiques",
    );
    const card = screen.getByRole("article", { name: "etoile.svg" });
    expect(card.querySelector("img")).toHaveAttribute("src", "blob:apercu");
    expect(screen.queryByRole("article", { name: "cache.svg" })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByRole("searchbox", { name: "Rechercher un fichier" }), "noel");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.clear(screen.getByRole("searchbox", { name: "Rechercher un fichier" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Format" }), "CWPRJ");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Format" }), "all");
    // Arborescence : sélectionner un dossier, le replier, revenir au dossier entier.
    const tree = screen.getByRole("navigation", { name: "Dossiers" });
    await user.click(within(tree).getByRole("button", { name: /^Noël/ }));
    expect(within(tree).getByRole("button", { name: /^Noël/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(within(tree).getByRole("button", { name: "Replier « Modèles »" }));
    expect(within(tree).queryByRole("button", { name: /^Noël/ })).toBeNull();
    await user.click(within(tree).getByRole("button", { name: "Déplier « Modèles »" }));
    await user.click(within(tree).getByRole("button", { name: /^Modèles/ }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await user.selectOptions(screen.getByRole("combobox", { name: "Trier par" }), "size");
    await user.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.getByRole("table", { name: "Fichiers du dossier" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Rechercher un fichier" }), "zzz");
    expect(screen.getByText("Aucun fichier ne correspond à ces critères.")).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.saveLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ folderName: "Modèles", entries: expect.any(Array) }),
    );
    const saved = (store.saveLibrary.mock.calls as unknown[][])[0]![0] as { entries: LocalEntry[] };
    expect(JSON.stringify(saved)).not.toContain("<svg");
  });

  it("vérifier sur Canvathèque : seules les empreintes partent, badge vers la fiche", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await chooseFolder();
    const svgChecksum = (
      (store.saveLibrary.mock.calls as unknown[][])[0]![0] as { entries: LocalEntry[] }
    ).entries.find((entry) => entry.name === "etoile.svg")!.checksum;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ matches: [{ checksum: svgChecksum, slug: "etoile", title: "Étoile" }] }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Vérifier sur Canvathèque" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("1 fichier est déjà publié sur Canvathèque."),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/local/lookup");
    expect(JSON.parse(init.body).checksums).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Voir « Étoile » sur Canvathèque" })).toHaveLength(
      2,
    );

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await user.click(screen.getByRole("button", { name: "Vérifier sur Canvathèque" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "La vérification a échoué. Réessayez dans un instant.",
      ),
    );
  });

  it("publier : visiteur → modale ; membre → assistant avec le fichier transmis", async () => {
    const user = userEvent.setup();
    const visitor = renderLibrary();
    await chooseFolder();
    await user.click(screen.getByRole("button", { name: "Publier « etoile.svg »" }));
    expect(
      await screen.findByRole("dialog", { name: "Créez un compte gratuit pour publier" }),
    ).toBeInTheDocument();
    visitor.unmount();

    renderLibrary({ signedIn: true });
    await chooseFolder();
    await user.click(screen.getByRole("button", { name: "Publier « etoile.svg »" }));
    expect(router.push).toHaveBeenCalledWith("/publish");
    expect(takeHandedOffFile()?.name).toBe("etoile.svg");
  });

  it("miniature CWPRJ sur demande : visiteur → modale, membre → image, erreurs", async () => {
    const user = userEvent.setup();
    const visitor = renderLibrary();
    await chooseFolder();
    await user.click(
      screen.getByRole("button", { name: "Afficher la miniature de « couronne.cwprj »" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Connectez-vous pour afficher la miniature" }),
    ).toBeInTheDocument();
    visitor.unmount();

    renderLibrary({ signedIn: true });
    await chooseFolder();
    const button = () =>
      screen.getByRole("button", { name: "Afficher la miniature de « couronne.cwprj »" });
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "noThumbnail" }), { status: 422 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(new Blob(["webp"]), { status: 200 }));
    await user.click(button());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce projet ne contient pas de miniature."),
    );
    await user.click(button());
    await waitFor(() =>
      expect(toast.error).toHaveBeenLastCalledWith(expect.stringContaining("beaucoup")),
    );
    await user.click(button());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Afficher la miniature/ })).toBeNull(),
    );
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/local/cwprj-preview");
    expect(fetchMock.mock.calls[0]![1].body).toBeInstanceOf(File);
  });

  it("miniature désactivée sans clé ; fichier trop lourd non publiable", async () => {
    renderLibrary({ signedIn: true, preview: false });
    await chooseFolder([...folder(), file("Modèles/gros.svg", "x".repeat(2000))]);
    expect(screen.queryByRole("button", { name: /Afficher la miniature/ })).toBeNull();
    const big = screen.getByRole("article", { name: "gros.svg" });
    expect(big).toHaveTextContent("Trop lourd pour être publié");
    expect(within(big).getByRole("button", { name: "Publier « gros.svg »" })).toBeDisabled();
  });

  it("afficher le chemin : fenêtre avec le chemin depuis le dossier choisi, copie", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("refus"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderLibrary();
    await chooseFolder();
    await user.click(
      screen.getByRole("button", { name: "Afficher le chemin de « couronne.cwprj »" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Chemin de « couronne.cwprj »" });
    expect(dialog).toHaveTextContent("Modèles/Noël/couronne.cwprj");
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(within(dialog).getByRole("button", { name: "Copier le chemin" }));
    expect(writeText).toHaveBeenCalledWith("Modèles/Noël/couronne.cwprj");
    expect(toast.success).toHaveBeenCalledWith("Chemin copié.");
    await user.click(within(dialog).getByRole("button", { name: "Copier le chemin" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Copie impossible")),
    );
    await user.click(within(dialog).getAllByRole("button", { name: "Fermer" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Vue liste : même bouton.
    await user.click(screen.getByRole("button", { name: "Liste" }));
    expect(
      screen.getByRole("button", { name: "Afficher le chemin de « etoile.svg »" }),
    ).toBeInTheDocument();
  });

  it("dossier vide, changer de dossier, oublier", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await chooseFolder([file("Modèles/notes.txt", "x")]);
    expect(screen.getByText("Aucun fichier .cwprj ou .svg dans ce dossier.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Oublier ce dossier" }));
    expect(store.forgetLibrary).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Choisir un dossier" })).toBeInTheDocument();
  });

  it("dernière analyse mémorisée : revoir l'index, rescanner (autorisation), oublier", async () => {
    const user = userEvent.setup();
    const handle: DirectoryHandleLike & { requestPermission: () => Promise<PermissionState> } = {
      kind: "directory",
      name: "Modèles",
      requestPermission: vi.fn(async () => "denied" as PermissionState),
      async *values() {
        yield {
          kind: "file" as const,
          name: "a.svg",
          getFile: async () => new File([SVG], "a.svg"),
        };
      },
    };
    const saved = {
      folderName: "Modèles",
      scannedAt: Date.UTC(2026, 9, 20),
      truncated: false,
      entries: [
        {
          id: "a.svg",
          name: "a.svg",
          path: "a.svg",
          folder: "",
          size: 10,
          lastModified: 0,
          format: "SVG",
          checksum: "abc",
          tooLarge: false,
        },
      ],
      handle,
    };
    store.loadLibrary.mockResolvedValue(saved);
    renderLibrary();
    expect(await screen.findByText(/Modèles · 1 fichier · le 20 octobre 2026/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoir l'index" }));
    expect(screen.getByText(/Index de la dernière analyse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publier « a.svg »" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Oublier ce dossier" }));
    await waitFor(() => expect(store.forgetLibrary).toHaveBeenCalled());
  });

  it("rescan refusé puis accordé ; sélecteur Chromium ; annulation", async () => {
    const user = userEvent.setup();
    const permission = vi
      .fn<() => Promise<PermissionState>>()
      .mockResolvedValueOnce("denied")
      .mockResolvedValue("granted");
    const handle = {
      kind: "directory" as const,
      name: "Modèles",
      requestPermission: permission,
      async *values() {
        yield {
          kind: "file" as const,
          name: "a.svg",
          getFile: async () => new File([SVG], "a.svg"),
        };
      },
    };
    store.loadLibrary.mockResolvedValue({
      folderName: "Modèles",
      scannedAt: 0,
      truncated: false,
      entries: [],
      handle,
    });
    renderLibrary();
    await user.click(await screen.findByRole("button", { name: "Rescanner le dossier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("L'accès au dossier a été refusé");

    // Sélecteur Chromium : « Choisir un dossier » l'ouvre ; une fermeture sans choix ne fait rien.
    const picker = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("abort", "AbortError"))
      .mockResolvedValue(handle);
    Object.assign(window, { showDirectoryPicker: picker });
    await user.click(screen.getByRole("button", { name: "Choisir un dossier" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choisir un dossier" }));
    expect(await screen.findByRole("heading", { name: "Dossier « Modèles »" })).toBeInTheDocument();
    expect(picker).toHaveBeenLastCalledWith({ mode: "read", id: "canvatheque-local" });
  });

  it("progression et annulation d'une analyse", async () => {
    let release!: (value: string) => void;
    const slow = () => ({
      hash: () => new Promise<string>((resolve) => (release = resolve)),
      terminate,
    });
    renderWithProviders(
      <AuthGateProvider signedIn={false}>
        <LocalLibrary maxFileBytes={1024} cwprjPreviewEnabled={false} hasherFactory={slow} />
      </AuthGateProvider>,
    );
    fireEvent.change(screen.getByLabelText("Dossier à analyser"), { target: { files: folder() } });
    expect(
      await screen.findByRole("progressbar", { name: "Analyse du dossier" }),
    ).toBeInTheDocument();
    await act(async () => {
      screen.getByRole("button", { name: "Annuler" }).click();
      release("x");
    });
    expect(await screen.findByRole("button", { name: "Choisir un dossier" })).toBeInTheDocument();
    expect(terminate).toHaveBeenCalled();
  });

  it("téléphone : message, pas de choix de dossier", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    try {
      renderLibrary();
      expect(screen.getByText(/disponible sur ordinateur/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Choisir un dossier" })).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});
