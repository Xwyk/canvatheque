# ADR-003 : resvg-js pour la rasterisation SVG, sharp pour le post-traitement

- Statut : acceptée (2026-10-18), mise en œuvre à l'étape 2 (`lib/images/preview.ts`)

## Contexte

Chaque SVG publié reçoit un aperçu raster (WebP 400/800/1600 px). Les SVG viennent d'inconnus :
le rendu doit être isolé du système (polices, ressources externes) et borné en mémoire.

## Décision

- **@resvg/resvg-js** rasterise le SVG (déjà nettoyé par DOMPurify) : binaire précompilé musl,
  chargement des polices système désactivable, aucune ressource externe, taille de sortie bornée.
- **sharp** fait le reste : rotation EXIF puis suppression des métadonnées, recadrage,
  redimensionnement et encodage WebP.

## Conséquences

- Rendu indépendant de la version de libvips/librsvg de l'image.
- Deux dépendances natives : vérifiées dans l'image Alpine par le job Docker de la CI.
- Sans police système, le texte d'un SVG n'apparaît pas dans l'aperçu (les modèles de découpe
  sont des tracés) ; le fichier téléchargé, lui, est intact.
- Rendu asynchrone (`renderAsync`, hors du fil principal) ; plus grand côté ramené à 1600 px ;
  sharp limité à 40 mégapixels en entrée.
