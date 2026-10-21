/**
 * Clés de déchiffrement des projets CanvasWorkspace (`CWPRJ_KEY`, `CWPRJ_IV`, ADR-013).
 * Sans dépendance : validé au démarrage par `lib/env.ts`, utilisé par `lib/cwprj.ts`.
 */

export type CwprjKey = { key: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> };

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 16;

function hexToBytes(hex: string, bytes: number, name: string): Uint8Array<ArrayBuffer> {
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(hex)) {
    throw new Error(`${name} : ${bytes * 2} caractères hexadécimaux attendus`);
  }
  return Uint8Array.from({ length: bytes }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

const split = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Paires clé/IV, listes séparées par des virgules (rotation de clé : la première qui déchiffre
 * l'emporte). Aucune des deux variables : fonction désactivée (`[]`).
 */
export function parseCwprjKeys(keys?: string, ivs?: string): CwprjKey[] {
  if (!keys && !ivs) return [];
  if (!keys || !ivs) throw new Error("CWPRJ_KEY et CWPRJ_IV se renseignent ensemble");
  const keyList = split(keys);
  const ivList = split(ivs);
  if (keyList.length !== ivList.length) {
    throw new Error("CWPRJ_KEY et CWPRJ_IV doivent compter autant de valeurs");
  }
  return keyList.map((key, index) => ({
    key: hexToBytes(key, KEY_BYTES, "CWPRJ_KEY"),
    iv: hexToBytes(ivList[index]!, IV_BYTES, "CWPRJ_IV"),
  }));
}
