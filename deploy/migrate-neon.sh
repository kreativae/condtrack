#!/bin/sh
# Copia o banco do Neon para o Postgres do Coolify. Pode rodar quantas vezes
# quiser: cada execução apaga o destino e copia de novo. O Neon não é alterado.
#
# No servidor, dentro de um container com o cliente do Postgres 18 (a versão do Neon):
#   curl -fsSLO https://raw.githubusercontent.com/kreativae/condtrack/server/deploy/migrate-neon.sh
#   docker run --rm -it --network coolify -v "$PWD":/w -w /w postgres:18-alpine sh migrate-neon.sh
set -eu

printf "URL do Neon (conexão DIRETA, sem -pooler): "; stty -echo 2>/dev/null || true; read -r SRC; stty echo 2>/dev/null || true; echo
printf "URL do Postgres do Coolify (interna): ";     stty -echo 2>/dev/null || true; read -r DST; stty echo 2>/dev/null || true; echo

for u in "$SRC" "$DST"; do
  case "$u" in
    postgres://*|postgresql://*) ;;
    *) echo "URL inválida: precisa começar com postgresql:// (cole de novo, sem apertar outras teclas antes)."; exit 1 ;;
  esac
done

echo "== Origem:  $(psql "$SRC" -Atc "select current_user || ' · ' || version()")"
echo "== Destino: $(psql "$DST" -Atc "select current_user || ' · ' || version()")"

printf "Isto APAGA tudo no destino e copia o Neon. Digite SIM para continuar: "; read -r OK
[ "$OK" = "SIM" ] || { echo "Cancelado."; exit 1; }

echo "== Limpando o destino"
psql "$DST" -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE" -c "CREATE SCHEMA public"

echo "== Copiando dados (pode levar alguns minutos)"
# Sem donos nem permissões do Neon: tudo fica com o usuário do Coolify, que é o
# mesmo da DATABASE_URL do app
pg_dump "$SRC" --schema=public --no-owner --no-privileges --no-subscriptions --no-publications -f /tmp/neon.sql
psql "$DST" -q -f /tmp/neon.sql > /dev/null 2> /tmp/erros.log || true

echo "== Conferindo"
for t in '"User"' '"Condominium"' '"ServiceOrder"' '_prisma_migrations'; do
  a=$(psql "$SRC" -Atc "select count(*) from $t" 2>/dev/null || echo "-")
  b=$(psql "$DST" -Atc "select count(*) from $t" 2>/dev/null || echo "-")
  echo "$t — Neon: $a · Coolify: $b"
done
echo "Tabelas — Neon: $(psql "$SRC" -Atc "select count(*) from information_schema.tables where table_schema = 'public'") · Coolify: $(psql "$DST" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"

ERR=$(grep -c ERROR /tmp/erros.log || true)
echo "Erros na importação: $ERR"
[ "$ERR" = "0" ] || { echo "-- Primeiros erros (sem dados sensíveis):"; grep ERROR /tmp/erros.log | sort | uniq -c | head -20; }
echo "Pronto."
