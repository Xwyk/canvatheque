import Link from "next/link";
import { useTranslations } from "next-intl";
import { pillButton } from "@/components/ui/pill-button";

/** Panneau sombre d'appel à l'inscription (masqué pour un membre à partir de l'étape Comptes). */
export function DarkCtaPanel() {
  const t = useTranslations("home");
  return (
    <div className="container-page pt-14 md:pt-18">
      <section
        aria-labelledby="cta-title"
        className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6 rounded-4xl bg-panel p-7 text-panel-foreground md:p-12"
      >
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
          <h2
            id="cta-title"
            className="m-0 text-[28px] leading-[1.1] font-bold tracking-[-0.01em] md:text-[34px]"
          >
            {t("ctaTitle")}
          </h2>
          <p className="m-0 text-base text-panel-muted md:text-lg">{t("ctaText")}</p>
        </div>
        <Link href="/signup" className={pillButton({ variant: "highlight", size: "lg" })}>
          {t("ctaButton")}
        </Link>
      </section>
    </div>
  );
}
