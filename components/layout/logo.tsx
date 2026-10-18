import Link from "next/link";
import { useTranslations } from "next-intl";
import { LOGO_STAR } from "@/components/shapes";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <circle cx="50" cy="50" r="46" className="fill-primary" />
      <path d={LOGO_STAR} className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  const t = useTranslations();
  return (
    <Link
      href="/"
      aria-label={t("header.homeLink")}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 font-heading text-lg font-extrabold text-foreground no-underline md:gap-2.5 md:text-[22px]",
        className,
      )}
    >
      <LogoMark className="size-7 md:size-9" />
      <span aria-hidden="true">{t("meta.siteName")}</span>
    </Link>
  );
}
