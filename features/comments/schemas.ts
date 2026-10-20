import { z } from "@/lib/validation";

export const COMMENT_MAX_LENGTH = 1000;

/** Commentaire : texte brut de 1 à 1 000 caractères. Messages = `errors.field.*`. */
export const commentSchema = z.object({
  modelId: z.string().min(1).max(64),
  content: z
    .string({ error: "commentRequired" })
    .trim()
    .min(1, "commentRequired")
    .max(COMMENT_MAX_LENGTH, "commentLength"),
});

export const commentIdSchema = z.object({ commentId: z.string().min(1).max(64) });

export const commentPageSchema = z.object({
  modelId: z.string().min(1).max(64),
  cursor: z.string().max(512),
});
