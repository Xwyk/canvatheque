import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/uploads/actions", () => ({
  createUploadAction: vi.fn(),
  confirmUploadAction: vi.fn(),
}));

import { postToStorage, UploadAbortedError } from "@/features/uploads/client";
import { CropDialog, squareCrop } from "@/features/uploads/components/crop-dialog";
import { Dropzone } from "@/features/uploads/components/dropzone";
import { UploadStatus } from "@/features/uploads/components/upload-status";
import { useUpload, type UploadActions } from "@/features/uploads/use-upload";
import { axe } from "@/tests/setup/axe";
import { Providers, renderWithProviders } from "@/tests/setup/render";

const svgFile = () => new File(["<svg/>"], "papillon.svg", { type: "image/svg+xml" });

describe("Dropzone", () => {
  it("ouvre le sélecteur, transmet le fichier choisi ou déposé", async () => {
    const onFile = vi.fn();
    const { container } = renderWithProviders(
      <Dropzone
        title="Glissez"
        hint=".svg"
        buttonLabel="Choisir un fichier"
        accept=".svg"
        onFile={onFile}
      />,
    );
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: "Choisir un fichier" }));
    expect(click).toHaveBeenCalled();

    const file = svgFile();
    await userEvent.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);

    const zone = input.parentElement!;
    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
    expect(zone).toHaveClass("border-primary");
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass("border-primary");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledTimes(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ignore le dépôt quand elle est désactivée", () => {
    const onFile = vi.fn();
    const { container } = renderWithProviders(
      <Dropzone title="T" hint="H" buttonLabel="B" accept="*" disabled onFile={onFile} />,
    );
    const zone = container.querySelector("input")!.parentElement!;
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    fireEvent.drop(zone, { dataTransfer: { files: [svgFile()] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "B" })).toBeDisabled();
  });
});

