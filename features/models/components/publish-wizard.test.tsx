import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveModelAction: vi.fn(),
  publishModelAction: vi.fn(),
  unpublishModelAction: vi.fn(),
  deleteModelAction: vi.fn(),
  suggestTagsAction: vi.fn(async () => ({ ok: true, data: [] })),
}));
const uploads = vi.hoisted(() => ({ createUploadAction: vi.fn(), confirmUploadAction: vi.fn() }));
const storage = vi.hoisted(() => ({ postToStorage: vi.fn(async () => {}) }));
vi.mock("@/features/models/actions", () => actions);
vi.mock("@/features/uploads/actions", () => uploads);
vi.mock("@/features/uploads/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postToStorage: storage.postToStorage,
}));

import { handOffForPublishing } from "@/features/local/handoff";
import { PublishWizard } from "@/features/models/components/publish-wizard";
import type { EditableModel } from "@/features/models/service";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

const preview = { sm: "s.webp", md: "m.webp", lg: "l.webp", width: 1600, height: 1600 };
const categories = [
  { id: "c1", name: "Cartes et papeterie" },
  { id: "c2", name: "Décoration" },
];
const context = {
  categories,
  authorPseudo: "lucie.m",
  emailVerified: true,
  maxFileMb: 20,
  maxModels: 200,
};

const draft = (overrides: Partial<EditableModel> = {}): EditableModel => ({
  id: "m1",
  slug: "papillon",
  status: "DRAFT",
  format: "SVG",
  fileName: "papillon.svg",
  fileSize: 188_416,
  title: "Papillon",
  description: "",
  categoryId: null,
  license: null,
  tags: [],
  preview,
  previewCustom: false,
  publishedAt: null,
  updatedAt: "2026-10-18T10:00:00.000Z",
  authorPseudo: "lucie.m",
  ...overrides,
});

const ticket = { ok: true, data: { uploadId: "u1", url: "http://s3", fields: {}, expiresAt: "" } };

beforeEach(() => {
  vi.clearAllMocks();
  uploads.createUploadAction.mockResolvedValue(ticket);
  actions.saveModelAction.mockImplementation(async (input: { tags: string[] }) => ({
    ok: true,
    data: { updatedAt: "2026-10-18T11:00:00.000Z", tags: input.tags },
  }));
});

function fileInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>("input[type=file]")!;
}

function drop(container: HTMLElement, file: File) {
  fireEvent.drop(fileInput(container).parentElement!, { dataTransfer: { files: [file] } });
}

