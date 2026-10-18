# ADR-007 : Pagination par curseur

- Statut : acceptée (2026-10-18), étape 3 (`lib/cursor.ts`, `features/catalog/search.ts`)

## Contexte

La galerie charge les modèles par défilement infini. Avec `OFFSET`, une publication pendant la
lecture décale les pages (doublons ou trous) et le coût croît avec la profondeur.

## Décision

- Tri toujours total : `(valeur de tri, id)` décroissants. Valeurs : date de publication,
  téléchargements, téléchargements comptés sur 7 jours, pertinence arrondie.
- Curseur opaque : `base64url(JSON [valeur, id])` du dernier élément ; la page suivante filtre
  `(valeur, id) < (curseur)`. Un curseur altéré est ignoré (première page).
- `GET /api/models` sert les pages suivantes (mêmes paramètres que l'URL de la galerie, `limit`
  48 au plus) ; la première page est rendue par le serveur.

## Conséquences

- Pages stables, coût constant ; pas de numéro de page ni de saut direct (inutile ici).
- « Populaires cette semaine » est calculé à la volée : sous-requête par modèle, acceptable au
  volume visé ; à dénormaliser si le catalogue grossit fortement.
