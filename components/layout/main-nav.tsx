"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/models", key: "models" },
  { href: "/categories", key: "categories" },
  { href: "/local", key: "local" },
  { href: "/help", key: "help" },
] as const;

export function MainNav() {
  const t = useTranslations("header");
  const pathname = usePathname();
  return (
    <nav aria-label={t("mainNav")} className="hidden md:block">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 font-semibold">
        {ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center text-foreground no-underline hover:text-primary",
                  active && "underline decoration-primary decoration-[3px] underline-offset-8",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