describe("UploadStatus", () => {
  it("progression annulable, puis vérification", async () => {
    const onCancel = vi.fn();
    const { rerender, container } = renderWithProviders(
      <UploadStatus
        state={{ phase: "uploading", fileName: "a.svg", percent: 64 }}
        onCancel={onCancel}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Envoi de a.svg" });
    expect(bar).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByRole("status")).toHaveTextContent("64 %");
    await userEvent.click(screen.getByRole("button", { name: "Annuler l'envoi" }));
    expect(onCancel).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <Providers>
        <UploadStatus state={{ phase: "processing", fileName: "a.svg" }} onCancel={onCancel} />
      </Providers>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Vérification…");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("erreurs traduites, limite de débit et repli générique", () => {
    const { rerender } = renderWithProviders(
      <UploadStatus
        state={{
          phase: "error",
          fileName: "x.exe.svg",
          error: { code: "VALIDATION", message: "errors.upload.doubleExtension" },
        }}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "x.exe.svg : Ce nom de fichier contient une double extension suspecte.",
    );
    rerender(
      <Providers>
        <UploadStatus
          state={{
            phase: "error",
            error: { code: "RATE_LIMITED", message: "errors.rateLimited", retryAfter: 600 },
          }}
          onCancel={() => {}}
        />
      </Providers>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Réessayez dans 10 minutes");
    rerender(
      <Providers>
        <UploadStatus
          state={{ phase: "error", error: { code: "INTERNAL", message: "inconnu" } }}
          onCancel={() => {}}
        />
      </Providers>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue");
    rerender(
      <Providers>
        <UploadStatus state={{ phase: "idle" }} onCancel={() => {}} />
      </Providers>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CropDialog", () => {
  it("calcule un recadrage carré", () => {
    expect(squareCrop(900, 600, 1, 0.5, 0.5)).toEqual({
      x: 150 / 900,
      y: 0,
      width: 600 / 900,
      height: 1,
    });
    const zoomed = squareCrop(1000, 1000, 2, 1, 0);
    expect(zoomed).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
  });

  it("recadre, garde l'image entière ou annule", async () => {
    URL.createObjectURL = vi.fn(() => "blob:local");
    URL.revokeObjectURL = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const file = new File(["x"], "photo.png", { type: "image/png" });
    renderWithProviders(<CropDialog file={file} onCancel={onCancel} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("dialog", { name: "Recadrer l'aperçu" });
    expect(screen.getByRole("button", { name: "Recadrer" })).toBeDisabled();
    const image = screen.getByAltText("Image choisie");
    Object.defineProperty(image, "naturalWidth", { value: 800 });
    Object.defineProperty(image, "naturalHeight", { value: 400 });
    fireEvent.load(image);

    fireEvent.change(screen.getByLabelText(/Zoom/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Position horizontale/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/Position verticale/), { target: { value: "1" } });
    expect(screen.getByLabelText(/Zoom/)).toHaveAttribute("aria-valuetext", "× 2,0");
    await userEvent.click(screen.getByRole("button", { name: "Recadrer" }));
    expect(onConfirm).toHaveBeenCalledWith({ x: 0, y: 0.5, width: 0.25, height: 0.5 });

    await userEvent.click(screen.getByRole("button", { name: "Image entière" }));
    expect(onConfirm).toHaveBeenLastCalledWith(undefined);
    expect(await axe(dialog)).toHaveNoViolations();

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("reste fermé sans fichier", () => {
    renderWithProviders(<CropDialog file={null} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("useUpload", () => {
  const ticket = { uploadId: "u1", url: "http://s3/b", fields: { key: "k" }, expiresAt: "" };
  const setup = (overrides: Partial<UploadActions>) => {
    const actions: UploadActions = {
      create: vi.fn(async () => ({ ok: true as const, data: ticket })),
      post: vi.fn(async (_t, _f, options) => {
        options?.onProgress?.(50);
      }),
      confirm: vi.fn(async () => ({ ok: true as const, data: { modelId: "m1" } as never })),
      ...overrides,
    };
    return { actions, hook: renderHook(() => useUpload<{ modelId: string }>(actions)) };
  };

  it("enchaîne demande, envoi et confirmation", async () => {
    const { actions, hook } = setup({});
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.start(svgFile(), { kind: "MODEL" }, undefined);
    });
    expect(result).toEqual({ modelId: "m1" });
    expect(actions.create).toHaveBeenCalledWith({
      kind: "MODEL",
      fileName: "papillon.svg",
      size: 6,
      mime: "image/svg+xml",
    });
    expect(actions.confirm).toHaveBeenCalledWith({ uploadId: "u1", crop: undefined });
    expect(hook.result.current.state).toEqual({ phase: "idle" });
  });

  it("signale les échecs de demande, d'envoi et de confirmation", async () => {
    const refused = { code: "VALIDATION" as const, message: "errors.upload.extension" };
    let { hook } = setup({ create: vi.fn(async () => ({ ok: false as const, error: refused })) });
    await act(async () => {
      await hook.result.current.start(svgFile(), { kind: "MODEL" });
    });
    expect(hook.result.current.state).toEqual({
      phase: "error",
      fileName: "papillon.svg",
      error: refused,
    });

    ({ hook } = setup({ post: vi.fn(async () => Promise.reject(new Error("storage_network"))) }));
    await act(async () => {
      await hook.result.current.start(svgFile(), { kind: "MODEL" });
    });
    expect(hook.result.current.state).toMatchObject({
      error: { message: "errors.upload.network" },
    });

    ({ hook } = setup({ confirm: vi.fn(async () => ({ ok: false as const, error: refused })) }));
    await act(async () => {
      await hook.result.current.start(svgFile(), { kind: "MODEL" });
    });
    expect(hook.result.current.state).toMatchObject({ phase: "error", error: refused });
    act(() => hook.result.current.reset());
    expect(hook.result.current.state).toEqual({ phase: "idle" });
  });

  it("annulation : retour au repos sans erreur", async () => {
    const { hook } = setup({
      post: vi.fn(
        (_t, _f, options) =>
          new Promise<void>((_resolve, reject) =>
            options?.signal?.addEventListener("abort", () => reject(new UploadAbortedError())),
          ),
      ),
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending = hook.result.current.start(svgFile(), { kind: "PREVIEW", modelId: "m1" });
    });
    await waitFor(() => expect(hook.result.current.state.phase).toBe("uploading"));
    act(() => hook.result.current.cancel());
    await act(async () => {
      expect(await pending).toBeNull();
    });
    expect(hook.result.current.state).toEqual({ phase: "idle" });
  });
});

describe("postToStorage", () => {
  type Listener = (event?: { lengthComputable: boolean; loaded: number; total: number }) => void;

  class FakeXhr {
    static last: FakeXhr;
    status = 0;
    listeners: Record<string, Listener> = {};
    upload = {
      addEventListener: (name: string, fn: Listener) => (this.listeners[`upload:${name}`] = fn),
    };
    body?: FormData;
    method?: string;
    url?: string;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    addEventListener(name: string, fn: Listener) {
      this.listeners[name] = fn;
    }
    send(body: FormData) {
      this.body = body;
    }
    abort() {
      this.listeners.abort?.();
    }
  }

  it("poste les champs puis le fichier, suit la progression", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const progress = vi.fn();
    const done = postToStorage(
      { url: "http://s3/bucket", fields: { key: "uploads/1", Policy: "p" } },
      svgFile(),
      {
        onProgress: progress,
      },
    );
    const xhr = FakeXhr.last;
    expect([xhr.method, xhr.url]).toEqual(["POST", "http://s3/bucket"]);
    expect([...xhr.body!.keys()]).toEqual(["key", "Policy", "file"]);
    xhr.listeners["upload:progress"]!({ lengthComputable: true, loaded: 1, total: 4 });
    expect(progress).toHaveBeenCalledWith(25);
    xhr.status = 204;
    xhr.listeners.load!();
    await expect(done).resolves.toBeUndefined();
    expect(progress).toHaveBeenLastCalledWith(100);

    const refused = postToStorage({ url: "u", fields: {} }, svgFile());
    FakeXhr.last.status = 403;
    FakeXhr.last.listeners.load!();
    await expect(refused).rejects.toThrow("storage_status_403");

    const network = postToStorage({ url: "u", fields: {} }, svgFile());
    FakeXhr.last.listeners.error!();
    await expect(network).rejects.toThrow("storage_network");

    const controller = new AbortController();
    const aborted = postToStorage({ url: "u", fields: {} }, svgFile(), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(aborted).rejects.toBeInstanceOf(UploadAbortedError);

    await expect(
      postToStorage({ url: "u", fields: {} }, svgFile(), { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(UploadAbortedError);
    vi.unstubAllGlobals();
  });
});
