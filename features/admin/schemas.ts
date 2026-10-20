import { z } from "@/lib/validation";

/** Schémas des actions d'administration. Messages = clés `errors.field.*`. */

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

const id = z.string().min(1).max(64);

/** Raison obligatoire de chaque action, journalisée et transmise au membre concerné. */
export const reasonField = z
  .string({ error: "required" })
  .trim()
  .min(REASON_MIN_LENGTH, "reasonLength")
  .max(REASON_MAX_LENGTH, "reasonLength");

export const modelModerationSchema = z.object({ modelId: id, reason: reasonField });

export const MODEL_ACTIONS = ["HIDE", "DELETE", "NONE"] as const;
export type ModelAction = (typeof MODEL_ACTIONS)[number];

export const resolveReportSchema = z.object({
  reportId: id,
  reason: reasonField,
  modelAction: z.enum(MODEL_ACTIONS),
});

export const dismissReportSchema = z.object({ reportId: id, reason: reasonField });

export const banSchema = z.object({
  userId: id,
  reason: reasonField,
  hideModels: z.boolean().default(false),
});

export const memberModerationSchema = z.object({ userId: id, reason: reasonField });

// --- Filtres des listes (paramètres d'URL, sans erreur : valeur par défaut) ------------------

const page = z.coerce.number().int().min(1).max(10_000).catch(1);
const query = z.string().trim().max(100).catch("");

export const REPORT_TABS = ["open", "closed"] as const;
export const MEMBER_FILTERS = ["all", "banned", "admins"] as const;
export const MODEL_FILTERS = ["all", "PUBLISHED", "HIDDEN", "DRAFT"] as const;
export const ACTION_TYPES = [
  "MODEL_HIDE",
  "MODEL_UNHIDE",
  "MODEL_DELETE",
  "USER_BAN",
  "USER_UNBAN",
  "USER_PROMOTE",
  "REPORT_RESOLVE",
  "REPORT_DISMISS",
  "COMMENT_DELETE",
] as const;

export const reportListSchema = z.object({ tab: z.enum(REPORT_TABS).catch("open"), page });
export const memberListSchema = z.object({
  q: query,
  filter: z.enum(MEMBER_FILTERS).catch("all"),
  page,
});
export const modelListSchema = z.object({
  q: query,
  status: z.enum(MODEL_FILTERS).catch("all"),
  page,
});
export const actionListSchema = z.object({
  type: z.enum(ACTION_TYPES).optional().catch(undefined),
  page,
});

/** Paramètres d'URL d'une page Next (`string | string[] | undefined`) → premières valeurs. */
export function firstValues(
  params: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}
