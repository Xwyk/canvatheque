# ADR-014 : Mode local, analyse des fichiers dans le navigateur

- Statut : acceptée (2026-10-21), issue #2

## Contexte

Les membres gardent des centaines de `.cwprj` et de `.svg` éparpillés dans leurs dossiers. Une page
`/local` doit les aider à s'y retrouver : aperçus, tailles, dossiers, doublons, publication. Il
s'agit de fichiers personnels : les envoyer au serveur pour les analyser serait intrusif et
coûteux.

## Décision

- **Tout se passe dans le navigateur.** Le dossier est lu localement et la page le dit
  clairement. Rien ne part sans un clic explicite, et seulement dans trois cas :
  - « Vérifier sur Canvathèque » envoie **les seules empreintes SHA-256** (500 au plus) à
    `POST /api/local/lookup`. Ouvert aux visiteurs, limité par IP, réponse = modèles publiés
    de même empreinte.
  - « Afficher la miniature » envoie **un seul `.cwprj`** à `POST /api/local/cwprj-preview`.
    Réservé aux membres, limité par membre ; renvoie un WebP ré-encodé, **rien n'est stocké**
    (exception encadrée à ADR-013).
  - « Publier » transmet le fichier à l'assistant de publication (`features/local/handoff.ts`,
    même onglet), qui l'envoie comme un dépôt.
- **Choix du dossier.**
  - Chromium : `showDirectoryPicker({ mode: "read" })`. Le handle est mémorisé dans IndexedDB,
    et « Rescanner » redemande l'autorisation.
  - Firefox et Safari : `<input type="file" webkitdirectory>`, qui fournit un instantané du
    dossier.
- **Analyse.**
  - Extensions `.cwprj` et `.svg` seulement ; dossiers cachés et système ignorés.
  - Plafonds : 5 000 fichiers, profondeur 12, et au-delà de `MAX_FILE_SIZE_MB` le fichier est
    listé sans être haché.
  - Empreintes SHA-256 (`crypto.subtle`, même calcul que `fileChecksum`) dans un Web Worker,
    avec progression et annulation. La CSP gagne `worker-src 'self'`.
- **Aperçus.**
  - SVG : `<img>` sur une URL `blob:` ; un SVG affiché comme image n'exécute aucun script.
  - CWPRJ : vignette générique, ou miniature sur demande (voir plus haut).
- **Mémoire locale** (IndexedDB) : handle et index de la dernière analyse, jamais le contenu
  des fichiers. « Oublier ce dossier » supprime la base.
- Ordinateur uniquement : sur un appareil tactile (`(hover: none) and (pointer: coarse)`), un
  message explique pourquoi.

## Conséquences

- Aucun stockage serveur ni aucune donnée personnelle de plus. Les deux points d'accès sont
  limités en débit et ne servent qu'au clic.
- Un index restauré sans nouvelle analyse n'a ni aperçus ni publication : les fichiers ne sont
  pas conservés.
- La transmission vers l'assistant ne survit pas à un rechargement de page : l'assistant
  s'ouvre alors normalement, sans fichier.
- Tests : faux système de fichiers et faux hachage en composants, `fake-indexeddb` en
  unitaire, dossier de fixtures généré en E2E (4 navigateurs). Les E2E vérifient qu'aucune
  requête ne part avant les clics.
