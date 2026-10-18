# ADR-001 : Next.js App Router et Server Actions

- Statut : acceptée (2026-10-18)

## Contexte

Application web communautaire, rendue côté serveur pour le référencement (fiches modèles, galerie),
avec des formulaires (inscription, publication, modération) et quelques API (téléchargement,
santé, métriques). Hébergement sur un VPS unique, une seule équipe.

## Décision

- **Next.js 16.4 (App Router)**, React 19, TypeScript strict, sortie `standalone` pour Docker.
- Mutations par **Server Actions** ; chaque action applique la même chaîne :
  `requireUser()` → `can(acteur, action, ressource)` → limite de débit → validation Zod →
  service → `Result<T>` (`lib/result.ts`).
- **Route handlers** pour ce qui doit être une URL : téléchargement (302 vers URL présignée),
  `/api/health`, `/api/metrics`, `/api/models` (JSON), Auth.js.
- Code organisé par domaine dans `features/<domaine>/` (actions, schémas, service, requêtes),
  transverse dans `lib/`, composants partagés dans `components/`.
- Next 16 : `proxy.ts` (runtime Node) remplace `middleware.ts` ; il pose `x-request-id`,
  le nonce CSP et les en-têtes de sécurité.

## Conséquences

- Un seul déploiement (pas d'API séparée), types partagés client/serveur, schémas Zod réutilisés.
- Les Server Actions sont des POST publics : contrôle d'accès systématique dans l'action,
  jamais seulement dans le proxy.
- Les composants serveur asynchrones ne sont pas testables avec Vitest + RTL : ils restent
  minces (récupération de données puis composants synchrones testés), et sont couverts par
  des tests backend (rendu statique) et E2E.
