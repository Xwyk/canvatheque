import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/auth/actions", () => ({ signUpAction: vi.fn(), signInAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
  usePathname: () => "/models/papillon",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { AuthGateProvider } from "@/components/auth/auth-gate";
import {
  DownloadPanel,
  MobileActionBar,
} from "@/features/catalog/components/model-page/download-actions";
import { CanvasWorkspaceDialog } from "@/features/downloads/components/canvas-workspace-dialog";
import { useDownload } from "@/features/downloads/use-download";
import {
  dismissHelp,
  HELP_DISMISSED_KEY,
  tryProtocol,
  useOpenInCanvasWorkspace,
} from "@/features/downloads/use-open-in-canvas-workspace";
import { axe } from "@/tests/setup/axe";
import { Providers, renderWithProviders } from "@/tests/setup/render";

const fetchMock = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, href: "http://localhost/models/papillon" },
  });
  window.localStorage.clear();
  search.params = new URLSearchParams();
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function wrapper(signedIn: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Providers>
        <AuthGateProvider signedIn={signedIn}>{children}</AuthGateProvider>
      </Providers>
    );
  };
}

describe("useDownload", () => {
  it("suit l'URL présignée renvoyée en JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { url: "http://s3/fichier" }));
    const start = vi.fn();
    const { result } = renderHook(() => useDownload(start), { wrapper: wrapper(true) });
    let started = false;
    await act(async () => {
      started = await result.current("papillon", "papillon.svg");
    });
    expect(started).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/models/papillon/download", {
      headers: { Accept: "application/json" },
    });
    expect(start).toHaveBeenCalledWith("http://s3/fichier");
    expect(toast.success).toHaveBeenCalledWith("Téléchargement lancé : papillon.svg");
  });

  it("gère limite, modèle retiré, erreur et réseau", async () => {
    const { result } = renderHook(() => useDownload(vi.fn()), { wrapper: wrapper(true) });
    fetchMock
      .mockResolvedValueOnce(json(429, {}, { "Retry-After": "600" }))
      .mockResolvedValueOnce(json(404, {}))
      .mockResolvedValueOnce(json(500, {}))
      .mockRejectedValueOnce(new Error("réseau"));
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        expect(await result.current("x", "x.svg")).toBe(false);
      });
    }
    expect(toast.error.mock.calls.map(([message]) => message)).toEqual([
      "Vous avez beaucoup téléchargé : réessayez dans 10 minutes.",
      "Ce fichier n'est plus disponible.",
      "Le téléchargement a échoué. Réessayez dans un instant.",
      "Le téléchargement a échoué. Réessayez dans un instant.",
    ]);
  });

  it("visiteur ou session expirée : modale d'inscription", async () => {
    const visitor = renderHook(() => useDownload(vi.fn()), { wrapper: wrapper(false) });
    await act(async () => {
      await visitor.result.current("papillon", "papillon.svg");
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: /pour télécharger/ })).toBeInTheDocument();
    visitor.unmount();

    fetchMock.mockResolvedValueOnce(json(401, { code: "UNAUTHORIZED", loginUrl: "/login?x" }));
    const expired = renderHook(() => useDownload(vi.fn()), { wrapper: wrapper(true) });
    await act(async () => {
      await expired.result.current("papillon", "papillon.svg");
    });
    expect(assign).toHaveBeenCalledWith("/login?x");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("useOpenInCanvasWorkspace", () => {
  it("sans protocole : télécharge puis affiche l'aide, sauf si masquée", async () => {
    const download = vi.fn(async () => true);
    const { result } = renderHook(() => useOpenInCanvasWorkspace({ download, protocol: null }));
    await act(async () => {
      expect(await result.current.open("papillon")).toBe("download");
    });
    expect(result.current.helpOpen).toBe(true);
    act(() => result.current.closeHelp());
    expect(result.current.helpOpen).toBe(false);

    dismissHelp();
    expect(window.localStorage.getItem(HELP_DISMISSED_KEY)).toBe("1");
    await act(async () => {
      await result.current.open("papillon");
    });
    expect(result.current.helpOpen).toBe(false);

    download.mockResolvedValueOnce(false);
    await act(async () => {
      expect(await result.current.open("papillon")).toBe("none");
    });
  });

  it("avec protocole : ouverture directe si la page perd le focus, sinon repli", async () => {
    vi.useFakeTimers();
    try {
      const download = vi.fn(async () => true);
      const protocol = (slug: string) => `cws://open/${slug}`;
      const { result } = renderHook(() => useOpenInCanvasWorkspace({ download, protocol }));

      let outcome: Promise<string>;
      act(() => {
        outcome = result.current.open("papillon");
      });
      expect(window.location.href).toBe("cws://open/papillon");
      window.dispatchEvent(new Event("blur"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(await outcome!).toBe("protocol");
      expect(download).not.toHaveBeenCalled();

      act(() => {
        outcome = result.current.open("papillon");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(await outcome!).toBe("download");
      expect(download).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tryProtocol détecte le passage en arrière-plan", async () => {
    vi.useFakeTimers();
    try {
      const pending = tryProtocol("cws://x", 100);
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(100);
      expect(await pending).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CanvasWorkspaceDialog", () => {
  it("explique l'ouverture pas à pas et mémorise « Ne plus afficher »", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<CanvasWorkspaceDialog open fileName="boite.cwprj" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", {
      name: "Ouvrir le modèle dans CanvasWorkspace",
    });
    expect(dialog).toHaveTextContent(
      "Sélectionnez « boite.cwprj » dans votre dossier Téléchargements.",
    );
    expect(
      screen.getByRole("link", { name: "Le télécharger sur le site de Brother" }),
    ).toHaveAttribute("href", expect.stringContaining("canvasworkspace.brother.com"));
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(screen.getByRole("checkbox", { name: "Ne plus afficher ces explications" }));
    await user.click(screen.getByRole("button", { name: "J'ai compris" }));
    expect(onClose).toHaveBeenCalled();
    expect(window.localStorage.getItem(HELP_DISMISSED_KEY)).toBe("1");
  });

  it("fermer sans cocher ne mémorise rien", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CanvasWorkspaceDialog open fileName="b.cwprj" onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(window.localStorage.getItem(HELP_DISMISSED_KEY)).toBeNull();
  });
});

describe("actions de la fiche", () => {
  const renderPanel = (format: "SVG" | "CWPRJ", signedIn = true) =>
    renderWithProviders(
      <AuthGateProvider signedIn={signedIn}>
        <DownloadPanel
          slug="papillon"
          format={format}
          sizeLabel="184 Ko"
          fileName="papillon.cwprj"
          os="mac"
        />
        <MobileActionBar
          slug="papillon"
          format={format}
          sizeLabel="184 Ko"
          fileName="papillon.cwprj"
        />
      </AuthGateProvider>,
    );

  it("CWPRJ : ouvrir dans CanvasWorkspace télécharge et explique ; liens réels sans JS", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => json(200, { url: "http://s3/f" }));
    renderPanel("CWPRJ");
    const open = screen.getAllByRole("link", { name: /Ouvrir dans CanvasWorkspace/ })[0]!;
    expect(open).toHaveAttribute("href", "/api/models/papillon/download");
    // Pas d'exploration par les robots (le point de contrôle refuse les visiteurs).
    for (const link of screen.getAllByRole("link", { name: /Télécharger|Ouvrir/ })) {
      expect(link).toHaveAttribute("rel", "nofollow");
    }
    await user.click(open);
    expect(
      await screen.findByRole("dialog", { name: /Ouvrir le modèle dans CanvasWorkspace/ }),
    ).toBeInTheDocument();
    expect(assign).toHaveBeenCalledWith("http://s3/f");
    await user.click(screen.getByRole("button", { name: "J'ai compris" }));

    await user.click(screen.getByRole("link", { name: "Télécharger le fichier · 184 Ko" }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    // Barre mobile : bouton carré de téléchargement.
    await user.click(screen.getByRole("link", { name: "Télécharger le fichier (184 Ko)" }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(3));
  });

  it("SVG pour un visiteur : modale d'inscription", async () => {
    const user = userEvent.setup();
    renderPanel("SVG", false);
    await user.click(screen.getAllByRole("link", { name: /Télécharger le SVG/ })[0]!);
    expect(await screen.findByRole("dialog", { name: /pour télécharger/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relance le téléchargement au retour (?download=1) et nettoie l'adresse", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    search.params = new URLSearchParams("download=1");
    fetchMock.mockImplementation(async () => json(200, { url: "http://s3/auto" }));
    renderPanel("SVG");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://s3/auto"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalled();
  });
});
