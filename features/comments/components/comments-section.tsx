"use client";

import { MessageCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/auth/auth-gate";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FieldShell, inputClass } from "@/components/forms/text-field";
import { pillButton } from "@/components/ui/pill-button";
import {
  createCommentAction,
  deleteCommentAction,
  loadCommentsAction,
} from "@/features/comments/actions";
import { COMMENT_MAX_LENGTH } from "@/features/comments/schemas";
import type { CommentPage, CommentView } from "@/features/comments/service";
import type { Failure } from "@/lib/result";
import { cn } from "@/lib/utils";

/**
 * Commentaires de la fiche : formulaire (membre) ou invitation à se connecter (visiteur),
 * liste du plus récent au plus ancien, suite chargée à la demande, suppression confirmée.
 */
export function CommentsSection({
  modelId,
  initial,
  total,
}: {
  modelId: string;
  initial: CommentPage;
  total: number;
}) {
  const t = useTranslations("comments");
  const tRoot = useTranslations();
  const gate = useAuthGate();
  const pathname = usePathname();
  const [comments, setComments] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [count, setCount] = useState(total);
  const [toDelete, setToDelete] = useState<CommentView | null>(null);
  const [loading, startLoading] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const reportError = (failure: Failure) => {
    const key = failure.error.message;
    toast.error(tRoot.has(key) ? tRoot(key) : tRoot("errors.generic"));
  };

  const loadMore = () =>
    startLoading(async () => {
      if (!cursor) return;
      const result = await loadCommentsAction({ modelId, cursor });
      if (!result.ok) return reportError(result);
      setComments((current) => [...current, ...result.data.items]);
      setCursor(result.data.nextCursor);
    });

  const remove = () =>
    startDeleting(async () => {
      if (!toDelete) return;
      const result = await deleteCommentAction({ commentId: toDelete.id });
      const removed = toDelete;
      setToDelete(null);
      if (!result.ok) return reportError(result);
      setComments((current) => current.filter((comment) => comment.id !== removed.id));
      setCount((current) => Math.max(0, current - 1));
      toast.success(t("deleted"));
    });

  return (
    <section aria-labelledby="comments" className="flex max-w-[760px] flex-col gap-5 pt-12">
      <h2 id="comments" className="m-0 text-[22px] font-bold md:text-[26px]">
        {t("title", { count })}
      </h2>

      {gate.signedIn ? (
        <CommentForm
          modelId={modelId}
          onCreated={(comment) => {
            setComments((current) => [comment, ...current]);
            setCount((current) => current + 1);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-muted px-5 py-4">
          <p className="m-0 mr-auto text-text-secondary">{t("visitorText")}</p>
          <button
            type="button"
            onClick={() => gate.open("comment", `${pathname}#comments`)}
            className={pillButton({ variant: "outline", size: "sm" })}
          >
            {t("visitorButton")}
          </button>
        </div>
      )}

      {comments.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onDelete={() => setToDelete(comment)} />
          ))}
        </ol>
      ) : (
        <p className="m-0 flex items-center gap-3 text-muted-foreground">
          <MessageCircle aria-hidden="true" className="size-5 shrink-0" />
          {t("empty")}
        </p>
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className={pillButton({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {t("more")}
        </button>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("deleteTitle")}
        description={t("deleteText")}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("cancel")}
        pending={deleting}
        onConfirm={remove}
      />
    </section>
  );
}

function CommentItem({ comment, onDelete }: { comment: CommentView; onDelete: () => void }) {
  const t = useTranslations("comments");
  const format = useFormatter();
  const { author } = comment;
  const id = `comment-${comment.id}`;
  return (
    <li>
      <article
        aria-labelledby={id}
        className="flex gap-3 rounded-[20px] border-2 border-border px-4 py-4 md:px-5"
      >
        <Avatar pseudo={author.pseudo} className="size-9 shrink-0 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 id={id} className="m-0 text-base font-bold">
              {author.hasProfile ? (
                <Link href={`/members/${author.pseudoSlug}`} className="hover:text-primary">
                  {author.pseudo}
                </Link>
              ) : (
                author.pseudo
              )}
            </h3>
            <time
              dateTime={new Date(comment.createdAt).toISOString()}
              className="text-sm text-muted-foreground"
            >
              {format.dateTime(new Date(comment.createdAt), {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </time>
          </div>
          <p className="m-0 break-words whitespace-pre-line text-text-secondary">
            {comment.content}
          </p>
        </div>
        {comment.canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("delete", { pseudo: author.pseudo })}
            className="inline-flex size-11 shrink-0 items-center justify-center self-start rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        )}
      </article>
    </li>
  );
}

function CommentForm({
  modelId,
  onCreated,
}: {
  modelId: string;
  onCreated: (comment: CommentView) => void;
}) {
  const t = useTranslations("comments");
  const tRoot = useTranslations();
  const fieldId = useId();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createCommentAction({ modelId, content });
      if (result.ok) {
        onCreated(result.data);
        setContent("");
        setError(undefined);
        toast.success(t("published"));
        return;
      }
      if (result.error.fields?.content) {
        setError(result.error.fields.content);
      } else if (result.error.code === "RATE_LIMITED") {
        toast.error(t("rateLimited"));
      } else {
        const key = result.error.message;
        toast.error(tRoot.has(key) ? tRoot(key) : tRoot("errors.generic"));
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <FieldShell
        id={fieldId}
        label={t("label")}
        hint={t("hint", { count: COMMENT_MAX_LENGTH - content.length })}
        error={error}
      >
        {(describedBy) => (
          <textarea
            id={fieldId}
            name="content"
            value={content}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            onChange={(event) => setContent(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(inputClass, "h-auto min-h-24 py-3")}
          />
        )}
      </FieldShell>
      <button
        type="submit"
        disabled={pending}
        className={pillButton({ size: "md", className: "self-start" })}
      >
        {t("submit")}
      </button>
    </form>
  );
}
