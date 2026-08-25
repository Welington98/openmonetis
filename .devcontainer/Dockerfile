# Imagem de desenvolvimento — não é a imagem de produção (ver Dockerfile na raiz).
# Baseada na imagem oficial de devcontainers para Node, já com usuário non-root
# "node", git, zsh/oh-my-zsh e ferramentas comuns de desenvolvimento pré-instaladas.
FROM mcr.microsoft.com/devcontainers/typescript-node:2-22-bookworm

ARG PNPM_VERSION=11.1.3

# psql/pg_isready para inspecionar o Postgres do serviço "db" a partir do container
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
	&& rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Garante que os diretórios usados pelos volumes nomeados (node_modules, pnpm store)
# já existem com o dono correto antes do volume ser montado por cima — volumes
# nomeados novos herdam a permissão do diretório da imagem na primeira montagem.
RUN mkdir -p /home/node/.local/share/pnpm/store /workspace/node_modules \
	&& chown -R node:node /home/node/.local/share/pnpm /workspace

USER node
