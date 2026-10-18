# ADR-004 : Limitation de débit dans PostgreSQL

- Statut : acceptée (2026-10-18), mise en œuvre à l'étape 1

## Contexte

Limites à appliquer : connexion, inscription, réinitialisation, envoi, téléchargement,
commentaire, signalement. Un seul serveur, faible trafic attendu, VPS de 4 Go.

## Décision

- Table `RateLimit(key, bucket, count)`, clé = action + identifiant (IP tronquée, utilisateur).
- Fenêtre glissante approchée : seau courant + seau précédent pondéré par le temps écoulé.
- Incrément atomique `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
- Purge opportuniste des seaux anciens.

## Conséquences

- Pas de Redis : un service de moins à exploiter et sauvegarder.
- Quelques millisecondes par requête limitée : sans importance à ce volume.
- Si le trafic l'exigeait, l'interface `lib/rate-limit.ts` permet de changer de stockage.
