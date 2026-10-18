import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DescriptionField } from "@/features/models/components/description-field";
import { LicenseField } from "@/features/models/components/license-field";
import { PreviewFrame } from "@/features/models/components/preview-frame";
import { TagInput } from "@/features/models/components/tag-input";
import type { LicenseValue } from "@/features/models/schemas";
import type { Result } from "@/lib/result";
import { axe } from "@/tests/setup/axe";
import { renderWithProviders } from "@/tests/setup/render";

function DescriptionHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <DescriptionField id="description" value={value} onChange={setValue} />;
}

describe("DescriptionField", () => {
  it("met la sélection en forme depuis la barre d'outils", async () => {
    const { container } = renderWithProviders(<DescriptionHarness initial="un mot" />);
    const textarea = screen.getByRole("textbox", { name: "Description" });
    expect(screen.getByRole("toolbar", { name: "Mise en forme" })).toBeInTheDocument();
    (textarea as HTMLTextAreaElement).setSelectionRange(3, 6);
    await userEvent.click(screen.getByRole("button", { name: "Gras" }));
    expect(textarea).toHaveValue("un **mot**");
    await userEvent.type(textarea, " !");
    expect(textarea).toHaveValue("un **mot** !");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("affiche l'erreur du champ", () => {
    renderWithProviders(
      <DescriptionField id="d" value="" error="descriptionLength" onChange={() => {}} />,
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveAccessibleDescription(
      expect.stringContaining("5 000 caractères maximum."),
    );
  });
});

function TagHarness({ suggest }: { suggest: (q: string) => Promise<Result<string[]>> }) {
  const [tags, setTags] = useState<string[]>(["noel"]);
  return <TagInput id="tags" tags={tags} onChange={setTags} suggest={suggest} />;
}

describe("TagInput", () => {
  it("ajoute (Entrée, virgule, perte de focus), retire et suggère", async () => {
    const suggest = vi.fn(async (query: string) => ({
      ok: true as const,
      data: query === "pa" ? ["papillon", "noel", "papier"] : [],
    }));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<TagHarness suggest={suggest} />);
    const input = screen.getByRole("textbox", { name: "Mots-clés" });

    await user.type(input, "Fête{Enter}Été, ");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "noel",
      "fete",
      "ete",
    ]);
    await user.click(screen.getByRole("button", { name: "Retirer le mot-clé fete" }));
    expect(screen.queryByText("fete")).toBeNull();
    await user.type(input, "{Backspace}");
    expect(screen.queryByText("ete")).toBeNull();

    await user.type(input, "Pa");
    expect(
      await screen.findByRole("button", { name: "Ajouter le mot-clé papillon" }),
    ).toBeInTheDocument();
    expect(suggest).toHaveBeenLastCalledWith("pa");
    // Les mots-clés déjà choisis ne sont pas suggérés.
    expect(screen.queryByRole("button", { name: "Ajouter le mot-clé noel" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ajouter le mot-clé papillon" }));
    expect(screen.getByText("papillon")).toBeInTheDocument();
    expect(input).toHaveValue("");

    await user.type(input, "brouillon");
    act(() => input.blur());
    expect(screen.getByText("brouillon")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("se désactive à 10 mots-clés", () => {
    renderWithProviders(
      <TagInput
        id="t"
        tags={Array.from({ length: 10 }, (_, i) => `mot ${i}`)}
        onChange={() => {}}
        suggest={async () => ({ ok: true, data: [] })}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Mots-clés" })).toBeDisabled();
  });
});

function LicenseHarness() {
  const [value, setValue] = useState<LicenseValue | null>(null);
  return <LicenseField value={value} error={value ? undefined : "license"} onChange={setValue} />;
}

describe("LicenseField", () => {
  it("présente chaque licence avec sa phrase et signale l'absence de choix", async () => {
    const { container } = renderWithProviders(<LicenseHarness />);
    const group = screen.getByRole("group", { name: "Licence" });
    expect(group).toHaveAccessibleDescription(expect.stringContaining("Choisissez une licence."));
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    await userEvent.click(screen.getByRole("radio", { name: /CC BY-NC-SA/ }));
    expect(screen.getByRole("radio", { name: /CC BY-NC-SA/ })).toBeChecked();
    expect(screen.queryByText("Choisissez une licence.")).toBeNull();
    expect(
      screen.getByText(/hors usage commercial, en vous citant et en partageant/),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PreviewFrame", () => {
  const preview = { sm: "s", md: "m", lg: "l", width: 1600, height: 1200 };

  it("zoome par paliers", async () => {
    const { container } = renderWithProviders(
      <PreviewFrame preview={preview} alt="Aperçu de « X »" emptyLabel="Vide" />,
    );
    const image = screen.getByRole("img", { name: "Aperçu de « X »" });
    const zoomOut = screen.getByRole("button", { name: "Réduire l'aperçu" });
    const zoomIn = screen.getByRole("button", { name: "Agrandir l'aperçu" });
    expect(zoomOut).toBeDisabled();
    for (let i = 0; i < 3; i += 1) fireEvent.click(zoomIn);
    expect(image.style.transform).toBe("scale(3)");
    expect(zoomIn).toBeDisabled();
    fireEvent.click(zoomOut);
    expect(image.style.transform).toBe("scale(2)");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("indique l'absence d'aperçu", () => {
    renderWithProviders(<PreviewFrame preview={null} alt="" emptyLabel="Aucun aperçu" />);
    expect(screen.getByText("Aucun aperçu")).toBeInTheDocument();
  });
});
