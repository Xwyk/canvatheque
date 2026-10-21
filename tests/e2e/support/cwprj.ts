import { createCipheriv } from "node:crypto";

/**
 * Projet CanvasWorkspace synthétique pour les E2E (ADR-013), chiffré avec la paire clé/IV
 * **de test** de docker-compose.e2e.yml (jamais la clé réelle).
 */
export const E2E_CWPRJ_KEY =
  process.env.E2E_CWPRJ_KEY ?? "16987a1d102397ba490f00e428dd20d4b8293fb00f56a331bed9bf4ee96ed178";
export const E2E_CWPRJ_IV = process.env.E2E_CWPRJ_IV ?? "4f8b82caff43a6382fda2e877174e6b3";

export function e2eCwprj(designName: string, thumbnail: Buffer): Buffer {
  const xml = `<?xml version="1.0" encoding="utf-8"?><FCMX><FileHeaderSection><DesignName>${designName}</DesignName><ThumbnailImage>${thumbnail.toString("base64")}</ThumbnailImage></FileHeaderSection><PageSection/></FCMX>`;
  const cipher = createCipheriv(
    "aes-256-cbc",
    Buffer.from(E2E_CWPRJ_KEY, "hex"),
    Buffer.from(E2E_CWPRJ_IV, "hex"),
  );
  return Buffer.concat([cipher.update(xml, "utf8"), cipher.final()]);
}
