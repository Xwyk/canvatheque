"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { CANVAS_WORKSPACE_URL, downloadHref, type ClientOs } from "@/features/downloads/links";
import { useDownload } from "@/features/downloads/use-download";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ctaClass =
  "flex items-center justify-center gap-3 bg-primary px-6 font-extrabold text-primary-foreground no-underline shadow-cta transition-colors hover:bg-primary-hover hover:text-primary-foreground";

type Props = { slug: string; format: ModelFormat; sizeLabel: string; fileName: string };

/**
 * Téléchargement d'un modèle. Lien réel (sans JS : 302 vers le fichier) ; avec JS : modale
 * visiteur et messages d'erreur. Un navigateur ne peut pas lancer CanvasWorkspace (aucun
 * lien d'ouverture déclaré par le logiciel) : un .cwprj se télécharge comme un SVG.
 */
function useModelDownload({ slug, fileName }: Pick<Props, "slug" | "fileName">) {
  const download = useDownload();
  const downloadFile = useCallback(() => download(slug, fileName), [download, slug, fileName]);
  const onDownload = (event: MouseEvent) => {
    event.preventDefault();
    void downloadFile();
  };
  return { onDownload, downloadFile };
}

/** Relance le téléchargement au retour sur la fiche après inscription (`?download=1`). */
function AutoDownload({ run }: { run: () => Promise<unknown> }) {
  const searchParams = useSearchParams();
  const done = useRef(false);
  const requested = searchParams.get("download") === "1";
  useEffect(() => {
    if (!requested || done.current) return;
    done.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("download");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    void run();
  }, [requested, run]);
  return null;
}

/** Bloc d'actions de la colonne de droite (ordinateur). */
export function DownloadPanel({ slug, format, sizeLabel, fileName, os }: Props & { os: ClientOs }) {
  const t = useTranslations("modelPage");
  const actions = useModelDownload({ slug, fileName });
  const href = downloadHref(slug);
  const systems = os === "mac" ? ["macOS", "Windows"] : ["Windows", "macOS"];
  return (
    <div className="flex flex-col gap-3">
      <AutoDownload run={actions.downloadFile} />
      <a
        href={href}
        rel="nofollow"
        onClick={actions.onDownload}
        className={cn(ctaClass, "min-h-[60px] flex-col gap-0 rounded-[18px] py-2 text-[19px]")}
      >
        <span className="inline-flex items-center gap-3">
          <Download aria-hidden="true" className="size-6" />
          {t(format === "CWPRJ" ? "downloadCwprj" : "downloadSvg")}
        </span>
        <span className="text-sm font-semibold">
          {t(format === "CWPRJ" ? "cwprjHint" : "svgHint", { size: sizeLabel })}
        </span>
      </a>
      <p className="m-0 text-[15px] text-muted-foreground">
        {t.rich("noCanvas", {
          first: systems[0]!,
          second: systems[1]!,
          link: (chunks) => (
            <a href={CANVAS_WORKSPACE_URL} rel="noopener" className="font-bold text-foreground">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}

/** Barre d'actions collée en bas de l'écran (mobile), au-dessus de la barre d'onglets. */
export function MobileActionBar({ slug, format, sizeLabel, fileName }: Props) {
  const t = useTranslations("modelPage");
  const actions = useModelDownload({ slug, fileName });
  const href = downloadHref(slug);
  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2.5 border-t bg-background px-5 pt-3 pb-3 md:hidden">
      <div className="flex gap-2.5">
        <a
          href={href}
          rel="nofollow"
          onClick={actions.onDownload}
          className={cn(ctaClass, "min-h-14 flex-1 rounded-[16px] text-[17px]")}
        >
          <Download aria-hidden="true" className="size-5" />
          {t(format === "CWPRJ" ? "downloadCwprj" : "downloadSvg")}
        </a>
      </div>
      <p className="m-0 text-center text-[13px] text-muted-foreground">
        {format === "CWPRJ" ? t("mobileHint") : t("svgHint", { size: sizeLabel })}
      </p>
    </div>
  );
}
