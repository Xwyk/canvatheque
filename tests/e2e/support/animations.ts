import type { Locator } from "@playwright/test";

/**
 * Attend la fin des animations de l'élément et de ses descendants (fondu, zoom d'ouverture
 * des modales). Axe mesure les couleurs telles qu'affichées : pendant un fondu, il voit des
 * couleurs semi-transparentes et signale à tort un contraste insuffisant.
 */
export async function waitForAnimations(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        // Animations sans fin (indicateurs de chargement) : ne jamais les attendre.
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ).then(() => undefined),
  );
}
