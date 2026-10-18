"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { pillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

/**
 * Partage de la fiche : feuille de partage du système si elle existe, sinon copie du lien.
 * `icon` : bouton rond de l'en-tête mobile ; sinon pilule lavande.
 */
export function ShareButton({
  title,
  url,
  variant = "pill",
  className,
}: {
  title: string;
  url: string;
  variant?: "pill" | "icon";
  className?: string;
}) {
  const t = useTranslations("modelPage");

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // Partage annulé par l'utilisateur : rien à signaler.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("shareCopied"));
    } catch {
      toast.error(t("shareFailed"));
    }
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={t("share")}
        onClick={share}
        className={cn(
          "inline-flex size-12 items-center justify-center rounded-full hover:bg-muted",
          className,
        )}
      >
        <Share2 aria-hidden="true" className="size-6" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={share}
      className={pillButton({ variant: "soft", size: "sm", className })}
    >
      <Share2 aria-hidden="true" className="size-5" />
      {t("share")}
    </button>
  );
}
