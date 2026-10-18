#!/bin/sh
# Démarrage du conteneur : migrations puis serveur.
# Le compte administrateur et le compte système sont garantis au démarrage du
# serveur (instrumentation.ts → lib/startup.ts), avec validation des variables.
set -eu

echo "[entrypoint] Application des migrations…"
(cd /app/ops && node node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts)

echo "[entrypoint] Démarrage du serveur"
exec "$@"
