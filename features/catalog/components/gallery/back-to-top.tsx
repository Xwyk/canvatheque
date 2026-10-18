"use client";

import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Seuil de défilement (px) au-delà duquel le bouton apparaît. */
const THRESHOLD = 1200;

/**
 * « Revenir en haut » : bouton flottant après un long défilement. Ramène en haut de la page et
 * place le focus sur le titre (`targetId`) pour reprendre la navigation clavier au début.
 */
export function BackToTop({ targetId }: { targetId: string }) {
  const t = useTranslations("gallery");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > THRESHOLD);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;

  function onClick() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById(targetId)?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-4 bottom-24 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-background px-4 font-bold text-foreground shadow-float md:right-8 md:bottom-8"
    >
      <ArrowUp aria-hidden="true" className="size-5" />
      {t("backToTop")}
    </button>
  );
}
