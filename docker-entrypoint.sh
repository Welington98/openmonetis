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
  # --force: sem essa flag, uma mudança "arriscada" (nova coluna NOT NULL,
  # tabela nova) faz o push pedir confirmação interativa por seleção de
  # setas — não há terminal pra responder dentro do container, então o
  # diff fica silenciosamente sem aplicar enquanto o resto do comando
  # segue normalmente. --force aprova essas mudanças automaticamente,
  # tornando o push determinístico sem TTY.
  if NODE_PATH=/app/migrate/node_modules /app/migrate/node_modules/.bin/drizzle-kit push --force; then
    MIGRATED=1
    break
  fi
  echo "Tentativa $i/5 falhou. Aguardando 5s..."
  sleep 5
done

if [ "$MIGRATED" -eq 0 ]; then
  echo "ERRO FATAL: migrations não foram aplicadas após 5 tentativas. Abortando para não subir a aplicação com o schema desatualizado."
  exit 1
fi

exec "$@"
