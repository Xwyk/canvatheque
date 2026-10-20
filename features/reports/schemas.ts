import { z } from "@/lib/validation";

/** Motifs de signalement, dans l'ordre d'affichage (enum Prisma `ReportReason`). */
export const REPORT_REASONS = [
  "DROITS_AUTEUR",
  "CONTENU_INAPPROPRIE",
  "FICHIER_DEFECTUEUX",
  "SPAM",
  "AUTRE",
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX_LENGTH = 1000;

/** Signalement d'un modèle ; précisions obligatoires pour le motif « Autre ». Messages = `errors.field.*`. */
export const reportSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    reason: z.enum(REPORT_REASONS, { error: "reportReason" }),
    details: z
      .string()
      .trim()
      .max(REPORT_DETAILS_MAX_LENGTH, "reportDetailsLength")
      .default("")
      .transform((value) => value || null),
  })
  .refine((report) => report.reason !== "AUTRE" || report.details !== null, {
    path: ["details"],
    message: "reportDetailsRequired",
  });

export type ReportInput = z.infer<typeof reportSchema>;
