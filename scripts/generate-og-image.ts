/**
 * Génère l'image de partage par défaut (Open Graph / Twitter), 1200 × 630.
 * Usage : npx tsx scripts/generate-og-image.ts (fichier versionné : public/og-default.png)
 * Le texte est rendu par librsvg avec les polices du système (Bricolage si installée).
 */
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { LOGO_STAR, SHAPES } from "@/components/shapes";

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = "'Bricolage Grotesque', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#F1EEF9"/>
  <g transform="translate(905 70) rotate(-10 100 100) scale(2)"><path d="${SHAPES.heart}" fill="#C81E4B"/></g>
  <g transform="translate(915 345) scale(2.1)"><path d="${SHAPES.butterfly}" fill="#0F7C7E"/></g>
  <g transform="translate(1055 290) rotate(12 70 70) scale(1.4)"><path d="${SHAPES.star}" fill="#F5B82E"/></g>
  <g transform="translate(96 150) scale(1.2)">
    <circle cx="50" cy="50" r="46" fill="#C81E4B"/>
    <path d="${LOGO_STAR}" fill="#FFFFFF"/>
  </g>
  <text x="96" y="370" font-family="${FONT}" font-size="104" font-weight="800" letter-spacing="-2" fill="#221F3A">Canvathèque</text>
  <text x="100" y="440" font-family="${FONT}" font-size="34" font-weight="600" fill="#3D3A57">Modèles de découpe gratuits pour ScanNCut</text>
  <text x="100" y="494" font-family="${FONT}" font-size="30" font-weight="500" fill="#5B5873">.cwprj · .svg · partagés par la communauté</text>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile("public/og-default.png", png);
  process.stdout.write(`public/og-default.png : ${png.length} octets\n`);
}

void main();
