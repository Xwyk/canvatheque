import Link from "next/link";
import { useTranslations } from "next-intl";
import { AccountMenu, type HeaderUser } from "@/components/layout/account-menu";
import { Logo } from "@/components/layout/logo";
import { MainNav } from "@/components/layout/main-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { pillButton } from "@/components/ui/pill-button";

/** En-tête du site : actions visiteur (planche Main) ou membre (planche Fiche). */
export function SiteHeader({ user }: { user?: HeaderUser | null }) {
  const t = useTranslations("header");
  return (
    <header className="container-page">
      <div className="flex items-center gap-x-2 gap-y-2 py-3 md:flex-wrap md:gap-x-8 md:py-5">
        <Logo />
        <MainNav />
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/publish"
                className={pillButton({ variant: "outline", className: "hidden md:inline-flex" })}
              >
                {t("publish")}
              </Link>
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={pillButton({ variant: "outline", className: "hidden md:inline-flex" })}
              >
                {t("signIn")}
              </Link>
              <Link href="/signup" className={pillButton({ className: "hidden md:inline-flex" })}>
                {t("signUp")}
              </Link>
              <Link
                href="/login"
                className={pillButton({ size: "sm", className: "px-3.5 md:hidden" })}
              >
                {t("signInShort")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
