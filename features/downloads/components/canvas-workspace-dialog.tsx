"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { pillButton } from "@/components/ui/pill-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CANVAS_WORKSPACE_URL } from "@/features/downloads/links";
import { dismissHelp } from "@/features/downloads/use-open-in-canvas-workspace";

/** Pas à pas « Ouvrir un .cwprj dans CanvasWorkspace » affiché après le téléchargement. */
export function CanvasWorkspaceDialog({
  open,
  fileName,
  onClose,
}: {
  open: boolean;
  fileName: string;
  onClose: () => void;
}) {
  const t = useTranslations("canvasWorkspace");
  const tGate = useTranslations("authGate");
  const [dontShow, setDontShow] = useState(false);
  const close = () => {
    if (dontShow) dismissHelp();
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[28px] p-6 shadow-dialog sm:max-w-[500px] md:p-8"
      >
        <button
          type="button"
          onClick={close}
          aria-label={tGate("close")}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <DialogTitle className="pr-9 text-[26px] leading-tight font-bold">{t("title")}</DialogTitle>
        <DialogDescription className="text-base text-text-secondary">
          {t("intro", { name: fileName })}
        </DialogDescription>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {(["step1", "step2", "step3"] as const).map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-extrabold text-primary-foreground"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{t(step, { name: fileName })}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[15px] text-muted-foreground">
          {t.rich("noSoftware", {
            link: (chunks) => (
              <a href={CANVAS_WORKSPACE_URL} rel="noopener" className="font-bold text-foreground">
                {chunks}
              </a>
            ),
          })}
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(event) => setDontShow(event.target.checked)}
            className="size-[22px] shrink-0 accent-primary"
          />
          {t("dontShowAgain")}
        </label>
        <button
          type="button"
          onClick={close}
          className={pillButton({ size: "lg", className: "self-end" })}
        >
          {t("ok")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
