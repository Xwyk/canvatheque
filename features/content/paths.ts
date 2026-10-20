import type { ContentPageKey } from "@/features/content/content-page";

/** Pages de contenu et leurs adresses (pied de page, plan du site). */
export const CONTENT_PATHS: Record<ContentPageKey, string> = {
  about: "/about",
  help: "/help",
  legal: "/legal",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
};
