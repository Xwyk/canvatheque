/** Licences proposées (sans dépendance : importable par les composants client du catalogue). */
export const LICENSES = [
  "CC0",
  "CC_BY",
  "CC_BY_SA",
  "CC_BY_NC",
  "CC_BY_NC_SA",
  "PERSONAL_USE",
] as const;
export type LicenseValue = (typeof LICENSES)[number];

/** Groupes de licences de la galerie (planche Galerie). */
export const LICENSE_GROUPS = {
  free: ["CC0", "CC_BY", "CC_BY_SA"],
  noncommercial: ["CC_BY_NC", "CC_BY_NC_SA"],
  personal: ["PERSONAL_USE"],
} as const satisfies Record<string, readonly LicenseValue[]>;
