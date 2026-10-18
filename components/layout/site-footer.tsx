import Link from "next/link";
import { useTranslations } from "next-intl";

const LINKS = [
  { href: "/about", key: "about" },
  { href: "/help", key: "help" },
  { href: "/legal", key: "legal" },
  { href: "/legal/privacy", key: "privacy" },
  { href: "/legal/terms", key: "terms" },
] as const;

export function SiteFooter() {
  const t = useTranslations();
  return (
    <footer className="mt-18 border-t">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pt-8 pb-10 text-[15px] text-muted-foreground">
        <span className="font-heading font-extrabold text-foreground">{t("meta.siteName")}</span>
        <nav aria-label={t("footer.label")}>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-muted-foreground no-underline hover:text-primary"
                >
                  {t(`footer.${link.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
