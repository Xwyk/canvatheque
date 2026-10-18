#!/bin/sh
# Sauvegarde complète : base PostgreSQL (format custom) + objets des deux buckets.
# Usage : scripts/backup.sh [dossier_de_destination]   (défaut : ./backups)
# À lancer depuis la racine du projet, pile démarrée. Planifiable en cron.
set -eu

COMPOSE="docker compose -f docker-compose.yml"
DEST_ROOT="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$DEST_ROOT/$STAMP"
mkdir -p "$DEST/objects"

echo "[backup] Base de données → $DEST/database.dump"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/database.dump"

echo "[backup] Objets → $DEST/objects"
$COMPOSE run --rm --no-deps -v "$(cd "$DEST/objects" && pwd):/backup" --entrypoint sh minio-init -c '
  set -eu
  mc alias set local "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  for bucket in "$S3_BUCKET_MODELS" "$S3_BUCKET_PREVIEWS"; do
    mc mirror --quiet --overwrite "local/$bucket" "/backup/$bucket"
  done'

echo "[backup] Terminé : $DEST"
