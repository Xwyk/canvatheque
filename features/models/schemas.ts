import { z } from "zod";
import { MAX_TAGS, TAG_MAX_LENGTH } from "@/lib/tags";

/**
 * Schémas partagés client/serveur de la publication. Messages = clés `errors.field.*`.
 */

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

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 5000;

const id = z.string().min(1).max(64);

export const modelDetailsSchema = z.object({
  modelId: id,
  title: z
    .string({ error: "required" })
    .trim()
    .min(TITLE_MIN_LENGTH, "titleLength")
    .max(TITLE_MAX_LENGTH, "titleLength"),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH, "descriptionLength").default(""),
  categoryId: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((value) => value || null),
  license: z
    .enum(LICENSES, { error: "license" })
    .nullish()
    .transform((value) => value ?? null),
  tags: z
    .array(z.string().max(TAG_MAX_LENGTH * 2))
    .max(MAX_TAGS * 2, "tagsCount")
    .default([]),
});
export type ModelDetailsInput = z.input<typeof modelDetailsSchema>;
export type ModelDetails = z.output<typeof modelDetailsSchema>;

export const publishSchema = z.object({
  modelId: id,
  certifyRights: z.literal(true, { error: "certifyRights" }),
});

export const modelIdSchema = z.object({ modelId: id });

export const tagQuerySchema = z.string().trim().max(TAG_MAX_LENGTH);
