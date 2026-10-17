# Imagem de produção para o Coolify (Hetzner). A Vercel ignora este arquivo.
# Build: docker build -t condtrack .   ·   Run: docker run -p 3000:3000 --env-file .env condtrack

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
# O postinstall roda o "prisma generate" (por isso o schema vem antes)
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# O build não conecta no banco: as migrações rodam quando o container inicia
# (scripts/docker-start.sh). Valores reais chegam em tempo de execução (Coolify).
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG AUTH_SECRET=build-only-secret-not-used-at-runtime
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV DATABASE_URL=$DATABASE_URL \
    DATABASE_URL_UNPOOLED=$DATABASE_URL \
    AUTH_SECRET=$AUTH_SECRET \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN npx prisma generate && npx next build
# CLI do Prisma (mesma versão do projeto) com as dependências dela, para as
# migrações na subida do container; o standalone só leva o cliente
RUN mkdir /cli && cd /cli && npm init -y >/dev/null \
 && npm i --no-audit --no-fund prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrações na subida do container: schema, CLI do Prisma e o cliente gerado
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /cli/node_modules ./prisma-cli/node_modules
RUN mkdir -p node_modules/.bin && ln -sf ../../prisma-cli/node_modules/prisma/build/index.js node_modules/.bin/prisma
# Scripts de manutenção (migrate.mjs, migrate-blob.mjs) e a pasta dos uploads
# (monte um volume persistente em /app/storage e defina UPLOAD_DIR=/app/storage)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/sw.js >/dev/null || exit 1
CMD ["sh", "scripts/docker-start.sh"]
