import { Download, SquareArrowOutUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Page de téléchargement officielle de CanvasWorkspace (Brother). */
export const CANVAS_WORKSPACE_URL =
  "https://support.canvasworkspace.brother.com/cwsinfo/download_cws/en.html";

/** Système du visiteur, pour l'ordre « Windows ou macOS ». */
export type ClientOs = "mac" | "windows";

export function clientOs(userAgent: string | null): ClientOs {
  return /Mac OS X|Macintosh/i.test(userAgent ?? "") ? "mac" : "windows";
}

// Point de téléchargement livré à l'étape 4 (session, quota, URL présignée).
export const downloadHref = (slug: string) => `/api/models/${encodeURIComponent(slug)}/download`;

const ctaClass =
  "flex items-center justify-center gap-3 bg-primary px-6 font-extrabold text-primary-foreground no-underline shadow-cta transition-colors hover:bg-primary-hover hover:text-primary-foreground";
const outlineClass =
  "flex items-center justify-center gap-3 border-2 border-ink px-6 font-bold text-ink no-underline transition-colors hover:bg-muted hover:text-ink";

type Props = { slug: string; format: ModelFormat; sizeLabel: string };

/** Bloc d'actions de la colonne de droite (ordinateur). */
export function DownloadPanel({ slug, format, sizeLabel, os }: Props & { os: ClientOs }) {
  const t = useTranslations("modelPage");
  const href = downloadHref(slug);
  const systems = os === "mac" ? ["macOS", "Windows"] : ["Windows", "macOS"];
  return (
    <div className="flex flex-col gap-3">
      {format === "CWPRJ" ? (
        <>
          <a href={href} className={cn(ctaClass, "min-h-[60px] rounded-[18px] text-[19px]")}>
            <SquareArrowOutUpRight aria-hidden="true" className="size-6" />
            {t("openInCanvas")}
          </a>
          <a href={href} className={cn(outlineClass, "min-h-[52px] rounded-[18px] text-[17px]")}>
            <Download aria-hidden="true" className="size-5" />
            {t("downloadFile", { size: sizeLabel })}
          </a>
        </>
      ) : (
        <a
          href={href}
          className={cn(ctaClass, "min-h-[60px] flex-col gap-0 rounded-[18px] py-2 text-[19px]")}
        >
          <span className="inline-flex items-center gap-3">
            <Download aria-hidden="true" className="size-6" />
            {t("downloadSvg")}
          </span>
          <span className="text-sm font-semibold">{t("svgHint", { size: sizeLabel })}</span>
        </a>
      )}
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
export function MobileActionBar({ slug, format, sizeLabel }: Props) {
  const t = useTranslations("modelPage");
  const href = downloadHref(slug);
  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2.5 border-t bg-background px-5 pt-3 pb-3 md:hidden">
      <div className="flex gap-2.5">
        {format === "CWPRJ" ? (
          <>
            <a href={href} className={cn(ctaClass, "min-h-14 flex-1 rounded-[16px] text-[17px]")}>
              <SquareArrowOutUpRight aria-hidden="true" className="size-5" />
              {t("openInCanvas")}
            </a>
            <a
              href={href}
              aria-label={t("downloadFileShort", { size: sizeLabel })}
              className={cn(outlineClass, "size-14 shrink-0 rounded-[16px] px-0")}
            >
              <Download aria-hidden="true" className="size-6" />
            </a>
          </>
        ) : (
          <a href={href} className={cn(ctaClass, "min-h-14 flex-1 rounded-[16px] text-[17px]")}>
            <Download aria-hidden="true" className="size-5" />
            {t("downloadSvg")}
          </a>
        )}
      </div>
      <p className="m-0 text-center text-[13px] text-muted-foreground">
        {format === "CWPRJ" ? t("mobileHint") : t("svgHint", { size: sizeLabel })}
      </p>
    </div>
  );
}
