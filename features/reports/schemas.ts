import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from "@/features/reports/reasons";
import { z } from "@/lib/validation";

export {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  type ReportReasonValue,
} from "@/features/reports/reasons";

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
