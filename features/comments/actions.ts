"use server";

import { fieldErrors } from "@/features/auth/schemas";
import { commentIdSchema, commentPageSchema, commentSchema } from "@/features/comments/schemas";
import {
  createComment,
  deleteComment,
  listComments,
  type CommentPage,
  type CommentView,
} from "@/features/comments/service";
import { rateLimited } from "@/features/models/deps";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HOUR, rateLimitKey } from "@/lib/rate-limit";
import { fail, ok, type Result } from "@/lib/result";

/** Publie un commentaire ; limité à `RATE_LIMIT_COMMENT_PER_HOUR` par membre. */
export async function createCommentAction(input: unknown): Promise<Result<CommentView>> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "errors.unauthorized");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "errors.validation", { fields: fieldErrors(parsed.error) });
  }
  const limited = await rateLimited(rateLimitKey("comment", user.id), {
    limit: env().RATE_LIMIT_COMMENT_PER_HOUR,
    windowMs: HOUR,
  });
  if (limited) return limited;
  return createComment(db(), user, parsed.data);
}

export async function deleteCommentAction(input: unknown): Promise<Result<null>> {
  const parsed = commentIdSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "errors.validation");
  return deleteComment(db(), await getCurrentUser(), parsed.data.commentId);
}

/** Commentaires plus anciens (bouton « Afficher plus »). */
export async function loadCommentsAction(input: unknown): Promise<Result<CommentPage>> {
  const parsed = commentPageSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "errors.validation");
  const model = await db().model.findFirst({
    where: { id: parsed.data.modelId, status: "PUBLISHED", deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  return ok(await listComments(db(), await getCurrentUser(), model, parsed.data.cursor));
}