describe("PublishWizard", () => {
  it("parcours complet : fichier, aperçu, informations, relecture, publication", async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, "replaceState");
    uploads.confirmUploadAction.mockResolvedValueOnce({
      ok: true,
      data: {
        modelId: "m1",
        slug: "papillon-ajoure",
        created: true,
        title: "Papillon ajoure",
        format: "SVG",
        fileName: "papillon-ajoure.svg",
        fileSize: 188_416,
        fileSizeLabel: "184 Ko",
        preview,
        previewCustom: false,
        duplicateOf: { slug: "autre", title: "Papillon de Claire" },
      },
    });
    const { container } = renderWithProviders(<PublishWizard initial={null} {...context} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Publier un modèle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();

    // 1. Fichier
    await user.upload(fileInput(container), new File(["<svg/>"], "papillon-ajoure.svg"));
    expect(await screen.findByText("Fichier vérifié : papillon-ajoure.svg")).toBeInTheDocument();
    expect(screen.getByText(/Papillon de Claire/)).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/models/papillon-ajoure/edit");
    expect(screen.getByRole("status", { name: "" })).toBeDefined();
    expect(screen.getByText("Brouillon enregistré à l'instant")).toBeInTheDocument();
    const recap = screen.getByRole("complementary", { name: "Récapitulatif" });
    expect(within(recap).getByText("184 Ko · fichier valide")).toBeInTheDocument();
    expect(within(recap).getByText("Papillon ajoure")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // 2. Aperçu (SVG : aperçu généré, remplaçable par une image recadrée)
    expect(
      await screen.findByRole("heading", { name: "Ajoutez une image d'aperçu" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/généré cet aperçu à partir de votre SVG/)).toBeInTheDocument();
    // user.upload filtrerait selon « accept » : le fichier arrive par glisser-déposer.
    drop(container, new File(["gif"], "a.gif", { type: "image/gif" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Seules les images PNG, JPG ou WebP");
    drop(container, new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cette image dépasse 5 Mo.");

    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    uploads.confirmUploadAction.mockResolvedValueOnce({
      ok: true,
      data: { modelId: "m1", preview: { ...preview, lg: "custom.webp" }, previewCustom: true },
    });
    await user.upload(fileInput(container), new File(["png"], "photo.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Image entière" }));
    await waitFor(() =>
      expect(uploads.confirmUploadAction).toHaveBeenLastCalledWith({
        uploadId: "u1",
        crop: undefined,
      }),
    );
    expect(
      await screen.findByText(/Votre image sera affichée dans la galerie/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // 3. Informations : erreur de validation renvoyée par le serveur, puis correction
    expect(await screen.findByRole("textbox", { name: "Titre" })).toHaveValue("Papillon ajoure");
    await user.clear(screen.getByRole("textbox", { name: "Titre" }));
    await user.type(screen.getByRole("textbox", { name: "Titre" }), "Papillon ajouré");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Joli **papillon**");
    await user.selectOptions(screen.getByRole("combobox", { name: "Catégorie" }), "c2");
    await user.type(screen.getByRole("textbox", { name: "Mots-clés" }), "Papillon{Enter}");
    actions.saveModelAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION", message: "errors.validation", fields: { license: "license" } },
    });
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Certains champs sont à corriger.");
    expect(screen.getByText("Choisissez une licence.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /CC BY-SA/ }));
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // 4. Relecture
    expect(
      await screen.findByRole("heading", { name: "Relisez avant de publier" }),
    ).toBeInTheDocument();
    expect(actions.saveModelAction).toHaveBeenLastCalledWith({
      modelId: "m1",
      title: "Papillon ajouré",
      description: "Joli **papillon**",
      categoryId: "c2",
      license: "CC_BY_SA",
      tags: ["papillon"],
    });
    const summary = container.querySelector("dl")!;
    expect(within(summary).getByText("Décoration")).toBeInTheDocument();
    expect(within(summary).getByText("CC BY-SA")).toBeInTheDocument();
    expect(summary.querySelector("strong")).toHaveTextContent("papillon");
    const publish = screen.getByRole("button", { name: "Publier" });
    expect(publish).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Je certifie/ }));
    actions.publishModelAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "FORBIDDEN", message: "errors.publish.unverified" },
    });
    await user.click(publish);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Confirmez votre adresse e-mail pour publier.",
    );
    expect(actions.publishModelAction).toHaveBeenCalledWith({ modelId: "m1", certifyRights: true });

    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));
    expect(
      await screen.findByText("Brouillon enregistré. Retrouvez-le dans Mes modèles."),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("publication incomplète : renvoie à l'étape concernée", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PublishWizard initial={draft({ categoryId: "c1", license: "CC0" })} {...context} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Modifier le modèle" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Relecture/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Je certifie/ }));
    actions.publishModelAction.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "errors.publish.incomplete",
        fields: { preview: "previewRequired" },
      },
    });
    await user.click(screen.getByRole("button", { name: "Publier" }));
    expect(
      await screen.findByRole("heading", { name: "Ajoutez une image d'aperçu" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Il manque des informations pour publier.");
  });

  it("enregistrement impossible : la publication revient aux informations", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PublishWizard initial={draft({ categoryId: "c1", license: "CC0" })} {...context} />,
    );
    await user.click(screen.getByRole("button", { name: /Relecture/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Je certifie/ }));
    actions.saveModelAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "RATE_LIMITED", message: "errors.rateLimited", retryAfter: 120 },
    });
    await user.click(screen.getByRole("button", { name: "Publier" }));
    expect(await screen.findByRole("textbox", { name: "Titre" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Réessayez dans 2 minutes");
    expect(actions.publishModelAction).not.toHaveBeenCalled();
  });

  it("modèle publié : enregistrer les modifications, sans certification", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PublishWizard
        initial={draft({
          status: "PUBLISHED",
          categoryId: "c1",
          license: "CC0",
          format: "CWPRJ",
          previewCustom: true,
        })}
        {...context}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Relecture/ }));
    expect(await screen.findByText(/Ce modèle est publié/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("link", { name: "Mes modèles" })).toHaveAttribute("href", "/me");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    expect(await screen.findAllByText("Modifications enregistrées")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByRole("textbox", { name: "Titre" })).toBeInTheDocument();
  });

  it("masqué, adresse non confirmée, quota atteint", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <PublishWizard initial={draft({ status: "HIDDEN" })} {...context} emailVerified={false} />,
    );
    expect(
      screen.getByText(/la publication sera possible une fois votre adresse/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Relecture/ }));
    expect(await screen.findByText("Ce modèle est masqué par la modération.")).toBeInTheDocument();
    unmount();

    renderWithProviders(<PublishWizard initial={null} {...context} quotaReached />);
    expect(
      screen.getByText("Vous avez atteint le nombre maximal de modèles (200)."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choisir un fichier" })).toBeNull();
  });

  it("CWPRJ sans aperçu : Continuer bloqué à l'étape Aperçu ; remplacement de fichier refusé", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <PublishWizard initial={draft({ format: "CWPRJ", preview: null })} {...context} />,
    );
    uploads.confirmUploadAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION", message: "errors.upload.formatChange" },
    });
    await user.upload(fileInput(container), new File(["x"], "autre.svg"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Un modèle publié garde son format");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Continuer" }));
    });
    expect(
      await screen.findByText(/ne peuvent pas s'afficher dans le navigateur/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
    expect(screen.getByText("Glissez votre image ici")).toBeInTheDocument();
  });

  it("CWPRJ avec miniature : aperçu extrait du projet, titre tiré du nom du motif", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <PublishWizard
        initial={draft({
          format: "CWPRJ",
          fileName: "premier-jet.cwprj",
          title: "Premier jet",
          preview: null,
        })}
        {...context}
      />,
    );
    uploads.confirmUploadAction.mockResolvedValueOnce({
      ok: true,
      data: {
        modelId: "m1",
        slug: "papillon",
        created: false,
        title: "Couronne de houx",
        format: "CWPRJ",
        fileName: "v2.cwprj",
        fileSize: 4096,
        fileSizeLabel: "4 Ko",
        preview,
        previewCustom: false,
        titleUpdated: true,
        duplicateOf: null,
      },
    });
    await user.upload(fileInput(container), new File(["x"], "v2.cwprj"));
    expect(await screen.findByText("Fichier vérifié : v2.cwprj")).toBeInTheDocument();
    const recap = screen.getByRole("complementary", { name: "Récapitulatif" });
    expect(within(recap).getByText("Couronne de houx")).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Continuer" }));
    });
    expect(
      await screen.findByText(/extrait cet aperçu de votre projet CanvasWorkspace/),
    ).toBeInTheDocument();
    expect(screen.getByText("Remplacer par ma propre image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("fichier transmis par le mode local : envoyé dès l'ouverture de l'assistant", async () => {
    uploads.confirmUploadAction.mockResolvedValueOnce({
      ok: true,
      data: {
        modelId: "m9",
        slug: "sapin",
        created: true,
        title: "Sapin",
        format: "SVG",
        fileName: "sapin.svg",
        fileSize: 120,
        fileSizeLabel: "120 o",
        preview,
        previewCustom: false,
        titleUpdated: false,
        duplicateOf: null,
      },
    });
    handOffForPublishing(new File(["<svg/>"], "sapin.svg"));
    renderWithProviders(<PublishWizard initial={null} {...context} />);
    expect(await screen.findByText("Fichier vérifié : sapin.svg")).toBeInTheDocument();
    expect(uploads.createUploadAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "MODEL", fileName: "sapin.svg" }),
    );
  });
});
