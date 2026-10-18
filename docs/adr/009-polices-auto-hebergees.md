# ADR-009 : Polices auto-hébergées

- Statut : acceptée (2026-10-18)

## Contexte

Les maquettes chargent Bricolage Grotesque et Figtree depuis Google Fonts, ce que le cahier des
charges interdit en production (requêtes vers un tiers, données de navigation).

## Décision

- Fichiers variables de `@fontsource-variable/bricolage-grotesque` et `@fontsource-variable/figtree`
  (licence OFL), sous-ensemble latin (couvre le français, œ compris).
- Chargés par `next/font/local` (`app/fonts.ts`) : fichiers servis par l'application,
  préchargement et police de repli ajustée (moins de décalage de mise en page).
- Variables CSS `--font-bricolage` et `--font-figtree`, branchées sur `--font-heading` et
  `--font-sans` dans `app/globals.css`.

## Conséquences

- Aucune requête externe ; `font-src 'self'` dans la CSP.
- Mise à jour des polices via les versions des paquets npm.
