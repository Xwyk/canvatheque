import type { Page } from "@playwright/test";

/**
 * Thème clair ou sombre pour les vérifications axe : préférence système émulée et, en plus,
 * choix enregistré de next-themes (clé « theme ») — Firefox piloté par Playwright ignore
 * l'émulation de `prefers-color-scheme`.
 */
export async function useColorScheme(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.addInitScript((theme) => {
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // stockage indisponible : la préférence émulée suffit
    }
  }, colorScheme);
}
