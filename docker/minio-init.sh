#!/bin/sh
# Initialise MinIO (idempotent) : buckets, accès public en lecture des aperçus,
# expiration des envois temporaires non confirmés (préfixe uploads/).
set -eu

mc alias set local "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"

LIFECYCLE=/tmp/lifecycle.json
cat > "$LIFECYCLE" <<'JSON'
{
  "Rules": [
    {
      "ID": "expire-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "uploads/" },
      "Expiration": { "Days": 1 }
    }
  ]
}
JSON

for bucket in "$S3_BUCKET_MODELS" "$S3_BUCKET_PREVIEWS"; do
  mc mb --ignore-existing "local/$bucket"
  mc ilm import "local/$bucket" < "$LIFECYCLE"
done

# Les aperçus sont publics (lecture seule) ; les fichiers modèles restent privés.
mc anonymous set download "local/$S3_BUCKET_PREVIEWS"
mc anonymous set none "local/$S3_BUCKET_MODELS"

echo "MinIO prêt."
