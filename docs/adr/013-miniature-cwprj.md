# ADR-013 : Miniature des projets CanvasWorkspace

- Statut : acceptée (2026-10-21), issue #1

## Contexte

Un SVG reçoit ses aperçus à l'envoi ; un `.cwprj` non, et le membre doit fournir une image pour
publier. Un projet CanvasWorkspace est un document XML `<FCMX>` chiffré (AES-256-CBC, remplissage
PKCS7). Son en-tête `FileHeaderSection` contient la miniature du projet (`ThumbnailImage`, en
base64) et le nom du motif (`DesignName`). Le format est propriétaire et non documenté : la clé
n'est pas publiée par l'éditeur du logiciel.

## Décision

- **Déchiffrement côté serveur uniquement, une seule fois**, à la vérification de l'envoi
  (`confirmUpload`).
  - Code : `lib/cwprj.ts`, `import "server-only"`, Web Crypto de Node.
  - Aucune route publique de déchiffrement : l'assistant affiche l'aperçu produit à l'envoi.
- **Clé et IV par configuration, optionnels** : `CWPRJ_KEY` (64 caractères hexadécimaux) et
  `CWPRJ_IV` (32).
  - Validés au démarrage (`lib/env.ts`).
  - Jamais `NEXT_PUBLIC_`, jamais dans le dépôt.
  - Plusieurs paires possibles, séparées par des virgules, essayées dans l'ordre : une nouvelle
    clé côté éditeur du logiciel s'ajoute sans couper les anciens fichiers.
  - Sans clé, la fonction est désactivée et le parcours est celui d'avant.
- **Échec toléré** : l'envoi est accepté sans aperçu automatique et l'événement
  `cwprj_preview_unavailable` est journalisé avec sa raison. Cas couverts :
  - ancien format `#FCM…` ;
  - autre clé ;
  - document qui n'est pas `<FCMX>` (mauvaise clé passée par hasard au contrôle du remplissage) ;
  - miniature absente, trop lourde, mal encodée ou d'un type inattendu.
- **Miniature jamais servie telle quelle**. Elle est lue par signature (PNG, JPEG, BMP),
  plafonnée à 7 Mo en base64 (≈ 5 Mo d'image), puis ré-encodée par le pipeline d'aperçus
  existant (sharp, métadonnées retirées, 40 Mpx au plus, WebP 400/800/1600 px). Le BMP,
  que sharp ne lit pas, est d'abord converti en pixels (24 et 32 bits non compressés).
- **Angle supérieur gauche arrondi** : CanvasWorkspace dessine une page blanche à angle droit après
  une marge transparente en haut et à gauche. Cet angle est arrondi à la création de l'image
  (rayon de 8 % de la largeur, celui des cartes : 20 px pour ~250 px), bord anticrénelé, pour
  épouser les coins du cadre qui l'affiche. Les autres angles touchent le bord de l'image et sont
  arrondis par le cadre lui-même.
- **L'image choisie par le membre l'emporte** (`previewCustom`) : un nouvel envoi ne la remplace
  jamais.
- **`DesignName` propose le titre** (3 à 80 caractères, caractères de contrôle retirés) :
  - à la création du brouillon ;
  - à un nouvel envoi, seulement si le titre est encore celui tiré du nom du fichier précédent.
- `AuthorName` est ignoré : c'est souvent un nom réel.

## Conséquences

- Activer la fonction en production est une décision de l'éditeur du site (format chiffré
  propriétaire). Elle passe uniquement par la configuration de la clé.
- Tests sur fichiers **synthétiques**, chiffrés avec une clé générée par le test
  (`tests/support/cwprj.ts`). Les E2E utilisent une paire clé/IV de test propre à
  `docker-compose.e2e.yml`. Aucun fichier ni aucune clé réels dans le dépôt.
- Vérifié le 21/10/2026 sur un projet réel (clé hors dépôt) : miniature PNG 512 × 512 avec
  canal alpha, `DesignName` vide (le titre vient alors du nom du fichier). L'en-tête contient
  aussi `FormatIdentifier`, `FileVersion`, `Width`, `Height`, `CopyrightNotice`…, non utilisés.
- Coût : déchiffrement du fichier entier (20 Mo au plus) en mémoire, une fois par envoi.
