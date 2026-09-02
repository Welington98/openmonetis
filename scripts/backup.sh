#!/bin/bash
# ==============================================================
# openmonetis-backup.sh
# Backup automático do PostgreSQL para Google Drive via rclone
# Suporta: banco remoto (Supabase/etc) ou Docker local
# ==============================================================
set -euo pipefail
export TZ="America/Sao_Paulo"

# Raiz do projeto (um nível acima de scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$PROJECT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
else
  echo "ERRO: .env não encontrado em $PROJECT_DIR" >&2
  exit 1
fi

# ============================================================
# CONFIGURAÇÃO — ajuste aqui
# ============================================================

# Modo de conexão: "remote" (Supabase/URL) ou "docker" (container local)
DB_MODE="remote"

# --- Modo remote ---
# Usa DATABASE_URL do .env (porta 6543 funciona com --no-owner --no-privileges)
REMOTE_DB_URL="${DATABASE_URL}"

# --- Modo docker ---
DOCKER_CONTAINER="openmonetis_postgres"
DOCKER_DB_NAME="openmonetis_db"
DOCKER_DB_USER="openmonetis"

# --- Destino e retenção ---
BACKUP_DIR="$PROJECT_DIR/backup"
GDRIVE_REMOTE="gdrive:BACKUP OPENMONETIS"
RETENTION_LOCAL_DAYS=7
RETENTION_REMOTE_DAYS=30

# ============================================================
# SCRIPT — não alterar abaixo
# ============================================================

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"

DUMP_FILE="$BACKUP_DIR/openmonetis_${TIMESTAMP}.dump"
SQL_FILE="$BACKUP_DIR/openmonetis_${TIMESTAMP}.sql.gz"
DATA_FILE="$BACKUP_DIR/openmonetis_${TIMESTAMP}.data.sql.gz"

log "Iniciando backup (modo: $DB_MODE)..."

# Schemas relevantes do OpenMonetis (descarta lixo Supabase: auth, realtime, storage, vault, graphql, etc.)
SCHEMA_FLAGS=(--schema=public --schema=drizzle)

# --- Dump ---
if [[ "$DB_MODE" == "remote" ]]; then
  # --no-owner --no-privileges: necessário no Supabase (roles gerenciados internamente)
  pg_dump --format=custom --no-owner --no-privileges \
    "${SCHEMA_FLAGS[@]}" \
    "$REMOTE_DB_URL" > "$DUMP_FILE"

  pg_dump --no-owner --no-privileges \
    "${SCHEMA_FLAGS[@]}" \
    "$REMOTE_DB_URL" | gzip > "$SQL_FILE"

elif [[ "$DB_MODE" == "docker" ]]; then
  docker exec "$DOCKER_CONTAINER" pg_dump \
    -U "$DOCKER_DB_USER" -Fc "${SCHEMA_FLAGS[@]}" "$DOCKER_DB_NAME" > "$DUMP_FILE"

  docker exec "$DOCKER_CONTAINER" pg_dump \
    -U "$DOCKER_DB_USER" "${SCHEMA_FLAGS[@]}" "$DOCKER_DB_NAME" | gzip > "$SQL_FILE"

else
  log "ERRO: DB_MODE inválido ('$DB_MODE'). Use 'remote' ou 'docker'."
  exit 1
fi

# Extrai dados puros do dump custom (sem nova conexão ao banco).
# Em modo docker, usa o pg_restore de DENTRO do container: o arquivo foi
# gerado pelo pg_dump do próprio container e pode estar num formato mais
# novo do que o pg_restore instalado no host entende.
if [[ "$DB_MODE" == "docker" ]]; then
  docker exec -i "$DOCKER_CONTAINER" pg_restore \
    --data-only --schema=public --no-owner --no-privileges \
    -f - < "$DUMP_FILE" | gzip > "$DATA_FILE"
else
  pg_restore --data-only --schema=public --no-owner --no-privileges \
    -f - "$DUMP_FILE" | gzip > "$DATA_FILE"
fi

log "Dump concluído: $(du -sh "$DUMP_FILE" | cut -f1) (.dump) | $(du -sh "$SQL_FILE" | cut -f1) (.sql.gz) | $(du -sh "$DATA_FILE" | cut -f1) (.data.sql.gz)"

# --- Upload para Google Drive ---
if ! command -v rclone &>/dev/null; then
  log "AVISO: rclone não encontrado. Pulando upload."
else
  rclone copy "$BACKUP_DIR" "$GDRIVE_REMOTE" \
    --include "openmonetis_${TIMESTAMP}*"
  log "Upload concluído → $GDRIVE_REMOTE"

  # Limpeza remota
  rclone delete "$GDRIVE_REMOTE" \
    --min-age "${RETENTION_REMOTE_DAYS}d" \
    --include "openmonetis_*"
  log "Limpeza remota: mantidos últimos $RETENTION_REMOTE_DAYS dias."
fi

# --- Limpeza local ---
find "$BACKUP_DIR" -name "openmonetis_*" -mtime +"$RETENTION_LOCAL_DAYS" -delete
log "Limpeza local: mantidos últimos $RETENTION_LOCAL_DAYS dias."

log "Backup finalizado com sucesso."
