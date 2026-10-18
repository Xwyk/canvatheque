#!/bin/sh
# Restauration d'une sauvegarde produite par scripts/backup.sh.
# Usage : scripts/restore.sh backups/20261018T120000Z
# ATTENTION : remplace le contenu actuel de la base et des buckets.
set -eu

SRC="${1:?Usage : scripts/restore.sh <dossier_de_sauvegarde>}"
[ -f "$SRC/database.dump" ] || { echo "Sauvegarde introuvable : $SRC/database.dump" >&2; exit 1; }

COMPOSE="docker compose -f docker-compose.yml"
printf "Restaurer %s et écraser les données actuelles ? Tapez « oui » : " "$SRC"
read -r answer
[ "$answer" = "oui" ] || { echo "Abandon."; exit 1; }

echo "[restore] Arrêt de l'application"
$COMPOSE stop app

echo "[restore] Base de données"
$COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$SRC/database.dump"

echo "[restore] Objets"
$COMPOSE run --rm --no-deps -v "$(cd "$SRC/objects" && pwd):/backup:ro" --entrypoint sh minio-init -c '
  set -eu
  mc alias set local "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  for bucket in "$S3_BUCKET_MODELS" "$S3_BUCKET_PREVIEWS"; do
    mc mb --ignore-existing "local/$bucket"
    if [ -d "/backup/$bucket" ]; then
      mc mirror --quiet --overwrite --remove "/backup/$bucket" "local/$bucket"
    fi
  done'

echo "[restore] Redémarrage"
$COMPOSE up -d app
echo "[restore] Terminé."
