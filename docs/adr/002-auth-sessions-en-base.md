# ADR-002 : Auth.js Credentials avec sessions en base

- Statut : acceptée (2026-10-18), mise en œuvre à l'étape 1

## Contexte

Connexion par e-mail et mot de passe. Un bannissement doit couper l'accès immédiatement.
Auth.js v5 impose des sessions JWT avec le provider Credentials ; un JWT reste valide jusqu'à
expiration, donc pas de révocation immédiate.

## Décision

- Auth.js v5 avec l'adaptateur Prisma et la stratégie `database`.
- Contournement documenté pour Credentials : surcharge de `jwt.encode` qui crée la ligne
  `Session` et renvoie son `sessionToken` comme valeur de cookie.
- Bannissement : `bannedAt` posé et suppression des lignes `Session` de l'utilisateur.
- Mots de passe : argon2id (paramètres OWASP : 19 Mio, 2 itérations, parallélisme 1).
- Repli si le contournement s'avère fragile : module maison `lib/auth/session.ts` sur la même
  table (cookie httpOnly, SameSite=Lax, rotation).

## Conséquences

- Une requête en base par lecture de session (acceptable : PostgreSQL local, faible charge).
- Le compte administrateur initial est créé sans mot de passe ; un lien de définition est émis
  à chaque démarrage tant qu'il n'en a pas (journal, puis e-mail dès l'étape 1).
