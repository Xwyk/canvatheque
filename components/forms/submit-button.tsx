"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/** Bouton principal des formulaires (56 px, planche Connexion) ; désactivé pendant l'envoi. */
export function SubmitButton({
  children,
  className,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "outline";
}) {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-6 text-lg font-extrabold transition-colors disabled:opacity-70",
        variant === "primary"
          ? "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover"
          : "border-ink bg-transparent text-ink hover:bg-muted",
        className,
      )}
    >
      {pending && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
      {pending ? t("pending") : children}
    </button>
  );
}
