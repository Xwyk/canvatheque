import axeCore, { type AxeResults, type RunOptions } from "axe-core";
import { expect } from "vitest";

const DEFAULT_OPTIONS: RunOptions = {
  rules: {
    // jsdom ne calcule pas les couleurs rendues : contraste vérifié en E2E (axe + Playwright).
    "color-contrast": { enabled: false },
  },
};

export async function axe(container: Element, options: RunOptions = {}): Promise<AxeResults> {
  return axeCore.run(container, { ...DEFAULT_OPTIONS, ...options });
}

expect.extend({
  toHaveNoViolations(results: AxeResults) {
    const violations = results.violations;
    return {
      pass: violations.length === 0,
      message: () =>
        violations
          .map(
            (v) =>
              `${v.id} (${v.impact ?? "?"}) : ${v.help}\n${v.nodes.map((n) => `  ${n.html}`).join("\n")}`,
          )
          .join("\n\n") || "Aucune violation d'accessibilité attendue",
    };
  },
});

declare module "vitest" {
  // Mêmes paramètres de type que Vitest 5 (fusion de déclarations).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R;
  }
}
