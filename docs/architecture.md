# Architecture

Vue d'ensemble de Canvathèque telle que livrée (étapes 0 à 8). Les choix structurants sont
justifiés dans les [ADR](adr/README.md) ; le détail des écrans et des parcours est dans le
[README](../README.md).

## Vue d'ensemble

```
Navigateur ──HTTPS──► Caddy ──► app (Next.js, Node 24) ──► PostgreSQL 16
     │                                  │
     └──── URL présignées ─────────────►└──► MinIO (S3) : buckets « models » (privé)
                                                         et « previews » (lecture publique)
```

- **Une seule application Next.js** (App Router, composants serveur, Server Actions) sert les
  pages, les actions et quelques routes HTTP ([ADR-001](adr/001-nextjs-app-router.md)).
- **PostgreSQL** porte les données, la recherche plein texte ([ADR-005](adr/005-recherche-tsvector.md)),
  les sessions ([ADR-002](adr/002-auth-sessions-en-base.md)) et la limitation de débit
  ([ADR-004](adr/004-rate-limit-postgresql.md)) : pas de Redis.
- **MinIO** stocke fichiers et aperçus ; le serveur ne relaie jamais un fichier : envoi par
  formulaire POST présigné ([ADR-006](adr/006-envoi-direct-presigne.md)), téléchargement par URL
  GET présignée courte.
- Cible : un VPS de 2 vCPU / 4 Go, tout en Docker Compose (application 1 Go, PostgreSQL et MinIO
  512 Mo chacun).

## Organisation du code

| Dossier         | Rôle                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app/`          | Routes : pages (groupes `(public)`, `(auth)`, `(member)`, `(admin)`), routes HTTP `api/`, SEO                     |
| `features/<x>/` | Un domaine par dossier : `service.ts` (logique), `actions.ts` (Server Actions), `schemas.ts` (Zod), `components/` |
| `components/`   | Composants transverses (en-tête, cartes, modale visiteur) et primitives `ui/` (shadcn, Radix)                     |
| `lib/`          | Briques sans domaine : permissions, résultats typés, base, stockage, e-mails, sécurité, journaux                  |
| `messages/`     | Tous les textes (français), un fichier par grand écran, fusionnés par `messages/index.ts`                         |
| `prisma/`       | Schéma, migrations (SQL ajouté à la main : tsvector, index partiels, CHECK), seed                                 |
| `tests/`        | Intégration (`backend/`, Testcontainers), bout en bout (`e2e/`, Playwright), outils communs                       |

Domaines : `auth` (comptes, sessions), `account` (amorçage, export et suppression RGPD), `uploads`
et `models` (publication), `catalog` (recherche, galerie, fiche, profils, SEO), `downloads`,
`favorites`, `reports` et `admin` (modération), `comments`, `content` (pages À propos, Aide,
légales).

### Couches d'une action

```
Composant client ──► Server Action (actions.ts)
                      1. session (lib/auth/current)        → UNAUTHORIZED
                      2. validation Zod (schemas.ts)        → VALIDATION + champs
                      3. limite de débit (lib/rate-limit)   → RATE_LIMITED + retryAfter
                      4. service (service.ts)
                           can(acteur, action, ressource)   → FORBIDDEN
                           règles métier, transaction Prisma, objets MinIO, e-mails
                      ◄── Result<T> = { ok: true, data } | { ok: false, error: { code, message, fields? } }
