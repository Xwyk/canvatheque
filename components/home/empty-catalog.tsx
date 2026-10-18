import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusIllustration } from "@/components/status-page";
import { pillButton } from "@/components/ui/pill-button";

/** Catalogue vide : illustration et invitation à publier le premier modèle. */
export function EmptyCatalog() {
  const t = useTranslations("homeSections");
  return (
    <div className="flex flex-col items-center gap-4 rounded-4xl bg-muted px-6 py-10 text-center md:py-14">
      <StatusIllustration />
      <p className="m-0 font-heading text-xl font-bold md:text-2xl">{t("emptyTitle")}</p>
      <p className="m-0 max-w-[520px] text-base text-muted-foreground">{t("emptyText")}</p>
      <Link href="/publish" className={pillButton({ variant: "primary", size: "lg" })}>
        {t("emptyButton")}
      </Link>
    </div>
  );
}
