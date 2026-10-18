# ADR-002 : Sessions en base, module maison (repli prévu par le plan)

- Statut : acceptée (2026-10-18), **amendée à l'étape 1** (même date) : le repli « module maison »
  remplace Auth.js.

## Contexte

Connexion par e-mail et mot de passe uniquement. Un bannissement doit couper l'accès
immédiatement, donc les sessions vivent en base (révocables), pas dans un JWT.

Le plan retenait Auth.js v5 (adaptateur Prisma, stratégie `database`) avec un contournement
pour le provider Credentials (surcharge de `jwt.encode`), et prévoyait un repli : « module
`lib/auth/session.ts` maison sur la même table » si l'intégration s'avérait fragile.

Constat au démarrage de l'étape 1 (18/10/2026) :

- `next-auth` 5 est toujours en bêta (`5.0.0-beta.32`, juillet 2026) ;
- `@auth/prisma-adapter` 2.11 ne déclare pas Prisma 7 parmi ses versions compatibles
  (client généré hors de `node_modules`, adaptateur de pilote) ;
- `next-auth` exige `nodemailer` 7 ou 8 (version courante : 10) ;
- le contournement Credentials + `database` repose sur un comportement non documenté.

## Décision

Module maison, sans dépendance d'authentification :

- **Jeton** : 256 bits aléatoires (`crypto.randomBytes`), envoyé dans un cookie `httpOnly`,
  `SameSite=Lax`, `Secure` et préfixe `__Host-` en HTTPS. **Seul son SHA-256 est stocké**
  (`Session.sessionToken`) : une fuite de la base ne donne pas de sessions utilisables.
- **Durée** : 30 jours, prolongée côté base quand il reste moins de 15 jours ; le proxy
  repousse l'expiration du cookie à chaque navigation (GET). La base fait foi.
- **Révocation** : suppression des lignes `Session` (déconnexion, bannissement, changement ou
  réinitialisation du mot de passe ; la session courante est conservée lors d'un changement).
  Une session d'un compte banni est refusée et supprimée à la lecture.
- **Mots de passe** : argon2id (19 Mio, 2 itérations, 1 fil, OWASP) ; refus des 10 000 mots de
  passe les plus courants ; vérification factice pour une adresse inconnue (temps de réponse
  homogène, message d'erreur générique).
- **Jetons d'e-mail** (`EmailToken`) : 256 bits, hachés, usage unique (mise à jour conditionnelle
  contre le double clic), expiration 48 h (confirmation), 1 h (réinitialisation), 24 h
  (changement d'adresse) ; un nouveau jeton annule le précédent du même type.
- **Server Actions** : la protection CSRF de Next (vérification `Origin` / hôte) s'applique ;
  le cookie `SameSite=Lax` complète.
- Les tables `Account` et `VerificationToken` du schéma restent disponibles pour un futur
  fournisseur OAuth.

## Conséquences

- Code court et entièrement testé (`lib/auth/session.ts`, `features/auth/service.ts`), sans
  bêta ni contournement.
- Une requête en base par lecture de session (mise en cache par rendu via `React.cache`).
- `AUTH_SECRET` reste exigé par `lib/env.ts` mais n'est pas utilisé par ce module (aucune
  donnée signée) ; il est réservé à de futurs jetons signés.
- Ajouter OAuth plus tard demandera une brique supplémentaire (Auth.js stable ou équivalent).
