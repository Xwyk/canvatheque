"use client";

import { Copy, FolderSearch, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

/**
 * « Afficher le chemin » : chemin du fichier depuis le dossier choisi, pour le retrouver dans
 * l'Explorateur ou « Fichier → Ouvrir » de CanvasWorkspace. Le navigateur ne connaît pas
 * l'emplacement complet sur le disque.
 */
export function PathButton({
  name,
  path,
  className,
}: {
  name: string;
  /** Chemin depuis le dossier choisi, dossier compris (« Mes modèles/Noël/sapin.svg »). */
  path: string;
  className?: string;
}) {
  const t = useTranslations("local.path");
  const [open, setOpen] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("buttonLabel", { name })}
        className={cn(pillButton({ variant: "soft", size: "sm" }), className)}
      >
        <FolderSearch aria-hidden="true" className="size-4" />
        {t("button")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="gap-5 rounded-[28px] p-6 shadow-dialog sm:max-w-[520px] md:p-8"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
          <div className="flex flex-col gap-2 pr-9">
            <DialogTitle className="text-2xl leading-tight font-bold">
              {t("title", { name })}
            </DialogTitle>
            <DialogDescription className="text-base text-text-secondary">
              {t("description")}
            </DialogDescription>
          </div>
          <code className="block rounded-[14px] bg-muted px-4 py-3 text-[15px] break-all text-foreground">
            {path}
          </code>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={copy}
              className={pillButton({ variant: "outline", size: "md" })}
            >
              <Copy aria-hidden="true" className="size-4" />
              {t("copy")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={pillButton({ size: "md" })}
            >
              {t("close")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
