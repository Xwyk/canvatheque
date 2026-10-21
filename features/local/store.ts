import type { LocalEntry } from "@/features/local/scan";
import type { DirectoryHandleLike } from "@/features/local/walk";

/**
 * Mémoire du mode local dans IndexedDB (navigateur uniquement, ADR-014) : le handle du dossier
 * (Chromium) et l'index de la dernière analyse, jamais le contenu des fichiers. Stockage
 * indisponible (navigation privée, données bloquées) : le mode local fonctionne sans mémoire.
 */

const DATABASE = "canvatheque-local";
const STORE = "library";
const KEY = "last";

export type SavedLibrary = {
  folderName: string;
  scannedAt: number;
  truncated: boolean;
  entries: LocalEntry[];
  /** Handle du dossier (Chromium), pour le rescanner après une nouvelle autorisation. */
  handle?: DirectoryHandleLike;
};

function request<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(new Error("IndexedDB indisponible", { cause: open.error }));
    open.onsuccess = () => {
      const database = open.result;
      const operation = run(database.transaction(STORE, mode).objectStore(STORE));
      operation.onsuccess = () => {
        database.close();
        resolve(operation.result);
      };
      operation.onerror = () => {
        database.close();
        reject(new Error("Opération IndexedDB en échec", { cause: operation.error }));
      };
    };
  });
}

export async function loadLibrary(): Promise<SavedLibrary | null> {
  try {
    return ((await request((store) => store.get(KEY), "readonly")) as SavedLibrary) ?? null;
  } catch {
    return null;
  }
}

export async function saveLibrary(library: SavedLibrary): Promise<void> {
  try {
    await request((store) => store.put(library, KEY), "readwrite");
  } catch {
    // stockage indisponible : la prochaine visite repartira de zéro
  }
}

/** « Oublier ce dossier » : supprime toute la base du mode local. */
export function forgetLibrary(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const deletion = indexedDB.deleteDatabase(DATABASE);
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => resolve();
      deletion.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
