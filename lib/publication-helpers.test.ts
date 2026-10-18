import { describe, expect, it } from "vitest";
import { modelDetailsSchema, publishSchema } from "@/features/models/schemas";
import { confirmUploadSchema, createUploadSchema } from "@/features/uploads/schemas";
import { formatFileSize, titleFromFileName } from "@/lib/format";
import { applyMarkdownFormat } from "@/lib/markdown-format";
import { normalizeTag, normalizeTags } from "@/lib/tags";

describe("formatFileSize", () => {
  it("affiche des tailles françaises", () => {
    expect(formatFileSize(0)).toBe("0 o");
    expect(formatFileSize(512)).toBe("512 o");
    expect(formatFileSize(188_416)).toBe("184 Ko");
    expect(formatFileSize(1_258_291)).toBe("1,2 Mo");
    expect(formatFileSize(20 * 1024 * 1024)).toBe("20 Mo");
    expect(formatFileSize(3 * 1024 ** 4)).toBe("3 072 Go".replace(" ", " "));
  });
});

describe("titleFromFileName", () => {
  it("propose un titre lisible", () => {
    expect(titleFromFileName("papillon-ajoure.svg")).toBe("Papillon ajoure");
    expect(titleFromFileName("boite_houx petite.cwprj")).toBe("Boite houx petite");
    expect(titleFromFileName(".svg")).toBe("Sans titre");
    expect(titleFromFileName(`${"a".repeat(100)}.svg`)).toHaveLength(80);
  });
});

describe("tags", () => {
  it("normalise et dédoublonne", () => {
    expect(normalizeTag("  Carte de Vœux ! ")).toBe("carte de voeux");
    expect(normalizeTag("Été_2026")).toBe("ete 2026");
    expect(normalizeTags(["Noël", "noel", "x", "a".repeat(31), "Fête"])).toEqual(["noel", "fete"]);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `mot ${i}`))).toHaveLength(10);
  });
});

describe("applyMarkdownFormat", () => {
  it("entoure la sélection", () => {
    expect(applyMarkdownFormat("un mot ici", 3, 6, "bold")).toEqual({
      value: "un **mot** ici",
      selectionStart: 5,
      selectionEnd: 8,
    });
    expect(applyMarkdownFormat("abc", 0, 3, "italic").value).toBe("*abc*");
    expect(applyMarkdownFormat("voir", 0, 4, "link").value).toBe("[voir](https://)");
  });

  it("insère un texte d'exemple sans sélection", () => {
    const result = applyMarkdownFormat("", 0, 0, "bold");
    expect(result.value).toBe("**texte en gras**");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("texte en gras");
  });

  it("transforme des lignes en liste, sur une nouvelle ligne si besoin", () => {
    expect(applyMarkdownFormat("Intro un\ndeux", 6, 13, "list").value).toBe("Intro \n- un\n- deux");
    expect(applyMarkdownFormat("* a\nb", 0, 5, "list").value).toBe("- a\n- b");
  });
});

describe("schémas de publication", () => {
  it("valide les informations d'un modèle", () => {
    const parsed = modelDetailsSchema.parse({
      modelId: "m1",
      title: "  Papillon  ",
      categoryId: "",
      license: null,
    });
    expect(parsed).toEqual({
      modelId: "m1",
      title: "Papillon",
      description: "",
      categoryId: null,
      license: null,
      tags: [],
    });
    const errors = modelDetailsSchema.safeParse({ modelId: "m1", title: "ab", license: "MIT" });
    expect(errors.success).toBe(false);
    expect(errors.error!.issues.map((i) => [i.path[0], i.message])).toEqual([
      ["title", "titleLength"],
      ["license", "license"],
    ]);
  });

  it("exige la certification des droits", () => {
    expect(
      publishSchema.safeParse({ modelId: "m", certifyRights: false }).error!.issues[0]!.message,
    ).toBe("certifyRights");
    expect(publishSchema.parse({ modelId: "m", certifyRights: true }).certifyRights).toBe(true);
  });

  it("valide envois et recadrages", () => {
    expect(createUploadSchema.parse({ kind: "MODEL", fileName: "a.svg", size: 3 }).mime).toBe("");
    expect(createUploadSchema.safeParse({ kind: "AUTRE", fileName: "a", size: 1 }).success).toBe(
      false,
    );
    expect(
      confirmUploadSchema.safeParse({
        uploadId: "u",
        crop: { x: 0.5, y: 0, width: 0.6, height: 1 },
      }).success,
    ).toBe(false);
    expect(
      confirmUploadSchema.safeParse({
        uploadId: "u",
        crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      }).success,
    ).toBe(true);
  });
});
