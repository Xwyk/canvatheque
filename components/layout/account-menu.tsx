"use client";

import { LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/actions";

export type HeaderUser = { pseudo: string; email: string; isAdmin: boolean };

/** Avatar à initiale (44 px, planche Fiche) ouvrant le menu du compte. */
export function AccountMenu({ user }: { user: HeaderUser }) {
  const t = useTranslations("header");
  const initial = user.pseudo.charAt(0).toLocaleUpperCase("fr");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("accountMenu", { pseudo: user.pseudo })}
        className="inline-flex size-11 items-center justify-center rounded-full bg-info text-base font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden="true">{initial}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-bold">{user.pseudo}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me/settings" className="min-h-11">
            <Settings aria-hidden="true" />
            {t("settings")}
          </Link>
        </DropdownMenuItem>
        {user.isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="min-h-11">
              <ShieldCheck aria-hidden="true" />
              {t("admin")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="min-h-11 w-full">
              <LogOut aria-hidden="true" />
              {t("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
