# Design tokens

Source visuelle : les sept planches du canvas « Atelier Découpe — maquettes », copiées dans
[`docs/mockups/`](mockups/) (`Main`, `Galerie`, `Fiche`, `Connexion`, `Publier`, `MobileAccueil`,
`MobileFiche`). Le mot-symbole « Atelier Découpe » y devient « Canvathèque ».

Implémentation : variables CSS dans [`app/globals.css`](../app/globals.css), exposées à
Tailwind 4 par `@theme inline`. Le thème sombre est activé par la classe `.dark` (next-themes,
préférence système par défaut, bascule dans l'en-tête).

## Couleurs

Les noms shadcn (`primary`, `muted`, `accent`…) sont conservés pour les primitives ; les tokens
propres aux maquettes s'y ajoutent. Le jaune des maquettes s'appelle `highlight` (le nom
`accent` désigne, chez shadcn, le fond de survol).

| Token (classe Tailwind)                      | Clair (maquettes)                 | Sombre (dérivé)                   | Usage                                            |
| -------------------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------ |
| `background`                                 | `#FFFFFF`                         | `#181630`                         | fond de page                                     |
| `card` / `surface`                           | `#FFFFFF`                         | `#221F3A`                         | cartes, modales                                  |
| `muted` / `surface-muted`                    | `#F1EEF9`                         | `#2C2847`                         | bandes, puces, dropzone, squelettes              |
| `foreground`                                 | `#221F3A`                         | `#F4F2FA`                         | texte principal                                  |
| `ink`                                        | `#221F3A`                         | `#F4F2FA`                         | boutons contour, champ de recherche, badge CWPRJ |
| `text-secondary`                             | `#3D3A57`                         | `#D6D2E8`                         | paragraphes secondaires                          |
| `muted-foreground`                           | `#5B5873`                         | `#B8B3D1`                         | méta, légendes                                   |
| `primary`                                    | `#C81E4B`                         | `#F04A74`                         | CTA, lien actif, progression                     |
| `primary-hover`                              | `#A3183F`                         | `#FF6B8F`                         | survol                                           |
| `primary-foreground`                         | `#FFFFFF`                         | `#181630`                         | texte sur primaire                               |
| `highlight`                                  | `#F5B82E`                         | `#F5B82E`                         | badge SVG, CTA du panneau sombre                 |
| `highlight-soft`                             | `#FFF0C2`                         | `#4A3D1A`                         | pastille « gratuit »                             |
| `success` / `success-soft`                   | `#0F7C7E` / `#E3F1F0`             | `#3FB3B5` / `#1D3A3D`             | étapes faites, fichier valide                    |
| `info`                                       | `#5B3FA6`                         | `#A48BE8`                         | avatars par défaut                               |
| `destructive` / `danger`                     | `#B0362E`                         | `#F0776F`                         | erreurs, suppression                             |
| `border`                                     | `#E4E0F0`                         | `#3A365A`                         | bordures, séparateurs                            |
| `input`                                      | `#8A85A8`                         | `#716C9C`                         | champs au repos (focus : `ring` = `ink`, 2 px)   |
| `panel` / `panel-foreground` / `panel-muted` | `#221F3A` / `#FFFFFF` / `#E4E0F0` | `#2C2847` / `#F4F2FA` / `#D6D2E8` | panneau d'appel sombre                           |
| `--checker-a` / `--checker-b`                | `#F1EEF9` / `#FFFFFF`             | `#2C2847` / `#221F3A`             | damier des aperçus (`.bg-checker`)               |
| `--overlay`                                  | `rgb(34 31 58 / .62)`             | `rgb(0 0 0 / .7)`                 | voile des modales                                |

Écart volontaire aux maquettes : `input` passe de `#BDB8D6` à `#8A85A8` pour atteindre le
contraste 3:1 exigé des contours de champs (WCAG 1.4.11). Les champs principaux des maquettes
(recherche) utilisent déjà `ink`.

Teintes pastel (aperçus de démonstration) : `tint-rose #FDE3E8`, `tint-teal #D9F0EF`,
`tint-yellow #FFF0C2`, `tint-lilac #E5DEF7`, `tint-green #E3F1DD`, `tint-blue #DCEBFB`,
`tint-peach #FFE6D2`.

### Contrastes vérifiés (WCAG 2.2)

| Paire                            | Clair | Sombre |
| -------------------------------- | ----- | ------ |
| texte / fond                     | 15,8  | 15,8   |
| `muted-foreground` / fond        | 6,8   | 8,7    |
| `muted-foreground` / `muted`     | 5,9   | 6,9    |
| `primary` / fond (liens)         | 5,6   | 5,0    |
| `primary-foreground` / `primary` | 5,6   | 5,0    |
| `ink` / `highlight`              | 8,9   | 8,9    |
| texte / `highlight-soft`         | 14,0  | 9,6    |
| blanc / `success`                | 5,0   | —      |
| `panel-muted` / `panel`          | 12,2  | 9,5    |
| `destructive` / fond             | 6,2   | 6,3    |
| `input` / fond (contour, ≥ 3)    | 3,5   | 3,6    |

Les tests E2E passent axe (WCAG 2.2 AA) sur l'accueil en clair et en sombre.

## Typographie

- Titres : **Bricolage Grotesque** variable (`font-heading`), 800 pour h1, 700 pour h2,
  `letter-spacing -0.02em`, `line-height 1.04–1.1`.
  h1 : `clamp(36px, 5.2vw, 62px)` accueil, `clamp(34px, 4.5vw, 48px)` galerie,
  `clamp(32px, 4vw, 44px)` fiche.
- Corps : **Figtree** variable (`font-sans`), 16 px mobile, 17 px à partir de 768 px,
  `line-height 1.5`.
- Libellés de section : classe `.section-label` (13 px, 800, majuscules, `0.06em`).
- Polices auto-hébergées : voir [ADR-009](adr/009-polices-auto-hebergees.md).

## Formes, ombres, mouvement

- Rayons : pilule (`rounded-full`) pour boutons et puces ; `--radius` 14 px pour les champs ;
  `rounded-2xl` (20 px) cartes ; `rounded-3xl` (28 px) dropzone et cadre d'aperçu ;
  `rounded-4xl` (32 px) panneau sombre.
- Ombres : `shadow-card`, `shadow-float`, `shadow-cta`, `shadow-dialog`, `shadow-chip`, `shadow-fab`.
- Hauteurs : 44 px minimum pour toute cible ; 52–56 px pour la recherche ; 60 px CTA de fiche.
- Mise en page : `.container-page` (max 1200 px, gouttières 20 px mobile, 24 px desktop).
- Points de rupture : `xs` 360, `md` 768, `lg` 1024, `xl` 1440.
- Durées : 120 / 200 / 320 ms ; toutes les animations sont neutralisées sous
  `prefers-reduced-motion: reduce`.

## Composants du socle

| Composant                        | Fichier                                             | Planche                      |
| -------------------------------- | --------------------------------------------------- | ---------------------------- |
| Logo (pictogramme + mot-symbole) | `components/layout/logo.tsx`                        | toutes                       |
| En-tête, navigation              | `components/layout/site-header.tsx`, `main-nav.tsx` | `Main`                       |
| Barre d'onglets mobile           | `components/layout/mobile-tab-bar.tsx`              | `MobileAccueil`              |
| Pied de page                     | `components/layout/site-footer.tsx`                 | `Main`                       |
| Bascule de thème                 | `components/layout/theme-toggle.tsx`                | ajout                        |
| Boutons pilule                   | `components/ui/pill-button.ts`                      | toutes                       |
| Recherche                        | `components/search-form.tsx`                        | `Main`, `MobileAccueil`      |
| Puce de catégorie                | `components/category-pill.tsx`                      | `Main`                       |
| Hero, cartes décoratives         | `components/home/home-hero.tsx`, `hero-cards.tsx`   | `Main`                       |
| Bande catégories                 | `components/home/category-band.tsx`                 | `Main`                       |
| Panneau sombre                   | `components/home/dark-cta-panel.tsx`                | `Main`                       |
| Pages 404 / erreur               | `components/status-page.tsx`                        | ajout (formes des maquettes) |
