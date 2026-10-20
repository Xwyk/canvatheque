import Link from "next/link";
import { useTranslations } from "next-intl";
import { pillButton } from "@/components/ui/pill-button";

const TABS = [
  { href: "/me", key: "tabModels" },
  { href: "/me/favorites", key: "tabFavorites" },
  { href: "/me/downloads", key: "tabDownloads" },
  { href: "/me/settings", key: "tabSettings" },
] as const;

export type MeTab = (typeof TABS)[number]["href"];

/** Onglets pilule de l'espace membre : Mes modèles, Mes favoris, Mes téléchargements, Paramètres. */
export function MeTabs({ current }: { current: MeTab }) {
  const t = useTranslations("library");
  return (
    <nav aria-label={t("tabsLabel")}>
      <ul className="m-0 -mx-5 flex list-none gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={pillButton({
                  variant: active ? "outline" : "soft",
                  size: "sm",
                  className: active
                    ? "border-ink bg-ink text-ink-foreground hover:bg-ink hover:text-ink-foreground"
                    : undefined,
                })}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
