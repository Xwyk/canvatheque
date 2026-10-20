import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { logger } from "@/lib/logger";
import { can, type Actor } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

/**
 * Commentaires des modèles publiés (étape 7) : texte brut, du plus récent au plus ancien,
 * pagination par curseur (date, id). Suppression logique par l'auteur du commentaire,
 * l'auteur du modèle ou un administrateur (journalisée dans ce dernier cas).
 */

export const COMMENTS_PAGE_SIZE = 20;

export type CommentView = {
  id: string;
  content: string;
  createdAt: Date;
  author: { pseudo: string; pseudoSlug: string; hasProfile: boolean };
  canDelete: boolean;
};

export type CommentPage = { items: CommentView[]; nextCursor: string | null };

const COMMENT_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  authorId: true,
  author: { select: { pseudo: true, pseudoSlug: true, isSystem: true, bannedAt: true } },
} as const satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>;

function toView(row: CommentRow, actor: Actor, modelOwnerId: string): CommentView {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    author: {
      pseudo: row.author.pseudo,
      pseudoSlug: row.author.pseudoSlug,
      hasProfile: !row.author.isSystem && row.author.bannedAt === null,
    },
    canDelete: can(actor, "comment:delete", { ownerId: row.authorId, modelOwnerId }),
  };
}

/** Une page de commentaires d'un modèle (`cursor` : suite de la page précédente). */
export async function listComments(
  prisma: PrismaClient,
  actor: Actor,
  model: { id: string; authorId: string },
  cursor?: string | null,
): Promise<CommentPage> {
  const after = decodeCursor(cursor);
  const before = after ? new Date(after.value) : null;
  const paged = after && before && !Number.isNaN(before.getTime());
  const rows = await prisma.comment.findMany({
    where: {
      modelId: model.id,
      deletedAt: null,
      ...(paged
        ? { OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: after.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: COMMENTS_PAGE_SIZE + 1,
    select: COMMENT_SELECT,
  });
  const page = rows.slice(0, COMMENTS_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((row) => toView(row, actor, model.authorId)),
    nextCursor:
      rows.length > COMMENTS_PAGE_SIZE && last
        ? encodeCursor({ value: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

export function countComments(prisma: PrismaClient, modelId: string): Promise<number> {
  return prisma.comment.count({ where: { modelId, deletedAt: null } });
}

export async function createComment(
  prisma: PrismaClient,
  actor: Actor,
  input: { modelId: string; content: string },
): Promise<Result<CommentView>> {
  if (!actor) return fail("UNAUTHORIZED", "errors.unauthorized");
  if (!can(actor, "comment:create")) return fail("FORBIDDEN", "errors.forbidden");
  const model = await prisma.model.findFirst({
    where: { id: input.modelId, status: "PUBLISHED", deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!model) return fail("NOT_FOUND", "errors.notFound");
  const row = await prisma.comment.create({
    data: { modelId: model.id, authorId: actor.id, content: input.content },
    select: COMMENT_SELECT,
  });
  logger.info({ event: "comment_created", commentId: row.id, modelId: model.id }, "Commentaire");
  return ok(toView(row, actor, model.authorId));
}

/** Suppression logique ; par un administrateur qui n'en est pas l'auteur : journalisée. */
export async function deleteComment(
  prisma: PrismaClient,
  actor: Actor,
  commentId: string,
): Promise<Result<null>> {
  if (!actor) return fail("UNAUTHORIZED", "errors.unauthorized");
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null, model: { deletedAt: null } },
    select: {
      id: true,
      authorId: true,
      content: true,
      model: { select: { authorId: true, title: true } },
    },
  });
  if (!comment) return fail("NOT_FOUND", "errors.comment.notFound");
  const resource = { ownerId: comment.authorId, modelOwnerId: comment.model.authorId };
  if (!can(actor, "comment:delete", resource)) return fail("FORBIDDEN", "errors.forbidden");

  const moderated = actor.id !== comment.authorId && actor.id !== comment.model.authorId;
  await prisma.$transaction([
    prisma.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } }),
    ...(moderated
      ? [
          prisma.adminAction.create({
            data: {
              adminId: actor.id,
              type: "COMMENT_DELETE",
              targetType: "Comment",
              targetId: comment.id,
              details: { label: comment.model.title, excerpt: comment.content.slice(0, 120) },
            },
          }),
        ]
      : []),
  ]);
  return ok(null);
}
