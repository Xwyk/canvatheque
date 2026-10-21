import { sha256Hex } from "@/features/local/scan";
import type { Hasher } from "@/features/local/walk";

/** Hachage direct (repli sans Worker, tests). */
export const directHasher: Hasher = async (file) => sha256Hex(await file.arrayBuffer());

/**
 * Hachage dans un Web Worker (`hash.worker.ts`) ; `terminate` l'arrête net (annulation).
 * Sans Worker disponible, repli sur le hachage direct.
 */
export function createWorkerHasher(): { hash: Hasher; terminate: () => void } {
  if (typeof Worker === "undefined") return { hash: directHasher, terminate: () => {} };
  const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<
    number,
    { resolve: (checksum: string) => void; reject: (error: Error) => void }
  >();
  let next = 0;
  worker.onmessage = (event: MessageEvent<{ id: number; checksum?: string; error?: boolean }>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.checksum) request.resolve(event.data.checksum);
    else request.reject(new Error("Lecture du fichier impossible"));
  };
  return {
    hash: (file) =>
      new Promise((resolve, reject) => {
        next += 1;
        pending.set(next, { resolve, reject });
        worker.postMessage({ id: next, file });
      }),
    terminate: () => {
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error("Analyse annulée"));
      pending.clear();
    },
  };
}
