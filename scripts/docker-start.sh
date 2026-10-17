#!/bin/sh
# Subida do container (Coolify): aplica as migrações do Prisma e inicia o Next.
# Na Vercel isso acontece no build (npm run build); aqui o build não tem banco.
set -e
node scripts/migrate.mjs
exec node server.js
