import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { forgetLibrary, loadLibrary, saveLibrary, type SavedLibrary } from "@/features/local/store";

const library: SavedLibrary = {
  folderName: "Modèles",
  scannedAt: 1,
  truncated: false,
  entries: [
    {
      id: "a.svg",
      name: "a.svg",
      path: "a.svg",
      folder: "",
      size: 3,
      lastModified: 0,
      format: "SVG",
      checksum: "abc",
      tooLarge: false,
    },
  ],
};

describe("mémoire IndexedDB du mode local", () => {
  it("enregistre, relit puis oublie la dernière analyse", async () => {
    expect(await loadLibrary()).toBeNull();
    await saveLibrary(library);
    expect(await loadLibrary()).toEqual(library);
    await saveLibrary({ ...library, folderName: "Autre" });
    expect((await loadLibrary())?.folderName).toBe("Autre");
    await forgetLibrary();
    expect(await loadLibrary()).toBeNull();
  });

  it("stockage indisponible : aucune erreur, rien de mémorisé", async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
    try {
      await saveLibrary(library);
      expect(await loadLibrary()).toBeNull();
      await expect(forgetLibrary()).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { value: original, configurable: true });
    }
  });
});
