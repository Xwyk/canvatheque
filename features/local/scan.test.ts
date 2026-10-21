import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { directHasher } from "@/features/local/hasher";
import {
  applyView,
  DEFAULT_VIEW,
  duplicateGroups,
  filesFromInput,
  folderOf,
  folderTree,
  formatOf,
  isAcceptedPath,
  isInFolder,
  isIgnoredDirectory,
  relativeToRoot,
  SCAN_LIMITS,
  sha256Hex,
  summarize,
  toEntry,
  type LocalEntry,
} from "@/features/local/scan";
import {
  analyzeFiles,
  ScanAborted,
  walkDirectory,
  type DirectoryHandleLike,
  type FileHandleLike,
} from "@/features/local/walk";

const file = (name: string, content = name, lastModified = 0, relative = "") => {
  const result = new File([content], name, { lastModified });
  if (relative) Object.defineProperty(result, "webkitRelativePath", { value: relative });
  return result;
};

const entry = (path: string, overrides: Partial<LocalEntry> = {}): LocalEntry => ({
  id: path,
  name: path.split("/").pop()!,
  path,
  folder: folderOf(path),
  size: 10,
  lastModified: 0,
  format: path.endsWith(".svg") ? "SVG" : "CWPRJ",
  checksum: path,
  tooLarge: false,
  ...overrides,
});

/** Faux dossier (handles de File System Access). */
function directory(
  name: string,
  children: (FileHandleLike | DirectoryHandleLike)[],
): DirectoryHandleLike {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* children;
    },
  };
}
const fileHandle = (name: string, content = name): FileHandleLike => ({
  kind: "file",
  name,
  getFile: async () => file(name, content),
});

describe("règles de l'analyse", () => {
  it("formats, dossiers ignorés, chemins acceptés", () => {
    expect([formatOf("a.SVG"), formatOf("b.cwprj"), formatOf("c.png"), formatOf(".x.svg")]).toEqual(
      ["SVG", "CWPRJ", null, null],
    );
    for (const name of [
      ".git",
      "node_modules",
      "$RECYCLE.BIN",
      "System Volume Information",
      "__MACOSX",
    ]) {
      expect(isIgnoredDirectory(name)).toBe(true);
    }
    expect(isIgnoredDirectory("Noël")).toBe(false);
    expect(isAcceptedPath("Noël/sapin.svg")).toBe(true);
    expect(isAcceptedPath(".cache/sapin.svg")).toBe(false);
    expect(isAcceptedPath(`${"d/".repeat(SCAN_LIMITS.maxDepth + 1)}x.svg`)).toBe(false);
    expect(isAcceptedPath(`${"d/".repeat(SCAN_LIMITS.maxDepth)}x.svg`)).toBe(true);
    expect(relativeToRoot("Racine/a/b.svg", "b.svg")).toBe("a/b.svg");
    expect(relativeToRoot("", "b.svg")).toBe("b.svg");
    expect(folderOf("a/b/c.svg")).toBe("a/b");
    expect(folderOf("c.svg")).toBe("");
  });

  it("champ webkitdirectory : filtres et plafond", () => {
    const { found, truncated } = filesFromInput([
      file("a.svg", "a", 0, "Racine/a.svg"),
      file("b.png", "b", 0, "Racine/b.png"),
      file("c.cwprj", "c", 0, "Racine/.cache/c.cwprj"),
      file("d.cwprj", "d", 0, "Racine/sous/d.cwprj"),
    ]);
    expect(found.map((item) => item.path)).toEqual(["a.svg", "sous/d.cwprj"]);
    expect(truncated).toBe(false);
    const many = Array.from({ length: SCAN_LIMITS.maxFiles + 1 }, (_, i) => file(`${i}.svg`));
    expect(filesFromInput(many)).toMatchObject({ truncated: true });
    expect(filesFromInput(many).found).toHaveLength(SCAN_LIMITS.maxFiles);
  });

  it("doublons regroupés, synthèse", () => {
    const now = Date.UTC(2026, 9, 21);
    const entries = [
      entry("a.svg", { checksum: "x", size: 100, lastModified: now - 1000 }),
      entry("copies/a.svg", { checksum: "x", size: 100 }),
      entry("b/c.cwprj", { checksum: "y", size: 50 }),
      entry("b/d.cwprj", { checksum: "y", size: 50 }),
      entry("b/e.cwprj", { checksum: "y", size: 50 }),
      entry("f.svg", { checksum: null, tooLarge: true, size: 999 }),
    ];
    expect(duplicateGroups(entries).map((group) => group.map((item) => item.path))).toEqual([
      ["b/c.cwprj", "b/d.cwprj", "b/e.cwprj"],
      ["a.svg", "copies/a.svg"],
    ]);
    expect(summarize(entries, now)).toEqual({
      total: 6,
      byFormat: { SVG: 3, CWPRJ: 3 },
      totalSize: 1349,
      duplicateFiles: 5,
      recent: 1,
    });
  });

  it("recherche sans accents, filtres, tris", () => {
    const entries = [
      entry("Noël/sapin.svg", { size: 5, lastModified: 3 }),
      entry("noel/étoile.cwprj", { size: 9, lastModified: 1 }),
      entry("boite.svg", { size: 1, lastModified: 2 }),
    ];
    const paths = (view: Partial<typeof DEFAULT_VIEW>) =>
      applyView(entries, { ...DEFAULT_VIEW, ...view }).map((item) => item.path);
    expect(paths({})).toEqual(["boite.svg", "noel/étoile.cwprj", "Noël/sapin.svg"]);
    expect(paths({ q: "NOEL" })).toEqual(["noel/étoile.cwprj", "Noël/sapin.svg"]);
    expect(paths({ format: "SVG", sort: "size" })).toEqual(["Noël/sapin.svg", "boite.svg"]);
    expect(paths({ folder: "noel", sort: "date" })).toEqual(["noel/étoile.cwprj"]);
    expect(paths({ folder: "" })).toHaveLength(3);
    expect(paths({ sort: "date" })).toEqual(["Noël/sapin.svg", "boite.svg", "noel/étoile.cwprj"]);
  });

  it("arborescence des dossiers : comptes cumulés, tri par nom ; filtre avec sous-dossiers", () => {
    const entries = [
      entry("a.svg"),
      entry("Noël/b.svg"),
      entry("Noël/anciens/c.svg"),
      entry("Noël/anciens/d.cwprj"),
      entry("Fleurs/e.svg"),
      entry("Noëlle/f.svg"),
    ];
    const tree = folderTree(entries, "Modèles");
    const shape = (node: ReturnType<typeof folderTree>): unknown => [
      node.name,
      node.path,
      node.count,
      node.children.map(shape),
    ];
    expect(shape(tree)).toEqual([
      "Modèles",
      "",
      6,
      [
        ["Fleurs", "Fleurs", 1, []],
        ["Noël", "Noël", 3, [["anciens", "Noël/anciens", 2, []]]],
        ["Noëlle", "Noëlle", 1, []],
      ],
    ]);
    // « Noël » couvre ses sous-dossiers, pas « Noëlle ».
    expect(entries.filter((item) => isInFolder(item, "Noël")).map((item) => item.path)).toEqual([
      "Noël/b.svg",
      "Noël/anciens/c.svg",
      "Noël/anciens/d.cwprj",
    ]);
    expect(entries.filter((item) => isInFolder(item, ""))).toHaveLength(6);
  });

  it("empreinte identique à celle du serveur (SHA-256 hexadécimal)", async () => {
    const content = "<svg xmlns='http://www.w3.org/2000/svg'/>";
    const expected = createHash("sha256").update(content).digest("hex");
    expect(await sha256Hex(new TextEncoder().encode(content).buffer)).toBe(expected);
    expect(await directHasher(file("a.svg", content))).toBe(expected);
  });
});

