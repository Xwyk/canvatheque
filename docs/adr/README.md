# Décisions d'architecture (ADR)

Chaque décision structurante est consignée ici : contexte, décision, conséquences.

| N°                                             | Titre                                                              | Statut   | Étape                    |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------- | ------------------------ |
| [001](001-nextjs-app-router.md)                | Next.js App Router et Server Actions                               | Acceptée | 0                        |
| [002](002-auth-sessions-en-base.md)            | Sessions en base, module maison (amendée : remplace Auth.js)       | Acceptée | 1                        |
| [003](003-rasterisation-resvg.md)              | resvg-js pour la rasterisation SVG, sharp pour le post-traitement  | Acceptée | 0, mise en œuvre étape 2 |
| [004](004-rate-limit-postgresql.md)            | Limitation de débit dans PostgreSQL                                | Acceptée | 1                        |
| [005](005-recherche-tsvector.md)               | Recherche plein texte PostgreSQL `french_unaccent`                 | Acceptée | 3                        |
| [006](006-envoi-direct-presigne.md)            | Envoi direct par formulaire POST présigné, confirmé par le serveur | Acceptée | 2                        |
| [007](007-pagination-curseur.md)               | Pagination par curseur                                             | Acceptée | 3                        |
| [008](008-suppression-logique.md)              | Suppression logique des modèles, objets effacés aussitôt           | Acceptée | 2                        |
| [009](009-polices-auto-hebergees.md)           | Polices auto-hébergées (Fontsource)                                | Acceptée | 0                        |
| [010](010-vitest-multi-projets.md)             | Vitest multi-projets et Testcontainers, une seule couverture       | Acceptée | 0                        |
| [011](011-csp-nonces-sans-cache-components.md) | CSP à nonces, Cache Components désactivés                          | Acceptée | 0                        |
| [012](012-stockage-minio-fork-pgsty.md)        | Stockage objet : fork communautaire de MinIO                       | Acceptée | 0                        |
| [013](013-miniature-cwprj.md)                  | Miniature des projets CanvasWorkspace, déchiffrée à l'envoi        | Acceptée | issue #1                 |
