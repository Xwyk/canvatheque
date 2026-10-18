# ADR-005 : Recherche plein texte PostgreSQL (`french_unaccent`)

- Statut : acceptée (2026-10-18), mise en œuvre à l'étape 3 (`features/catalog/search.ts`)

## Contexte

La recherche doit trouver « Étoile de Noël » en tapant « etoiles noel » : accents et pluriels
ignorés, sur le titre, la description, les mots-clés et le pseudo de l'auteur. Le volume reste
modeste (quelques milliers de modèles) sur un VPS unique.

## Décision

- Configuration `french_unaccent` (copie de `french` + dictionnaire `unaccent`) créée par la
  migration initiale ; colonne générée `searchVector` : titre (poids A) + `searchText` (poids B),
  index GIN.
- `searchText` est dénormalisé par le service des modèles à chaque enregistrement : titre,
  description en texte brut, mots-clés, pseudo.
- Requête : `websearch_to_tsquery('french_unaccent', q)` (guillemets, `-exclusion`, `or` reconnus).
  Tri par pertinence (`ts_rank`, arrondi à 6 décimales pour un curseur exact) quand une recherche
  est saisie, sinon par date de publication.
- Filtres cumulés en SQL : format, catégorie, groupe de licences, chaque mot-clé (tous requis).

## Conséquences

- Aucun service supplémentaire (pas d'Elasticsearch/Meilisearch).
- Pas de recherche par préfixe ni de tolérance aux fautes de frappe : acceptable en v1.
- Le nombre total de résultats est calculé à la première page seulement (`COUNT(*)`).
