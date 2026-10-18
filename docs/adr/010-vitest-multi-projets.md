# ADR-010 : Vitest multi-projets et Testcontainers, une seule couverture

- Statut : acceptée (2026-10-18)

## Contexte

Trois natures de tests (logique pure, composants React, intégration avec PostgreSQL et MinIO)
et une exigence de couverture ≥ 80 % lue par SonarQube depuis un unique `lcov.info`.

## Décision

- `vitest.config.mts` déclare trois projets :
  - `unit` (node) : `lib/**`, `features/**`, `tests/unit/**` ;
  - `components` (jsdom) : RTL, user-event, jest-dom ; chaque test se termine par une
    vérification axe (`tests/setup/axe.ts`, contraste vérifié en E2E car jsdom ne calcule pas
    les couleurs) ;
  - `backend` (node) : `globalSetup` démarre PostgreSQL 16 et MinIO une fois via
    Testcontainers, applique `prisma migrate deploy`, crée les buckets ; chaque test part
    d'une base vidée (`TRUNCATE`).
- `npm run test:coverage` exécute les trois projets en une passe : couverture v8 fusionnée,
  seuils 80 % (lignes, branches, fonctions, instructions) bloquants.
- E2E séparés (Playwright) contre la pile Docker.

## Conséquences

- Le projet backend exige Docker (disponible sur les runners GitHub `ubuntu-latest`).
- Fichiers backend exécutés séquentiellement (base partagée).
- Exclusions de couverture listées et justifiées dans `vitest.config.mts`.