describe("parcours et analyse", () => {
  it("parcourt les sous-dossiers, ignore cachés, système et autres extensions", async () => {
    const root = directory("Racine", [
      fileHandle("a.svg"),
      fileHandle("notes.txt"),
      directory(".git", [fileHandle("x.svg")]),
      directory("node_modules", [fileHandle("y.svg")]),
      directory("Noël", [fileHandle("b.cwprj"), directory("vieux", [fileHandle("c.svg")])]),
    ]);
    const { found, truncated } = await walkDirectory(root);
    expect(found.map((item) => item.path)).toEqual(["a.svg", "Noël/b.cwprj", "Noël/vieux/c.svg"]);
    expect(truncated).toBe(false);
  });

  it("plafonds de profondeur et de nombre, annulation", async () => {
    let deep: DirectoryHandleLike = directory("fond", [fileHandle("profond.svg")]);
    for (let i = 0; i < SCAN_LIMITS.maxDepth; i += 1) deep = directory(`d${i}`, [deep]);
    expect((await walkDirectory(directory("r", [deep]))).found).toEqual([]);

    const crowded = directory(
      "r",
      Array.from({ length: SCAN_LIMITS.maxFiles + 2 }, (_, i) => fileHandle(`${i}.svg`)),
    );
    const result = await walkDirectory(crowded);
    expect(result).toMatchObject({ truncated: true });
    expect(result.found).toHaveLength(SCAN_LIMITS.maxFiles);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      walkDirectory(directory("r", [fileHandle("a.svg")]), aborted.signal),
    ).rejects.toThrow(ScanAborted);
  });

  it("analyse : empreintes, fichier trop lourd sans empreinte, progression, annulation", async () => {
    const found = [
      { file: file("a.svg", "aaa"), path: "a.svg" },
      { file: file("gros.cwprj", "x".repeat(20)), path: "gros.cwprj" },
    ];
    const progress: number[] = [];
    const entries = await analyzeFiles(found, {
      hash: directHasher,
      maxFileBytes: 10,
      onProgress: (done) => progress.push(done),
    });
    expect(entries.map((item) => [item.path, item.checksum !== null, item.tooLarge])).toEqual([
      ["a.svg", true, false],
      ["gros.cwprj", false, true],
    ]);
    expect(progress).toEqual([1, 2]);
    expect(toEntry(found[0]!, "abc", 100)).toMatchObject({
      folder: "",
      format: "SVG",
      checksum: "abc",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeFiles(found, { hash: directHasher, maxFileBytes: 10, signal: controller.signal }),
    ).rejects.toThrow(ScanAborted);
  });
});
