import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Bascule Connexion / Inscription en pilule. Sur les pages, ce sont des liens
 * (navigation, aria-current) ; la modale visiteur (étape 4) utilisera de vrais onglets.
 */
export function AuthTabs({
  current,
  redirectTo,
}: {
  current: "signIn" | "signUp";
  redirectTo?: string;
}) {
  const t = useTranslations("auth");
  const query = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : "";
  const tabs = [
    { key: "signIn" as const, href: `/login${query}`, label: t("tabSignIn") },
    { key: "signUp" as const, href: `/signup${query}`, label: t("tabSignUp") },
  ];
  return (
    <nav aria-label={t("tabsLabel")}>
      <ul className="flex gap-1 rounded-full bg-muted p-1">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center rounded-full text-base no-underline",
                  active
                    ? "bg-card font-extrabold text-foreground shadow-[0_1px_4px_rgb(34_31_58/0.18)]"
                    : "font-bold text-text-secondary hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
