"use client";

import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/auth/auth-gate";
import { toggleFavoriteAction } from "@/features/favorites/actions";
import { cn } from "@/lib/utils";

/**
 * Cœur des favoris, mis à jour aussitôt (optimiste) puis confirmé par le serveur ; en cas
 * d'échec, l'état revient et un message s'affiche. Visiteur : modale d'inscription.
 * Variantes : `card` (rond blanc 44 px sur l'aperçu), `pill` (fiche), `icon` (en-tête mobile).
 */
export function FavoriteButton({
  modelId,
  title,
  favorited: initial,
  variant = "card",
  className,
}: {
  modelId: string;
  title: string;
  favorited: boolean;
  variant?: "card" | "pill" | "icon";
  className?: string;
}) {
  const t = useTranslations("favorites");
  const tRoot = useTranslations();
  const gate = useAuthGate();
  const pathname = usePathname();
  const [favorited, setFavorited] = useState(initial);
  const [optimistic, setOptimistic] = useOptimistic(favorited);
  const [, startTransition] = useTransition();

  const toggle = () => {
    if (!gate.signedIn) {
      gate.open("favorite", pathname);
      return;
    }
    startTransition(async () => {
      setOptimistic(!optimistic);
      const result = await toggleFavoriteAction(modelId);
      if (result.ok) {
        setFavorited(result.data.favorited);
      } else {
        toast.error(
          tRoot.has(result.error.message) ? tRoot(result.error.message) : tRoot("errors.generic"),
        );
      }
    });
  };

  const label = optimistic ? t("remove", { title }) : t("add", { title });
  const icon = (
    <Heart
      aria-hidden="true"
      className={cn("size-5", optimistic && "fill-primary text-primary")}
      strokeWidth={2.2}
    />
  );

  if (variant === "pill") {
    return (
      <button
        type="button"
        aria-pressed={optimistic}
        onClick={toggle}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full bg-muted px-[18px] text-[15px] font-bold text-foreground hover:bg-border",
          className,
        )}
      >
        {icon}
        {optimistic ? t("pillActive") : t("pill")}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={optimistic}
      onClick={toggle}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full",
        variant === "card"
          ? "absolute top-2 right-2 z-10 bg-white text-ink shadow-fab hover:scale-105"
          : "text-foreground hover:bg-muted",
        className,
      )}
    >
      {icon}
    </button>
  );
}
