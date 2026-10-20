/** Motifs de signalement (enum Prisma `ReportReason`), sans dépendance : importable côté client. */
export const REPORT_REASONS = [
  "DROITS_AUTEUR",
  "CONTENU_INAPPROPRIE",
  "FICHIER_DEFECTUEUX",
  "SPAM",
  "AUTRE",
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX_LENGTH = 1000;
