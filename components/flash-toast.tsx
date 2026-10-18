"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { FLASH_COOKIE, parseFlash } from "@/lib/flash-shared";

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Affiche le message flash posé par une Server Action avant redirection, puis l'efface. */
export function FlashToast() {
  const t = useTranslations();
  useEffect(() => {
    const flash = parseFlash(readCookie(FLASH_COOKIE));
    if (!flash) return;
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    toast.success(t(flash.key, flash.values));
  });
  return null;
}
