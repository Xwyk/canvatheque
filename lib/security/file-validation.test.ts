import { describe, expect, it } from "vitest";
import {
  checkCwprjContent,
  checkDeclaredModel,
  checkDeclaredPreview,
  detectPreviewImage,
  formatFromFileName,
  sanitizeFileName,
  sha256,
} from "@/lib/security/file-validation";
import { demoCwprj } from "@/prisma/seed-models";

const MB = 1024 * 1024;
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("sanitizeFileName", () => {
  it("retire chemin, caractères de contrôle et réservés", () => {
    expect(sanitizeFileName("C:\\Users\\x\\Papillon ajouré.svg")).toBe("Papillon ajouré.svg");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('mo<d>è|l"e\u0000\u202E.svg')).toBe("modèle.svg");
    expect(sanitizeFileName("  deux   espaces .svg ")).toBe("deux espaces .svg");
  });

  it("refuse un nom vide, caché ou trop long", () => {
    expect(sanitizeFileName("")).toBeNull();
    expect(sanitizeFileName("dossier/")).toBeNull();
    expect(sanitizeFileName(".htaccess")).toBeNull();
    expect(sanitizeFileName(`${"a".repeat(117)}.svg`)).toBeNull();
    expect(sanitizeFileName(`${"a".repeat(116)}.svg`)).toHaveLength(120);
  });
});

describe("checkDeclaredModel", () => {
  const declared = (fileName: string, size = 1000) => ({ fileName, size, mime: "" });

  it("accepte .svg et .cwprj (casse indifférente)", () => {
    expect(checkDeclaredModel(declared("Boîte houx.CWPRJ"), MB)).toEqual({
      ok: true,
      value: { name: "Boîte houx.CWPRJ", format: "CWPRJ" },
    });
    expect(checkDeclaredModel(declared("carte.noel.svg"), MB)).toMatchObject({
      ok: true,
      value: { format: "SVG" },
    });
  });

  it("refuse extension, double extension dangereuse, taille et nom invalides", () => {
    expect(checkDeclaredModel(declared("photo.png"), MB)).toEqual({
      ok: false,
      error: "extension",
    });
    expect(checkDeclaredModel(declared("sans-extension"), MB)).toEqual({
      ok: false,
      error: "extension",
    });
    expect(checkDeclaredModel(declared("facture.exe.svg"), MB)).toEqual({
      ok: false,
      error: "doubleExtension",
    });
    expect(checkDeclaredModel(declared("page.html.cwprj"), MB)).toEqual({
      ok: false,
      error: "doubleExtension",
    });
    expect(checkDeclaredModel(declared("a.svg", 0), MB)).toEqual({ ok: false, error: "empty" });
    expect(checkDeclaredModel(declared("a.svg", MB + 1), MB)).toEqual({
      ok: false,
      error: "tooLarge",
    });
    expect(checkDeclaredModel(declared(".svg"), MB)).toEqual({ ok: false, error: "fileName" });
  });
});

describe("checkDeclaredPreview", () => {
  it("accepte PNG, JPEG et WebP jusqu'à 5 Mo", () => {
    for (const [fileName, mime] of [
      ["a.png", "image/png"],
      ["a.JPG", "image/jpeg"],
      ["a.jpeg", "image/jpeg"],
      ["a.webp", "image/webp"],
    ]) {
      expect(checkDeclaredPreview({ fileName: fileName!, size: 5 * MB, mime: mime! }).ok).toBe(
        true,
      );
    }
  });

  it("refuse les autres types, les fichiers vides ou trop lourds", () => {
    expect(checkDeclaredPreview({ fileName: "a.gif", size: 10, mime: "image/gif" })).toEqual({
      ok: false,
      error: "imageType",
    });
    expect(checkDeclaredPreview({ fileName: "a.png", size: 10, mime: "image/svg+xml" })).toEqual({
      ok: false,
      error: "imageType",
    });
    expect(checkDeclaredPreview({ fileName: "a.png", size: 0, mime: "image/png" })).toEqual({
      ok: false,
      error: "empty",
    });
    expect(
      checkDeclaredPreview({ fileName: "a.png", size: 5 * MB + 1, mime: "image/png" }),
    ).toEqual({ ok: false, error: "imageTooLarge" });
    expect(checkDeclaredPreview({ fileName: "x.exe.png", size: 1, mime: "image/png" })).toEqual({
      ok: false,
      error: "doubleExtension",
    });
  });
});

describe("checkCwprjContent", () => {
  const pe = () => {
    const buffer = Buffer.alloc(256);
    buffer.write("MZ", 0, "latin1");
    buffer.writeUInt32LE(0x80, 0x3c);
    buffer.write("PE\0\0", 0x80, "latin1");
    return buffer;
  };

  it("accepte un contenu opaque (comme un vrai .cwprj chiffré), ZIP ou XML", async () => {
    expect(await checkCwprjContent(demoCwprj("test"))).toEqual({ ok: true, value: null });
    expect(await checkCwprjContent(Buffer.from("PK\u0003\u0004contenu"))).toMatchObject({
      ok: true,
    });
    expect(await checkCwprjContent(Buffer.from('<?xml version="1.0"?><project/>'))).toMatchObject({
      ok: true,
    });
    // « MZ » seul, sans en-tête PE : octets aléatoires plausibles, accepté.
    expect(await checkCwprjContent(Buffer.from("MZ" + "x".repeat(100)))).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ["exécutable Windows", pe()],
    ["ELF", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])],
    ["Mach-O", Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 7, 0, 0, 1])],
    ["script shell", Buffer.from("#!/bin/sh\nrm -rf /")],
    ["page HTML", Buffer.from("\uFEFF  <!DOCTYPE html><html><body>x</body></html>")],
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["script", Buffer.from("<script>alert(1)</script>")],
  ])("refuse : %s", async (_label, buffer) => {
    expect(await checkCwprjContent(buffer)).toEqual({ ok: false, error: "signature" });
  });

  it("refuse un fichier vide", async () => {
    expect(await checkCwprjContent(new Uint8Array())).toEqual({ ok: false, error: "empty" });
  });
});

describe("detectPreviewImage", () => {
  it("lit la signature réelle", async () => {
    expect(await detectPreviewImage(PNG_1PX)).toEqual({ ok: true, value: "image/png" });
    expect(await detectPreviewImage(Buffer.from("GIF89a......"))).toEqual({
      ok: false,
      error: "imageType",
    });
    expect(await detectPreviewImage(Buffer.from("<svg/>"))).toEqual({
      ok: false,
      error: "imageType",
    });
    expect(await detectPreviewImage(new Uint8Array())).toEqual({ ok: false, error: "empty" });
  });
});

describe("utilitaires", () => {
  it("formatFromFileName et sha256", () => {
    expect(formatFromFileName("a.SVG")).toBe("SVG");
    expect(formatFromFileName("a.cwprj")).toBe("CWPRJ");
    expect(formatFromFileName("a.png")).toBeNull();
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
