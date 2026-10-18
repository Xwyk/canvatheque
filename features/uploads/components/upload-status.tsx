"use client";

import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UploadPhase } from "@/features/uploads/use-upload";

/** Ligne de progression d'un envoi (planche Publier), état de traitement ou erreur. */
export function UploadStatus({ state, onCancel }: { state: UploadPhase; onCancel: () => void }) {
  const t = useTranslations("publish.upload");
  const tRoot = useTranslations();

  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    const { error } = state;
    const values =
      error.code === "RATE_LIMITED"
        ? { minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) }
        : undefined;
    return (
      <p
        role="alert"
        className="m-0 flex items-start gap-2.5 rounded-[14px] bg-destructive/10 px-4 py-3 text-[15px] font-semibold text-destructive"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          {state.fileName && <span className="font-bold">{state.fileName} : </span>}
          {tRoot.has(error.message) ? tRoot(error.message, values) : tRoot("errors.generic")}
        </span>
      </p>
    );
  }

  const percent = state.phase === "uploading" ? state.percent : 100;
  return (
    <div className="flex items-center gap-4 rounded-[20px] border p-4">
      <span
        aria-hidden="true"
        className="h-14 w-14 shrink-0 rounded-xl bg-tint-teal dark:bg-muted"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex justify-between gap-3 text-[15px] font-semibold">
          <span className="truncate">{state.fileName}</span>
          <span role="status" className="inline-flex shrink-0 items-center gap-1.5">
            {state.phase === "processing" ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                {t("processing")}
              </>
            ) : (
              `${percent} %`
            )}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t("progress", { name: state.fileName })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2.5 overflow-hidden rounded-[5px] bg-border"
        >
          <div
            className="h-full rounded-[5px] bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {state.phase === "uploading" && (
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("cancel")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
