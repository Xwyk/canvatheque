# syntax=docker/dockerfile:1.7
# Image de production Canvathèque : Next.js standalone sur Node LTS Alpine.

ARG NODE_IMAGE=node:24-alpine

# --- Dépendances complètes (build) ---
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# --- Build ---
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- Outils d'exploitation : CLI Prisma pour `migrate deploy` ---
FROM ${NODE_IMAGE} AS ops
WORKDIR /app/ops
COPY docker/ops/package.json docker/ops/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# --- Exécution ---
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache libc6-compat tini wget

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=ops --chown=node:node /app/ops ./ops
COPY --chown=node:node docker/ops/prisma.config.ts ./ops/prisma.config.ts
COPY --chown=node:node scripts/docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
