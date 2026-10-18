# ADR-006 : Envoi direct vers MinIO par formulaire POST présigné, confirmé par le serveur

- Statut : acceptée (2026-10-18), étape 2

## Contexte

Les fichiers (`.cwprj`, `.svg`, 20 Mo par défaut) et les images d'aperçu (5 Mo) ne doivent pas
transiter par le serveur Next.js : VPS 2 vCPU / 4 Go, limite mémoire de 1 Go pour l'application,
corps des Server Actions bornés. Le plan prévoyait une URL `PUT` présignée.

Une URL `PUT` présignée ne borne pas la taille envoyée : n'importe quel détenteur de l'URL peut
déposer un objet arbitrairement gros pendant sa durée de validité.

## Décision

**Formulaire `POST` présigné** (`@aws-sdk/s3-presigned-post`) au lieu d'une URL `PUT` :

1. `createUploadAction` (limite `RATE_LIMIT_UPLOAD_PER_HOUR` par membre) contrôle la déclaration
   (nom nettoyé, extension, double extension dangereuse, taille, quota de modèles, droits sur le
   modèle) et crée une ligne `Upload` PENDING valable 15 min. La politique signée fixe la **clé
   exacte** (`uploads/<uuid>`) et la **plage de taille** (`content-length-range` 1 octet → maximum).
   Elle est signée pour l'origine publique (`S3_PUBLIC_URL`).
2. Le navigateur envoie le fichier directement à MinIO (XHR : progression, annulation). CORS est
   ouvert à `APP_URL` par MinIO ; la CSP autorise l'origine du stockage en `connect-src`.
3. `confirmUploadAction` relit l'objet (taille réelle revérifiée), applique les contrôles de
   contenu (signature, nettoyage SVG, rasterisation, aperçus WebP), écrit l'objet final
   (`models/<uuid>.<ext>`, aperçus `<modelId>/<version>-{sm,md,lg}.webp`), supprime l'objet
   temporaire et crée ou met à jour le brouillon.
4. Les envois expirés sont purgés au démarrage (`cleanupExpiredUploads`) ; une règle de cycle de vie
   MinIO efface aussi `uploads/` après un jour.

## Conséquences

- Taille bornée côté stockage, avant tout traitement ; le serveur ne lit qu'un objet déjà borné.
- Le binaire est lu une fois par le serveur lors de la confirmation (nécessaire pour le nettoyage
  SVG et l'empreinte SHA-256) : mémoire bornée par `MAX_FILE_SIZE_MB`.
- Le navigateur doit joindre les champs de la politique avant le fichier (ordre imposé par S3),
  géré par `features/uploads/client.ts`.
