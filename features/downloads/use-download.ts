"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/auth/auth-gate";
import { downloadHref, downloadReturnPath } from "@/features/downloads/links";

/** Lance le navigateur sur l'URL présignée (pièce jointe : la page reste affichée). */
export function startFileDownload(url: string): void {
  window.location.assign(url);
}

/**
 * Téléchargement depuis la fiche : demande l'URL présignée en JSON, puis la suit.
 * Visiteur → modale d'inscription ; limite atteinte ou modèle retiré → message.
 * Renvoie vrai si le téléchargement a démarré.
 */
export function useDownload(start: (url: string) => void = startFileDownload) {
  const t = useTranslations("downloads");
  const gate = useAuthGate();
  return useCallback(
    async (slug: string, fileName: string): Promise<boolean> => {
      if (!gate.signedIn) {
        gate.open("download", downloadReturnPath(slug));
        return false;
      }
      try {
        const response = await fetch(downloadHref(slug), {
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const { url } = (await response.json()) as { url: string };
          start(url);
          toast.success(t("started", { name: fileName }));
          return true;
        }
        if (response.status === 401) {
          // Session expirée depuis l'affichage : page de connexion, retour sur la fiche.
          const { loginUrl } = (await response.json()) as { loginUrl: string };
          window.location.assign(loginUrl);
        } else if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? 60);
          toast.error(t("rateLimited", { minutes: Math.max(1, Math.ceil(retryAfter / 60)) }));
        } else if (response.status === 404) {
          toast.error(t("notFound"));
        } else {
          toast.error(t("error"));
        }
      } catch {
        toast.error(t("error"));
      }
      return false;
    },
    [gate, start, t],
  );
}
