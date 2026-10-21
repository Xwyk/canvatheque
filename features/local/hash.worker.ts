/// <reference lib="webworker" />
import { sha256Hex } from "@/features/local/scan";

/**
 * Empreintes SHA-256 hors du fil principal (mode local, ADR-014) : la page reste fluide
 * pendant l'analyse de gros dossiers. Le fichier est lu ici et n'est envoyé nulle part.
 */

type Request = { id: number; file: File };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<Request>) => {
  const { id, file } = event.data;
  try {
    scope.postMessage({ id, checksum: await sha256Hex(await file.arrayBuffer()) });
  } catch {
    scope.postMessage({ id, error: true });
  }
};
