"use client";

import { Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/auth/auth-gate";
import { FieldShell, inputClass } from "@/components/forms/text-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pillButton } from "@/components/ui/pill-button";
import { createReportAction } from "@/features/reports/actions";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  type ReportReasonValue,
} from "@/features/reports/reasons";
import { cn } from "@/lib/utils";

/** Pilule « Signaler » de la fiche ; visiteur : modale d'inscription. */
export function ReportButton({
  modelId,
  title,
  className,
}: {
  modelId: string;
  title: string;
  className?: string;
}) {
  const t = useTranslations("reports");
  const gate = useAuthGate();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => (gate.signedIn ? setOpen(true) : gate.open("report", pathname))}
        className={pillButton({ variant: "soft", size: "sm", className })}
      >
        <Flag aria-hidden="true" className="size-5" />
        {t("pill")}
      </button>
      <ReportDialog modelId={modelId} title={title} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ReportDialog({
  modelId,
  title,
  open,
  onClose,
}: {
  modelId: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("reports");
  const tRoot = useTranslations();
  const detailsId = useId();
  const [reason, setReason] = useState<ReportReasonValue | null>(null);
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const close = () => {
    setReason(null);
    setDetails("");
    setErrors({});
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createReportAction({ modelId, reason, details });
      if (result.ok) {
        toast.success(t("sent"));
        close();
        return;
      }
      if (result.error.fields) {
        setErrors(result.error.fields);
        return;
      }
      const key = result.error.message;
      if (result.error.code === "RATE_LIMITED") {
        toast.error(t("rateLimited"));
      } else {
        toast.error(tRoot.has(key) ? tRoot(key) : tRoot("errors.generic"));
      }
      if (result.error.code === "CONFLICT") close();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[28px] p-6 shadow-dialog sm:max-w-[520px] md:p-8"
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <div className="flex flex-col gap-2 pr-9">
          <DialogTitle className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em]">
            {t("title", { title })}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            {t("subtitle")}
          </DialogDescription>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <fieldset
            className="m-0 flex flex-col gap-2 border-0 p-0"
            aria-describedby={errors.reason ? "report-reason-error" : undefined}
          >
            <legend className="mb-2 text-[15px] font-bold">{t("reasonLegend")}</legend>
            {REPORT_REASONS.map((value) => (
              <label
                key={value}
                className={cn(
                  "grid min-h-11 cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-[14px] border-2 px-4 py-3",
                  reason === value ? "border-ink bg-muted" : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="row-span-2 mt-1 size-5 shrink-0 accent-primary"
                />
                <span className="font-bold">{t(`reasons.${value}.label`)}</span>
                <span className="text-sm text-text-secondary">{t(`reasons.${value}.hint`)}</span>
              </label>
            ))}
            {errors.reason && (
              <p id="report-reason-error" className="m-0 text-sm font-semibold text-destructive">
                {tRoot(`errors.field.${errors.reason}`)}
              </p>
            )}
          </fieldset>

          <FieldShell
            id={detailsId}
            label={reason === "AUTRE" ? t("detailsRequired") : t("details")}
            hint={t("detailsHint", { count: REPORT_DETAILS_MAX_LENGTH - details.length })}
            error={errors.details}
          >
            {(describedBy) => (
              <textarea
                id={detailsId}
                name="details"
                value={details}
                maxLength={REPORT_DETAILS_MAX_LENGTH}
                rows={4}
                onChange={(event) => setDetails(event.target.value)}
                aria-invalid={errors.details ? true : undefined}
                aria-describedby={describedBy}
                className={cn(inputClass, "h-auto min-h-28 py-3")}
              />
            )}
          </FieldShell>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className={pillButton({ variant: "outline", size: "lg" })}
            >
              {t("cancel")}
            </button>
            <button type="submit" disabled={pending} className={pillButton({ size: "lg" })}>
              {t("submit")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
