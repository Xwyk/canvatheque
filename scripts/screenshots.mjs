// Captures d'écran du README (docs/screenshots/), contre la pile Docker et le seed :
//   npm run screenshots   (SCREENSHOTS_BASE_URL, défaut http://localhost:3000)
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.SCREENSHOTS_BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOBILE = { ...devices["Pixel 7"], deviceScaleFactor: 2 };

const SHOTS = [
  { file: "accueil.png", path: "/", context: DESKTOP },
  { file: "accueil-sombre.png", path: "/", context: DESKTOP, theme: "dark" },
  { file: "galerie.png", path: "/models?category=nature-et-animaux", context: DESKTOP },
  { file: "fiche.png", path: "/models/papillon-monarque", context: DESKTOP },
  { file: "fiche-mobile.png", path: "/models/rosace-de-fenetre", context: MOBILE },
  { file: "aide.png", path: "/help#canvasworkspace", context: DESKTOP },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      ...shot.context,
      locale: "fr-FR",
      colorScheme: shot.theme ?? "light",
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (theme) => localStorage.setItem("theme", theme),
      shot.theme ?? "light",
    );
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${shot.file}` });
    await context.close();
    process.stdout.write(`${OUT}/${shot.file}\n`);
  }
} finally {
  await browser.close();
}
