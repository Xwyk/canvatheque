import {
  formatOf,
  isIgnoredDirectory,
  SCAN_LIMITS,
  toEntry,
  type FoundFile,
  type LocalEntry,
} from "@/features/local/scan";

/**
 * Parcours d'un dossier choisi avec `showDirectoryPicker` (File System Access, Chromium) et
 * analyse des fichiers trouvés. Types structurels minimaux : ils décrivent les handles du
 * navigateur et se simulent facilement en test.
 */

export type FileHandleLike = { kind: "file"; name: string; getFile(): Promise<File> };
export type DirectoryHandleLike = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
};

export class ScanAborted extends Error {
  constructor() {
    super("Analyse annulée");
    this.name = "ScanAborted";
  }
}

const checkAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ScanAborted();
};

/** Fichiers `.svg` et `.cwprj` du dossier, dossiers cachés et système ignorés, plafonds appliqués. */
export async function walkDirectory(
  root: DirectoryHandleLike,
  signal?: AbortSignal,
): Promise<{ found: FoundFile[]; truncated: boolean }> {
  const found: FoundFile[] = [];
  let truncated = false;

  async function visit(directory: DirectoryHandleLike, prefix: string, depth: number) {
    for await (const handle of directory.values()) {
      checkAborted(signal);
      if (truncated) return;
      if (handle.kind === "directory") {
        if (depth < SCAN_LIMITS.maxDepth && !isIgnoredDirectory(handle.name)) {
          await visit(handle, `${prefix}${handle.name}/`, depth + 1);
        }
      } else if (formatOf(handle.name)) {
        if (found.length >= SCAN_LIMITS.maxFiles) {
          truncated = true;
          return;
        }
        found.push({ file: await handle.getFile(), path: `${prefix}${handle.name}` });
      }
    }
  }

  await visit(root, "", 0);
  return { found, truncated };
}

export type Hasher = (file: File) => Promise<string>;

/**
 * Empreintes des fichiers trouvés, un par un (la mémoire ne garde qu'un fichier à la fois).
 * Les fichiers au-delà de `maxFileBytes` sont listés sans empreinte.
 */
export async function analyzeFiles(
  found: FoundFile[],
  {
    hash,
    maxFileBytes,
    signal,
    onProgress,
  }: {
    hash: Hasher;
    maxFileBytes: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<LocalEntry[]> {
  const entries: LocalEntry[] = [];
  for (const [index, item] of found.entries()) {
    checkAborted(signal);
    const checksum = item.file.size > maxFileBytes ? null : await hash(item.file);
    entries.push(toEntry(item, checksum, maxFileBytes));
    onProgress?.(index + 1, found.length);
  }
  return entries;
}
