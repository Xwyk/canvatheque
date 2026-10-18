import localFont from "next/font/local";

// Polices auto-hébergées (Fontsource, licence OFL) : aucune requête vers Google Fonts (ADR-009).
export const bricolage = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const figtree = localFont({
  // Pas de fichier italique (rare : descriptions) : le navigateur incline la police droite,
  // ce qui évite 21 Ko préchargés sur chaque page.
  src: "../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
});
