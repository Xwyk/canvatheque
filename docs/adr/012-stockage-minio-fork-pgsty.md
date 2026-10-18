# ADR-012 : Stockage objet, fork communautaire de MinIO

- Statut : acceptée (2026-10-18)

## Contexte

Le plan s'appuie sur MinIO (API S3, URL présignées, politique de lecture anonyme des aperçus,
cycle de vie, client `mc`). Au 18/10/2026, les images officielles `minio/minio` et `minio/mc`
ne sont plus téléchargeables : Docker Hub refuse l'accès, quay.io ne publie plus.

## Décision

- Images du fork communautaire Pigsty, même code que MinIO :
  `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` et `pgsty/mc:RELEASE.2026-09-16T00-00-00Z`.
- Versions épinglées dans `docker-compose.yml` et dans les tests (`tests/setup/backend-global.ts`).
- L'application ne dépend que de l'API S3 (`@aws-sdk/client-s3`) : aucun couplage au fournisseur.

## Conséquences

- Aucun changement fonctionnel ni dans les scripts `mc` (init, sauvegarde, restauration).
- Dépendance à un mainteneur tiers : à surveiller. Alternatives évaluées si le fork s'arrête :
  RustFS (Apache 2.0, à revalider pour politiques anonymes, cycle de vie et CORS) ou
  compilation de MinIO depuis ses sources (AGPL).
- Production : MinIO exposé sur un sous-domaine dédié (`S3_PUBLIC_URL=https://s3.domaine`)
  et non sous un sous-chemin, car la signature SigV4 des URL présignées couvre hôte et chemin.
