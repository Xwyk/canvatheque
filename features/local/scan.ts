/**
 * Mode local (ADR-014) : règles pures de l'analyse d'un dossier de l'ordinateur, appliquées
 * dans le navigateur. Rien ici ne lit ni n'envoie de fichier.
 */

export type LocalFormat = "SVG" | "CWPRJ";

/** Plafonds de l'analyse (un dossier de sauvegarde peut contenir des milliers d'éléments). */
export const SCAN_LIMITS = { maxFiles: 5000, maxDepth: 12 } as const;

/** Dossiers ignorés en plus des dossiers cachés (nom commençant par un point). */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "$recycle.bin",
  "system volume information",
  "__macosx",
  "$windows.~bt",
]);

export function isIgnoredDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name.toLowerCase());
}

/** Format d'après l'extension ; fichiers cachés et autres extensions ignorés. */
export function formatOf(name: string): LocalFormat | null {
  if (name.startsWith(".")) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) return "SVG";
  if (lower.endsWith(".cwprj")) return "CWPRJ";
  return null;
}

/** Fichier candidat trouvé pendant le parcours (le contenu n'est pas encore lu). */
export type FoundFile = { file: File; path: string };

/** Fichier analysé ; `checksum` est null pour un fichier trop lourd (non haché). */
export type LocalEntry = {
  id: string;
  name: string;
  /** Chemin relatif au dossier choisi, séparé par des « / ». */
  path: string;
  /** Dossier parent (chemin relatif), "" à la racine. */
  folder: string;
  size: number;
  lastModified: number;
  format: LocalFormat;
  checksum: string | null;
  tooLarge: boolean;
};

export function folderOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/**
 * Chemin accepté : profondeur bornée, aucun dossier caché ou système. `path` est relatif au
 * dossier choisi (`webkitRelativePath` sans son premier segment, ou chemin des handles).
 */
export function isAcceptedPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.length - 1 > SCAN_LIMITS.maxDepth) return false;
  return parts.slice(0, -1).every((part) => !isIgnoredDirectory(part));
}

/** `webkitRelativePath` (« Dossier/sous/fichier.svg ») → chemin relatif au dossier choisi. */
export function relativeToRoot(webkitRelativePath: string, fallbackName: string): string {
  const path = webkitRelativePath || fallbackName;
  const index = path.indexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/** Candidats d'un `<input webkitdirectory>` : filtres et plafond appliqués. */
export function filesFromInput(files: Iterable<File>): { found: FoundFile[]; truncated: boolean } {
  const found: FoundFile[] = [];
  for (const file of files) {
    const path = relativeToRoot(file.webkitRelativePath, file.name);
    if (!formatOf(file.name) || !isAcceptedPath(path)) continue;
    if (found.length >= SCAN_LIMITS.maxFiles) return { found, truncated: true };
    found.push({ file, path });
  }
  return { found, truncated: false };
}

export function toEntry(
  { file, path }: FoundFile,
  checksum: string | null,
  maxFileBytes: number,
): LocalEntry {
  return {
    id: path,
    name: file.name,
    path,
    folder: folderOf(path),
    size: file.size,
    lastModified: file.lastModified,
    format: formatOf(file.name)!,
    checksum,
    tooLarge: file.size > maxFileBytes,
  };
}

/** Groupes de fichiers de même empreinte (au moins deux), du plus gros groupe au plus petit. */
export function duplicateGroups(entries: LocalEntry[]): LocalEntry[][] {
  const byChecksum = new Map<string, LocalEntry[]>();
  for (const entry of entries) {
    if (!entry.checksum) continue;
    const group = byChecksum.get(entry.checksum) ?? [];
    group.push(entry);
    byChecksum.set(entry.checksum, group);
  }
  return [...byChecksum.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.toSorted((a, b) => a.path.localeCompare(b.path, "fr")))
    .sort((a, b) => b.length - a.length || a[0]!.path.localeCompare(b[0]!.path, "fr"));
}

export type LocalSummary = {
  total: number;
  byFormat: Record<LocalFormat, number>;
  totalSize: number;
  duplicateFiles: number;
  /** Fichiers modifiés depuis moins de 30 jours. */
  recent: number;
};

const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

export function summarize(entries: LocalEntry[], now = Date.now()): LocalSummary {
  return {
    total: entries.length,
    byFormat: {
      SVG: entries.filter((entry) => entry.format === "SVG").length,
      CWPRJ: entries.filter((entry) => entry.format === "CWPRJ").length,
    },
    totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
    duplicateFiles: duplicateGroups(entries).reduce((sum, group) => sum + group.length, 0),
    recent: entries.filter((entry) => now - entry.lastModified < RECENT_MS).length,
  };
}

/** Nœud de l'arborescence des dossiers ; `count` compte aussi les sous-dossiers. */
export type FolderNode = { name: string; path: string; count: number; children: FolderNode[] };

/**
 * Arborescence des dossiers contenant des modèles (racine = dossier choisi, chemin ""),
 * enfants triés par nom.
 */
export function folderTree(entries: LocalEntry[], rootName: string): FolderNode {
  const root: FolderNode = { name: rootName, path: "", count: 0, children: [] };
  for (const entry of entries) {
    root.count += 1;
    let node = root;
    for (const part of entry.folder ? entry.folder.split("/") : []) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.children.find((candidate) => candidate.name === part);
      if (!child) {
        child = { name: part, path, count: 0, children: [] };
        node.children.push(child);
      }
      child.count += 1;
      node = child;
    }
  }
  const sort = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

/** Vrai si le fichier est dans ce dossier ou l'un de ses sous-dossiers ("" = tout). */
export function isInFolder(entry: LocalEntry, folder: string): boolean {
  return folder === "" || entry.folder === folder || entry.folder.startsWith(`${folder}/`);
}

export type LocalSort = "name" | "date" | "size";
export type LocalView = {
  q: string;
  format: LocalFormat | "all";
  folder: string | null;
  sort: LocalSort;
};

export const DEFAULT_VIEW: LocalView = { q: "", format: "all", folder: null, sort: "name" };

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Recherche (nom ou chemin, sans accents), filtres format et dossier, tri. */
export function applyView(entries: LocalEntry[], view: LocalView): LocalEntry[] {
  const query = normalize(view.q.trim());
  const sorters: Record<LocalSort, (a: LocalEntry, b: LocalEntry) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, "fr") || a.path.localeCompare(b.path, "fr"),
    date: (a, b) => b.lastModified - a.lastModified || a.path.localeCompare(b.path, "fr"),
    size: (a, b) => b.size - a.size || a.path.localeCompare(b.path, "fr"),
  };
  return entries
    .filter((entry) => view.format === "all" || entry.format === view.format)
    .filter((entry) => view.folder === null || isInFolder(entry, view.folder))
    .filter((entry) => !query || normalize(entry.path).includes(query))
    .toSorted(sorters[view.sort]);
}

/** Empreinte SHA-256 en hexadécimal, comme `fileChecksum` côté serveur. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