```

- Les **services** ne dépendent pas de Next.js : base, stockage, e-mails et horloge sont injectés,
  ce qui permet de les tester contre de vrais PostgreSQL et MinIO.
- `lib/permissions.ts` (`can`) est une fonction pure, testée sur toutes les combinaisons rôle ×
  action.
- Les messages d'erreur sont des **clés de traduction** (`errors.*`), affichées par le client.

## Données

Schéma : [`prisma/schema.prisma`](../prisma/schema.prisma).

- `User` (rôle, bannissement, compte système « Auteur supprimé »), `Session`, `EmailToken`
  (jetons hachés), `RateLimit`.
- `Model` (fichier, aperçu, statut `DRAFT` / `PUBLISHED` / `HIDDEN`, suppression logique
  [ADR-008](adr/008-suppression-logique.md), compteurs dénormalisés, `searchText` → colonne générée
  `searchVector`), `Category`, `Tag`, `Upload`.
- `Favorite`, `Download` (un téléchargement compté par jour et par membre : index unique
  partiel), `Comment`, `Report` (un seul signalement ouvert par membre et par modèle : index
  unique partiel), `AdminAction` (journal de modération).
- Pagination par curseur pour le catalogue et les commentaires ([ADR-007](adr/007-pagination-curseur.md)),
  par numéro de page pour l'administration.

## Parcours techniques

- **Publication** : `createUpload` (politique POST présignée : clé, taille, type) → envoi direct
  du navigateur vers MinIO → `confirmUpload` (signature du fichier, SHA-256, doublons, nettoyage
  SVG par DOMPurify, rasterisation resvg puis variantes WebP par sharp
  [ADR-003](adr/003-rasterisation-resvg.md)) → brouillon → publication.
- **Téléchargement** : `GET /api/models/<slug>/download` contrôle session, visibilité et limite,
  compte le téléchargement puis renvoie une URL présignée en pièce jointe.
- **Modération** : signalement → file `/admin/reports` → masquer, supprimer, classer ; chaque
  action exige une raison, est journalisée et prévient le membre par e-mail.
- **RGPD** : export JSON (`GET /api/me/export`) ; suppression du compte avec transfert des
  modèles publiés au compte système ou suppression totale (base et MinIO).

## Sécurité

- En-têtes posés par `proxy.ts` : CSP à nonces par requête, HSTS, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy` ([ADR-011](adr/011-csp-nonces-sans-cache-components.md)).
- Mots de passe argon2id, liste de mots de passe courants, sessions et jetons hachés en base,
  révocation immédiate au bannissement et au changement de mot de passe.
- Fichiers : extension, double extension, signature (exécutables refusés), taille ; SVG analysé
  strictement puis nettoyé (scripts, `foreignObject`, liens externes, `on*`…).
- Markdown limité et nettoyé (liste blanche) ; textes de contenu sans HTML.
- Journaux pino sans e-mail ni IP complète, `requestId` sur chaque requête.

## Interface

- Design system dérivé des maquettes ([design-tokens.md](design-tokens.md)) : Tailwind 4,
  jetons clair et sombre, polices auto-hébergées ([ADR-009](adr/009-polices-auto-hebergees.md)).
- Accessibilité : WCAG 2.2 AA vérifié par axe sur chaque écran en thème clair et sombre,
  parcours clavier testés (focus piégé et rendu à la fermeture des modales), animations
  supprimées sous `prefers-reduced-motion`.
- Performance : composants serveur par défaut ; formulaires de la modale visiteur chargés à la
  demande ; seuls les textes utiles au navigateur lui sont envoyés (`messages/client.ts`) ;
  Zod absent du JavaScript des écrans publics.

## Qualité

| Niveau       | Outil                                         | Portée                                                        |
| ------------ | --------------------------------------------- | ------------------------------------------------------------- |
| Unitaires    | Vitest (`unit`)                               | permissions, validation, sanitizer, curseur, formats…         |
| Composants   | Vitest + Testing Library + axe (`components`) | chaque composant, accessibilité comprise                      |
| Intégration  | Vitest + Testcontainers (`backend`)           | services, actions, routes et pages contre PostgreSQL et MinIO |
| Bout en bout | Playwright                                    | Chromium, Firefox, WebKit, Pixel 7 contre la pile Docker      |
| Performance  | Lighthouse (`npm run lighthouse`)             | profil mobile, 4G lente simulée, seuil 90                     |
| Analyse      | SonarQube (Quality Gate)                      | aucun nouveau problème, couverture ≥ 80 %                     |

Une seule couverture fusionnée ([ADR-010](adr/010-vitest-multi-projets.md)) ; la CI
(`.github/workflows/ci.yml`) enchaîne lint et typage, tests avec couverture, image Docker et E2E,
puis SonarQube.
