"use client";

import { CirclePlus, Heart, House, LayoutGrid, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthGate, type GateReason } from "@/components/auth/auth-gate";
import { isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type TabKey = "home" | "models" | "publish" | "favorites";

const TABS: { href: string; key: TabKey; icon: LucideIcon; gate?: GateReason }[] = [
  { href: "/", key: "home", icon: House },
  { href: "/models", key: "models", icon: LayoutGrid },
  { href: "/publish", key: "publish", icon: CirclePlus, gate: "publish" },
  { href: "/me/favorites", key: "favorites", icon: Heart, gate: "favorite" },
];

/** Barre d'onglets fixe sous 768 px (planche MobileAccueil). */
export function MobileTabBar() {
  const t = useTranslations("tabBar");
  const pathname = usePathname();
  const gate = useAuthGate();
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-20 items-stretch justify-around px-2 pt-1.5 pb-3.5">
        {TABS.map(({ href, key, icon: Icon, gate: reason }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                onClick={(event) => {
                  // Visiteur : « Publier » et « Favoris » ouvrent la modale d'inscription.
                  if (reason && !gate.signedIn) {
                    event.preventDefault();
                    gate.open(reason, href);
                  }
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs no-underline",
                  active ? "font-extrabold text-primary" : "font-semibold text-text-secondary",
                )}
              >
                <Icon aria-hidden="true" className="size-6" strokeWidth={active ? 2.2 : 2} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
