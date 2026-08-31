#!/bin/sh

# Monta DATABASE_URL a partir de POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB
# quando não vier setado (ou vier vazio) pelo compose/host. Feito aqui via
# expansão de parâmetro POSIX (":=") em vez de interpolação aninhada do
# Compose porque essa última não é suportada de forma consistente entre
# versões do Docker Compose.
: "${DATABASE_URL:=postgresql://${POSTGRES_USER:-openmonetis}:${POSTGRES_PASSWORD:-openmonetis_dev_password}@db:5432/${POSTGRES_DB:-openmonetis_db}}"
export DATABASE_URL

echo "Rodando migrations..."
MIGRATED=0
for i in 1 2 3 4 5; do
  if NODE_PATH=/app/migrate/node_modules /app/migrate/node_modules/.bin/drizzle-kit push; then
    MIGRATED=1
    break
  fi
  echo "Tentativa $i/5 falhou. Aguardando 5s..."
  sleep 5
done

[ "$MIGRATED" -eq 0 ] && echo "Aviso: migrations não foram aplicadas."

exec "$@"
